import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { conversationStore, Booking } from "@/lib/store/conversations";
import { sendSplitMessage } from "@/lib/happytalk/send-message";
import { sendImageMessage } from "@/lib/happytalk/client";

const REMINDER_MESSAGE = `[자동발송]
안녕하세요, 커버링입니다 :)

내일 방문수거 예약이 잡혀 있어 안내드립니다.
수거 방문 전 다시 한번 연락드리겠습니다.

🎁 수거 후 후기 남기시면 최대 4만원 페이백!
첨부된 이미지 또는 아래 링크에서 자세한 안내를 확인해 주세요.
👉 https://buly.kr/Ygapfc

감사합니다 😊`;

const PAYBACK_IMAGE_URL = "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/guide/payback_event.png";

/**
 * 페이백 이벤트 이미지를 해피톡에 업로드하고 image url 반환.
 * cron 1회 실행마다 한 번만 호출 — 모든 대상이 같은 url 재사용.
 */
async function uploadPaybackImageToHappytalk(senderKey: string): Promise<string | null> {
  try {
    const apiHost = process.env.HAPPYTALK_API_HOST;
    if (!apiHost) return null;

    const imgRes = await fetch(PAYBACK_IMAGE_URL);
    if (!imgRes.ok) {
      console.error(`[auto-reminder] 이미지 fetch 실패: ${imgRes.status}`);
      return null;
    }
    const blob = await imgRes.blob();
    const file = new File([blob], "payback_event.png", { type: "image/png" });
    const fd = new FormData();
    fd.append("sender_key", senderKey);
    fd.append("image", file);

    const uploadRes = await fetch(`${apiHost}/kakaoWebhook/v3/bzc/image/upload`, {
      method: "POST",
      headers: {
        "HT-Client-Id": process.env.HT_CLIENT_ID!,
        "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
      },
      body: fd,
    });
    const result = await uploadRes.json();
    if (result.code === "0000" && result.image) return result.image as string;
    console.error("[auto-reminder] 해피톡 이미지 업로드 실패:", result);
    return null;
  } catch (err) {
    console.error("[auto-reminder] 이미지 업로드 오류:", err);
    return null;
  }
}

/**
 * [CS-NTF-013] 리마인드 자동 발송 크론
 * 매일 오후 6시(KST) — 내일 수거 예정 건에 리마인드 메시지 + 페이백 이벤트 이미지 자동 발송
 */
export async function GET(): Promise<NextResponse> {
  try {
    // KST 기준 내일
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kst);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // orders에서 내일 수거 예정 + 활성 상태
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, session_id, customer_name, phone")
      .eq("date", tomorrowStr)
      .in("status", ["confirmed", "payment_requested", "prepaid"]);

    if (error) throw error;
    if (!orders || orders.length === 0) {
      console.log("[auto-reminder] 대상 없음");
      return NextResponse.json({ sent: 0, total: 0, date: tomorrowStr });
    }

    // 페이백 이미지 1회 업로드 (모든 대상 공통 sender_key 가정 — 방문수거 채널)
    let paybackImageUrl: string | null = null;
    const firstConv = await conversationStore.getById(orders.find((o) => o.session_id)?.session_id ?? "");
    if (firstConv?.senderKey) {
      paybackImageUrl = await uploadPaybackImageToHappytalk(firstConv.senderKey);
      if (paybackImageUrl) console.log(`[auto-reminder] 페이백 이미지 업로드 OK: ${paybackImageUrl.slice(0, 80)}…`);
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const o of orders) {
      if (!o.session_id) { skipped++; continue; }

      try {
        const conv = await conversationStore.getById(o.session_id);
        if (!conv) { skipped++; continue; }

        // 이미 리마인드 발송된 건 스킵
        if (conv.booking?.reminderSentAt) { skipped++; continue; }

        await sendSplitMessage({
          user_key: conv.userKey,
          sender_key: conv.senderKey,
          message: REMINDER_MESSAGE,
        });
        await conversationStore.addAssistantMessage(o.session_id, REMINDER_MESSAGE, "리마인드봇", false);

        // 페이백 이미지 — 업로드 성공한 경우에만
        if (paybackImageUrl) {
          try {
            await sendImageMessage({
              user_key: conv.userKey,
              sender_key: conv.senderKey,
              imageUrl: paybackImageUrl,
            });
            await conversationStore.addAssistantMessage(
              o.session_id,
              "[페이백 이벤트 안내]",
              "리마인드봇",
              false,
              "image",
              PAYBACK_IMAGE_URL,
            );
          } catch (imgErr) {
            console.error(`[auto-reminder] 이미지 발송 실패 ${o.session_id}:`, imgErr);
          }
        }

        // reminderSentAt 기록
        const updatedBooking: Booking = {
          ...(conv.booking ?? {
            customerName: "", phone: "", address: "", floor: 0,
            hasElevator: false, hasParking: false, ladderNeeded: false,
            preferredDate: "", preferredTime: "",
            confirmedAt: null, reminderSentAt: null, specialNotes: "",
          }),
          reminderSentAt: Date.now(),
        };
        await conversationStore.updateBooking(o.session_id, updatedBooking);
        sent++;
      } catch {
        failed++;
      }
    }

    console.log(`[auto-reminder] ${tomorrowStr}: 대상=${orders.length} 발송=${sent} 스킵=${skipped} 실패=${failed}`);
    return NextResponse.json({ date: tomorrowStr, total: orders.length, sent, skipped, failed, paybackImageOk: !!paybackImageUrl });
  } catch (e) {
    console.error("[auto-reminder] 오류:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
