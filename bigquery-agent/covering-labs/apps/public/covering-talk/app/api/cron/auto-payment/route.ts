import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase/client";
import { createPaymentLink, nicepayPayUrl } from "@/lib/nicepay/client";
import { orderStore, type PaymentEntry } from "@/lib/store/orders";
import { sendImageMessage, sendPlainMessage } from "@/lib/happytalk/client";
import { conversationStore } from "@/lib/store/conversations";
import { getDeadlineUtc } from "@/lib/orders/visit-start-time";

const API_HOST = process.env.HAPPYTALK_API_HOST;
const PAYMENT_IMAGE_URL =
  "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/guide/payment.png";

/**
 * [CS-ETC-027] 당일 일정확정 건 자동 결제 요청
 *
 * 매일 오후 8시(KST) 실행:
 * 1. orders 테이블에서 date = 오늘 & status = confirmed 조회
 * 2. payment_ids가 이미 있는 건은 스킵 (중복 방지)
 * 3. NicePay 결제 링크 생성 → 카카오톡(sendType=2)으로 발송
 * 4. 상태를 payment_requested로 변경
 */
export async function GET(): Promise<NextResponse> {
  const startTime = Date.now();

  // KST 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = kst.toISOString().split("T")[0]; // "2026-04-08"

  console.log(`[auto-payment] 시작: ${today} 일정확정 건 자동 결제 요청`);

  try {
    // 당일 일정확정(confirmed) 건 조회
    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("date", today)
      .eq("status", "confirmed");

    if (error) {
      console.error("[auto-payment] 조회 오류:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      console.log("[auto-payment] 대상 없음");
      return NextResponse.json({ ok: true, message: "대상 없음", sent: 0, skipped: 0 });
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const results: { id: string; name: string; status: string; reason?: string }[] = [];

    // 결제 안내 이미지 1회만 업로드 (sender_key별 캐시)
    const uploadedImageMap = new Map<string, string>(); // sender_key → uploaded imageUrl
    async function getUploadedImage(sender_key: string): Promise<string | null> {
      if (uploadedImageMap.has(sender_key)) return uploadedImageMap.get(sender_key)!;
      try {
        const imgRes = await fetch(PAYMENT_IMAGE_URL);
        if (!imgRes.ok) return null;
        const blob = await imgRes.blob();
        const file = new File([blob], "payment.png", { type: "image/png" });
        const form = new FormData();
        form.append("sender_key", sender_key);
        form.append("image", file);
        const uploadRes = await fetch(`${API_HOST}/kakaoWebhook/v3/bzc/image/upload`, {
          method: "POST",
          headers: { "HT-Client-Id": process.env.HT_CLIENT_ID!, "HT-Client-Secret": process.env.HT_CLIENT_SECRET! },
          body: form,
        });
        const r = await uploadRes.json();
        if (r.code === "0000" && r.image) {
          uploadedImageMap.set(sender_key, r.image);
          console.log(`[auto-payment] 이미지 업로드 성공: ${r.image}`);
          return r.image;
        }
        console.error(`[auto-payment] 이미지 업로드 실패:`, r);
        return null;
      } catch (e) {
        console.error(`[auto-payment] 이미지 업로드 예외:`, e);
        return null;
      }
    }

    for (const row of orders) {
      const orderId = row.id;
      const customerName = row.customer_name || "고객";
      const amount = row.total_price;
      const phone = (row.phone || "").replace(/[^0-9]/g, "");
      const paymentIds: PaymentEntry[] = row.payment_ids ?? [];

      // ── 중복 방지: 이미 결제 요청된 건 스킵 ──
      if (paymentIds.length > 0) {
        console.log(`[auto-payment] 스킵 (이미 발송): ${customerName} (${orderId})`);
        results.push({ id: orderId, name: customerName, status: "skipped", reason: "이미 결제 발송됨" });
        skipped++;
        continue;
      }

      // 금액 검증
      if (!amount || amount <= 0) {
        results.push({ id: orderId, name: customerName, status: "skipped", reason: "금액 없음" });
        skipped++;
        continue;
      }

      // 연락처 검증
      if (!phone || phone.length < 10) {
        results.push({ id: orderId, name: customerName, status: "skipped", reason: "연락처 없음" });
        skipped++;
        continue;
      }

      // ── NicePay 결제 링크 생성 ──
      try {
        // §6.1 — 방문 시작 - 12h 의 날짜를 limit 로. NicePay 는 최대 7일 cap.
        const deadline = getDeadlineUtc(row.date, row.time_slot, 12);
        const sevenDaysOut = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; })();
        const limitDate = (() => {
          const target = deadline ?? sevenDaysOut;
          if (target.getTime() < Date.now()) {
            const tm = new Date(); tm.setDate(tm.getDate() + 1); return tm;
          }
          if (target.getTime() > sevenDaysOut.getTime()) {
            return sevenDaysOut;
          }
          return target;
        })();
        const kst = new Date(limitDate.getTime() + 9 * 60 * 60 * 1000);
        const payLimitDate = kst.toISOString().slice(0, 10).replace(/-/g, "");
        const moid = `ORD${Date.now()}${crypto.randomBytes(4).toString("hex")}`;

        const result = await createPaymentLink({
          goodsName: "커버링 방문수거",
          amount,
          orderId: moid,
          buyerName: customerName,
          buyerPhone: phone,
          sendType: "2", // 카카오톡
          payLimitDate,
        });

        if (!result.success) {
          console.error(`[auto-payment] NicePay 실패: ${customerName}`, result.errorMessage);
          results.push({ id: orderId, name: customerName, status: "failed", reason: result.errorMessage || "NicePay 오류" });
          failed++;
          continue;
        }

        // payment_ids에 추가
        await orderStore.addPaymentId(orderId, {
          reqId: result.reqId!,
          payUrl: result.payUrl,
          sentAt: new Date().toISOString(),
        });

        // 상태 → payment_requested
        await orderStore.update(orderId, { status: "payment_requested" });

        // ── 결제 안내 메시지 발송 (이미지 + 텍스트) ──
        const sessionId = row.session_id;
        if (sessionId) {
          try {
            const { data: conv } = await supabase
              .from("conversations")
              .select("user_key, sender_key")
              .eq("session_id", sessionId)
              .single();

            if (conv) {
              const { user_key, sender_key } = conv;

              // 이미지 발송 (sender_key별 1회 업로드, 재사용)
              let imageSent = false;
              const uploadedUrl = await getUploadedImage(sender_key);
              if (uploadedUrl) {
                try {
                  await sendImageMessage({ user_key, sender_key, imageUrl: uploadedUrl });
                  await conversationStore.addAssistantMessage(sessionId, "[결제 안내 이미지]", "시스템", false, "image", uploadedUrl);
                  imageSent = true;
                } catch (imgErr) {
                  console.warn(`[auto-payment] 이미지 전송 실패: ${customerName}`, imgErr);
                }
              }

              // 텍스트 발송 (이미지 성공 여부에 따라 문구 분기)
              const imageRef = imageSent ? "\n자세한 내용은 이미지를 참고 부탁드립니다." : "";
              const linkLine = result.reqId ? `\n결제 링크: ${nicepayPayUrl(result.reqId)}\n` : "";
              const nudgeText = `안녕하세요, 커버링입니다 :)\n\n예약하신 방문수거 결제 안내드립니다.\n\n결제 금액: ${amount.toLocaleString()}원\n${linkLine}\n나이스 링크페이를 통해 결제 부탁드립니다.\n방문 12시간 전까지 결제가 완료되지 않으면 예약이 자동 취소됩니다.${imageRef}\n결제 과정에서 문제가 있으시면 언제든 말씀해 주세요 :)`;
              await sendPlainMessage({ user_key, sender_key, message: nudgeText });
              await conversationStore.addAssistantMessage(sessionId, nudgeText, "시스템", false);
              console.log(`[auto-payment] 안내 발송: ${customerName} (이미지=${imageSent})`);
            }
          } catch (nudgeErr) {
            console.warn(`[auto-payment] 안내 발송 실패: ${customerName}`, nudgeErr);
          }
        }

        console.log(`[auto-payment] 발송 성공: ${customerName} (${amount.toLocaleString()}원)`);
        results.push({ id: orderId, name: customerName, status: "sent" });
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[auto-payment] 발송 오류: ${customerName}`, msg);
        results.push({ id: orderId, name: customerName, status: "failed", reason: msg });
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[auto-payment] 완료: 발송=${sent}, 스킵=${skipped}, 실패=${failed} (${duration}ms)`);

    return NextResponse.json({
      ok: true,
      date: today,
      total: orders.length,
      sent,
      skipped,
      failed,
      results,
      duration,
    });
  } catch (err) {
    console.error("[auto-payment] 치명적 오류:", err);
    return NextResponse.json({ error: "자동 결제 요청 실패" }, { status: 500 });
  }
}
