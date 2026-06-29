// §6.1 100% 선결제 — 예약 확정 즉시 NicePay 링크 발급 + 카카오톡 발송.
//   auto-payment cron 의 동일 로직을 함수화. payLimitDate 는 방문 시각 - 12h 기준 동적 계산.
//   feature flag(prepayment_enabled) 게이팅은 호출 측 책임.

import crypto from "crypto";
import { supabase } from "@/lib/supabase/client";
import { createPaymentLink, nicepayPayUrl } from "@/lib/nicepay/client";
import { orderStore, type Order, type PaymentEntry } from "@/lib/store/orders";
import { sendImageMessage, sendPlainMessage } from "@/lib/happytalk/client";
import { conversationStore } from "@/lib/store/conversations";
import { auditStore } from "@/lib/store/audit-logs";
import { getDeadlineUtc } from "@/lib/orders/visit-start-time";

const NICEPAY_RETRY_MAX = 3;
const NICEPAY_RETRY_DELAY_MS = 1000;

const API_HOST = process.env.HAPPYTALK_API_HOST;
const PAYMENT_IMAGE_URL =
  "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/guide/payment.png";

const uploadedImageMap = new Map<string, string>();

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
      return r.image;
    }
    return null;
  } catch {
    return null;
  }
}

export interface IssuePrepaymentResult {
  success: boolean;
  reqId?: string;
  payUrl?: string;
  /** NicePay 결제 페이지 URL (고객용 short link) */
  payShortUrl?: string;
  amount?: number;
  reason?: string;
}

export interface IssuePrepaymentOptions {
  /** true(기본): NicePay 이미지+텍스트 안내 메시지 별도 발송. false: 링크만 발급(메시지는 호출 측에서 처리). */
  sendNotification?: boolean;
}

/**
 * 단일 주문에 선결제 링크 발급 (+ 옵션에 따라 안내 메시지 발송).
 * 1) 이미 payment_ids 가 있으면 스킵
 * 2) NicePay 링크 생성 (payLimitDate = 방문 시작 - 12h 의 날짜, 최소 오늘)
 * 3) orders.payment_ids push + status = payment_requested
 * 4) sendNotification=true 면 해피톡 이미지+텍스트 발송
 */
export async function issuePrepaymentLink(
  order: Order,
  opts: IssuePrepaymentOptions = {},
): Promise<IssuePrepaymentResult> {
  const sendNotification = opts.sendNotification ?? true;
  if (!order.totalPrice || order.totalPrice <= 0) {
    return { success: false, reason: "금액 없음" };
  }
  const phoneDigits = (order.phone || "").replace(/[^0-9]/g, "");
  if (!phoneDigits || phoneDigits.length < 10) {
    return { success: false, reason: "연락처 없음" };
  }
  if ((order.paymentIds?.length ?? 0) > 0) {
    return { success: false, reason: "이미 결제 발송됨" };
  }

  // payLimitDate: 방문 시각 - 12h 의 날짜. NicePay 는 최대 7일까지만 허용 → 7일 cap.
  //   방문이 7일 이상 후면 link 가 먼저 만료될 수 있어 운영 상 재발급 필요할 수 있음
  //   (auto-payment cron / 상담사 수동 재발송 으로 cover).
  const deadline = getDeadlineUtc(order.date, order.timeSlot, 12);
  const sevenDaysOut = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; })();
  const limitDate = (() => {
    const target = deadline ?? sevenDaysOut;
    // 1) 이미 지난 시각: 최소 내일 (NicePay 가 과거 거부)
    if (target.getTime() < Date.now()) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    // 2) 7일 초과: 7일로 cap (NicePay 제약). 자동취소는 12h 룰 별도 cron 이 담당.
    if (target.getTime() > sevenDaysOut.getTime()) {
      return sevenDaysOut;
    }
    return target;
  })();
  // YYYYMMDD (KST)
  const kst = new Date(limitDate.getTime() + 9 * 60 * 60 * 1000);
  const payLimitDate = kst.toISOString().slice(0, 10).replace(/-/g, "");

  // NicePay 일시 실패 흡수 — 최대 3회 retry (1s, 2s backoff)
  let result: Awaited<ReturnType<typeof createPaymentLink>> | null = null;
  const attempts: { attempt: number; success: boolean; errorCode?: string; errorMessage?: string }[] = [];
  for (let attempt = 1; attempt <= NICEPAY_RETRY_MAX; attempt++) {
    const moid = `ORD${Date.now()}${crypto.randomBytes(4).toString("hex")}`;
    result = await createPaymentLink({
      goodsName: "커버링 방문수거",
      amount: order.totalPrice,
      orderId: moid,
      buyerName: order.customerName || "고객",
      buyerPhone: phoneDigits,
      sendType: "2", // 카카오톡
      payLimitDate,
    });
    attempts.push({ attempt, success: !!result.success, errorCode: result.errorCode, errorMessage: result.errorMessage });
    if (result.success && result.reqId) break;
    if (attempt < NICEPAY_RETRY_MAX) {
      await new Promise((r) => setTimeout(r, NICEPAY_RETRY_DELAY_MS * attempt));
    }
  }
  if (!result || !result.success || !result.reqId) {
    // 실패 audit log — 운영 화면에서 식별 가능하도록.
    try {
      await auditStore.log({
        entityType: "order",
        entityId: order.id,
        action: "update",
        changes: { prepayment_attempt: { old: null, new: attempts } },
        description: `선결제 링크 발급 실패 (${NICEPAY_RETRY_MAX}회 재시도): ${order.customerName} ${order.orderNumber} — ${result?.errorMessage ?? "no response"}`,
        userId: 0,
        userName: "system",
      });
    } catch { /* audit 실패는 무시 */ }
    return { success: false, reason: result?.errorMessage || "NicePay 오류 (재시도 한도 초과)" };
  }

  const entry: PaymentEntry = {
    reqId: result.reqId,
    payUrl: result.payUrl,
    sentAt: new Date().toISOString(),
  };
  await orderStore.addPaymentId(order.id, entry);
  await orderStore.update(order.id, { status: "payment_requested" });

  const payShortUrl = nicepayPayUrl(result.reqId);

  // 호출 측에서 메시지를 직접 구성 (booking confirm 에 inline 임베드 등) 하려는 경우 메시지 발송 건너뜀.
  if (!sendNotification) {
    return { success: true, reqId: result.reqId, payUrl: result.payUrl, payShortUrl, amount: order.totalPrice };
  }

  // 해피톡 발송
  const sessionId = order.sessionId;
  if (sessionId) {
    try {
      const { data: conv } = await supabase
        .from("conversations")
        .select("user_key, sender_key")
        .eq("session_id", sessionId)
        .single();
      if (conv) {
        const { user_key, sender_key } = conv;
        let imageSent = false;
        const uploadedUrl = await getUploadedImage(sender_key);
        if (uploadedUrl) {
          try {
            await sendImageMessage({ user_key, sender_key, imageUrl: uploadedUrl });
            await conversationStore.addAssistantMessage(sessionId, "[결제 안내 이미지]", "시스템", false, "image", uploadedUrl);
            imageSent = true;
          } catch {
            // 이미지 실패는 텍스트로 계속
          }
        }
        const imageRef = imageSent ? "\n자세한 내용은 이미지를 참고 부탁드립니다." : "";
        const text = [
          `안녕하세요, 커버링입니다 :)`,
          ``,
          `예약 확정되어 결제 링크 안내드립니다.`,
          `결제 완료 후 방문 수거 진행드립니다.`,
          ``,
          `결제 금액: ${order.totalPrice.toLocaleString()}원`,
          `결제 링크: ${payShortUrl}`,
          ``,
          `방문 12시간 전까지 결제가 완료되지 않으면 예약이 자동으로 취소됩니다.`,
          `결제 과정에서 문제가 있으시면 언제든 말씀해 주세요 :)${imageRef}`,
        ].join("\n");
        await sendPlainMessage({ user_key, sender_key, message: text });
        await conversationStore.addAssistantMessage(sessionId, text, "시스템", false);
      }
    } catch (e) {
      console.warn("[issue-prepayment-link] 안내 발송 실패:", e);
    }
  }

  return { success: true, reqId: result.reqId, payUrl: result.payUrl, payShortUrl, amount: order.totalPrice };
}
