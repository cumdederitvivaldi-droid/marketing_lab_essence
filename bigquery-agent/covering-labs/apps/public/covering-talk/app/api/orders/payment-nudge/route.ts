import { NextRequest, NextResponse } from "next/server";
import { orderStore } from "@/lib/store/orders";
import { sendImageMessage, sendPlainMessage } from "@/lib/happytalk/client";
import { supabase } from "@/lib/supabase/client";
import { conversationStore } from "@/lib/store/conversations";
import { nicepayPayUrl } from "@/lib/nicepay/client";

const API_HOST = process.env.HAPPYTALK_API_HOST;
const PAYMENT_IMAGE_URL =
  "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/guide/payment.png";

// [CS-ORD-009] 주문 결제 넛지 일괄 발송 (이미지 + 텍스트)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { ids } = (await request.json()) as { ids: string[] };

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: "발송 대상이 없습니다" }, { status: 400 });
    }

    const results: Array<{
      id: string;
      customerName: string;
      date: string;
      success: boolean;
      message: string;
    }> = [];

    // 결제 넛지 이미지를 1회만 다운로드
    let imageBlob: Blob | null = null;
    try {
      const imgRes = await fetch(PAYMENT_IMAGE_URL);
      if (imgRes.ok) imageBlob = await imgRes.blob();
    } catch {
      console.error("[payment-nudge] 이미지 다운로드 실패");
    }

    for (const id of ids) {
      let order: Awaited<ReturnType<typeof orderStore.getById>> = null;
      try {
        order = await orderStore.getById(id);
        if (!order) {
          results.push({ id, customerName: "?", date: "", success: false, message: "주문을 찾을 수 없음" });
          continue;
        }

        // 1단계: session_id로 대화 찾기
        let sessionId: string | null = order.sessionId;

        // 2단계 fallback: 전화번호로 대화 찾기
        if (!sessionId) {
          const phone = order.phone.replace(/[^0-9]/g, "");
          if (phone && phone.length >= 10) {
            const { data: convRow } = await supabase
              .from("conversations")
              .select("session_id")
              .eq("phone", phone)
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (convRow) sessionId = convRow.session_id;
          }
        }

        if (!sessionId) {
          results.push({
            id,
            customerName: order.customerName,
            date: order.date,
            success: false,
            message: "대화 세션 없음",
          });
          continue;
        }

        // 대화에서 user_key, sender_key 가져오기
        const { data: conv } = await supabase
          .from("conversations")
          .select("user_key, sender_key")
          .eq("session_id", sessionId)
          .single();

        if (!conv) {
          results.push({
            id,
            customerName: order.customerName,
            date: order.date,
            success: false,
            message: "대화 정보 없음",
          });
          continue;
        }

        const { user_key, sender_key } = conv;

        // 이미지 업로드 + 발송
        if (imageBlob) {
          try {
            const file = new File([imageBlob], "payment.png", { type: "image/png" });
            const htFormData = new FormData();
            htFormData.append("sender_key", sender_key);
            htFormData.append("image", file);

            const uploadRes = await fetch(
              `${API_HOST}/kakaoWebhook/v3/bzc/image/upload`,
              {
                method: "POST",
                headers: {
                  "HT-Client-Id": process.env.HT_CLIENT_ID!,
                  "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
                },
                body: htFormData,
              }
            );
            const uploadResult = await uploadRes.json();

            if (uploadResult.code === "0000") {
              await sendImageMessage({
                user_key,
                sender_key,
                imageUrl: uploadResult.image,
              });

              await conversationStore.addAssistantMessage(
                sessionId,
                "[결제 안내 이미지]",
                "시스템",
                false,
                "image",
                uploadResult.image
              );
            }
          } catch (err) {
            console.warn(`[payment-nudge] 이미지 발송 실패 (${order.customerName}):`, err);
          }
        }

        // 결제 안내 텍스트 발송
        const dateFormatted = formatDate(order.date);
        const amount = order.totalPrice;
        const latestReqId = order.paymentIds?.[order.paymentIds.length - 1]?.reqId;
        const linkLine = latestReqId ? `결제 링크: ${nicepayPayUrl(latestReqId)}\n\n` : "";
        const nudgeText =
          `안녕하세요, 커버링입니다 :)\n\n` +
          `${dateFormatted} 수거 서비스를 이용해 주셔서 감사합니다.\n\n` +
          `아직 결제가 완료되지 않아 안내드립니다.\n` +
          (amount ? `결제 금액: ${amount.toLocaleString()}원\n` : "") +
          linkLine +
          `결제 진행 부탁드리며, 결제 과정에서 문제가 있으시면 편하게 말씀해 주세요!`;

        await sendPlainMessage({
          user_key,
          sender_key,
          message: nudgeText,
        });

        await conversationStore.addAssistantMessage(
          sessionId,
          nudgeText,
          "시스템",
          false
        );

        results.push({
          id,
          customerName: order.customerName,
          date: order.date,
          success: true,
          message: "발송 완료",
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const isSessionExpired =
          errMsg.includes("InvalidSessionException") || errMsg.includes("InvalidSession");
        results.push({
          id,
          customerName: order?.customerName ?? "?",
          date: order?.date ?? "",
          success: false,
          message: isSessionExpired ? "고객이 대화방을 나갔습니다" : errMsg,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({ ok: true, successCount, failCount, results });
  } catch (err) {
    console.error("[payment-nudge] error:", err);
    return NextResponse.json({ error: "결제 넛지 발송 중 오류" }, { status: 500 });
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
