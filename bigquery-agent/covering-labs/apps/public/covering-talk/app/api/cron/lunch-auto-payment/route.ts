import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase/client";
import { createPaymentLink } from "@/lib/nicepay/client";
import { lunchOrderStore } from "@/lib/store/lunch-orders";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { sendLunchPlainMessage } from "@/lib/happytalk/lunch-client";
import type { PaymentEntry } from "@/lib/store/orders";

/**
 * [CS-ETC-055] 런치 자동 결제 요청
 *
 * 매일 오후 3시(KST) 실행 — 전일 수거진행건 대상:
 * 1. lunch_orders 중 date = 어제(KST) & status = confirmed & settlement_type = link_pay 조회
 * 2. payment_ids가 이미 있는 건은 스킵 (중복 방지)
 * 3. 각 주문별 NicePay 결제 링크 생성 (카카오 자동 발송)
 * 4. 상태를 payment_requested로 변경
 * 5. session_id 단위로 묶어 해피톡 안내 메시지 1회만 발송 (중복 안내 방지)
 *
 * Vercel Cron: "0 6 * * *" (UTC 06:00 = KST 15:00)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const resendNotice = searchParams.get("resendNotice"); // "YYYY-MM-DD" — 안내만 재발송

  if (resendNotice) {
    return handleResendNotice(resendNotice);
  }

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yesterdayKst = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const targetDate = yesterdayKst.toISOString().split("T")[0]; // "2026-04-20"
  const targetMonth = yesterdayKst.getUTCMonth() + 1;
  const targetDay = yesterdayKst.getUTCDate();

  console.log(`[lunch-auto-payment] 시작: ${targetDate} 수거진행건 자동 결제 요청`);

  try {
    const { data: orders, error } = await supabase
      .from("lunch_orders")
      .select("*")
      .eq("date", targetDate)
      .eq("status", "confirmed")
      .eq("settlement_type", "link_pay");

    if (error) {
      console.error("[lunch-auto-payment] 조회 오류:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      console.log("[lunch-auto-payment] 대상 없음");
      return NextResponse.json({ ok: true, date: targetDate, sent: 0, skipped: 0, failed: 0 });
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const results: { id: string; vendor: string; status: string; reason?: string }[] = [];

    // 벤더 전화번호 캐시 (같은 vendor_id 중복 조회 방지)
    const vendorPhoneCache = new Map<string, string>();
    async function getOwnerPhone(vendorId: string | null): Promise<string> {
      if (!vendorId) return "";
      if (vendorPhoneCache.has(vendorId)) return vendorPhoneCache.get(vendorId)!;
      const { data: vendor } = await supabase
        .from("lunch_vendors")
        .select("owner_phone")
        .eq("id", vendorId)
        .maybeSingle();
      const phone = (vendor?.owner_phone || "").replace(/[^0-9]/g, "");
      vendorPhoneCache.set(vendorId, phone);
      return phone;
    }

    // session_id 단위 안내 메시지 집계 (결제링크는 주문별 발송, 안내 메시지는 세션당 1회)
    const sessionSummaries = new Map<
      string,
      { vendorName: string; phone: string; count: number }
    >();

    for (const row of orders) {
      const orderId = row.id as string;
      const vendorName = (row.vendor_name || "지점") as string;
      const amount = row.total_amount as number;
      const vendorId = row.vendor_id as string | null;
      const sessionId = row.session_id as string | null;
      const paymentIds: PaymentEntry[] = row.payment_ids ?? [];

      if (paymentIds.length > 0) {
        console.log(`[lunch-auto-payment] 스킵 (이미 발송): ${vendorName} (${orderId})`);
        results.push({ id: orderId, vendor: vendorName, status: "skipped", reason: "이미 결제 발송됨" });
        skipped++;
        continue;
      }

      if (!amount || amount <= 0) {
        results.push({ id: orderId, vendor: vendorName, status: "skipped", reason: "금액 없음" });
        skipped++;
        continue;
      }

      const ownerPhone = await getOwnerPhone(vendorId);
      if (!ownerPhone || ownerPhone.length < 10) {
        results.push({ id: orderId, vendor: vendorName, status: "skipped", reason: "연락처 없음" });
        skipped++;
        continue;
      }

      try {
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() + 7);
        const payLimitDate = limitDate.toISOString().slice(0, 10).replace(/-/g, "");
        const moid = `LUN${Date.now()}${crypto.randomBytes(4).toString("hex")}`;

        const result = await createPaymentLink({
          goodsName: "커버링 런치 수거",
          amount,
          orderId: moid,
          buyerName: vendorName,
          buyerPhone: ownerPhone,
          sendType: "2", // 카카오톡
          payLimitDate,
        });

        if (!result.success) {
          console.error(`[lunch-auto-payment] NicePay 실패: ${vendorName}`, result.errorMessage);
          results.push({ id: orderId, vendor: vendorName, status: "failed", reason: result.errorMessage || "NicePay 오류" });
          failed++;
          continue;
        }

        await lunchOrderStore.addPaymentId(orderId, {
          reqId: result.reqId!,
          payUrl: result.payUrl,
          sentAt: new Date().toISOString(),
        });

        await lunchOrderStore.update(orderId, { status: "payment_requested" });

        // 세션별 안내 메시지 집계 — session_id 없으면 vendor_id로 최근 대화 매칭
        let effectiveSessionId = sessionId;
        if (!effectiveSessionId && vendorId) {
          const { data: conv } = await supabase
            .from("lunch_conversations")
            .select("session_id")
            .eq("vendor_id", vendorId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          effectiveSessionId = conv?.session_id ?? null;
        }
        if (effectiveSessionId) {
          const prev = sessionSummaries.get(effectiveSessionId);
          if (prev) {
            prev.count++;
          } else {
            sessionSummaries.set(effectiveSessionId, { vendorName, phone: ownerPhone, count: 1 });
          }
        }

        console.log(`[lunch-auto-payment] 발송 성공: ${vendorName} (${amount.toLocaleString()}원)`);
        results.push({ id: orderId, vendor: vendorName, status: "sent" });
        sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[lunch-auto-payment] 발송 오류: ${vendorName}`, msg);
        results.push({ id: orderId, vendor: vendorName, status: "failed", reason: msg });
        failed++;
      }
    }

    // 세션당 안내 메시지 1회 발송
    let noticed = 0;
    const noticeFailures: { vendor: string; error: string }[] = [];
    for (const [sessionId, summary] of sessionSummaries) {
      try {
        const { data: conv } = await supabase
          .from("lunch_conversations")
          .select("user_key")
          .eq("session_id", sessionId)
          .maybeSingle();

        if (!conv?.user_key) {
          console.warn(`[lunch-auto-payment] 안내 스킵 (user_key 없음): ${summary.vendorName}`);
          noticeFailures.push({ vendor: summary.vendorName, error: "user_key 없음" });
          continue;
        }

        const formattedPhone = formatPhone(summary.phone);
        const message =
          `[자동발송]\n` +
          `안녕하세요, 커버링 런치입니다.\n` +
          `${targetMonth}월 ${targetDay}일 수거진행건 결제 안내 드립니다.\n` +
          `${formattedPhone} 카카오톡으로 나이스 링크페이 결제요청 보내드렸으며 빠른 결제 부탁드립니다.\n\n` +
          `결제에 문제가 있으시면 말씀해 주세요:)\n` +
          `수거가 진행되지 않았다면, 결제하지 말고 말씀해 주세요.`;

        // sender_key는 LUNCH_SENDER_KEY 환경변수 기본값 사용 (DB의 stale 값 회피)
        await sendLunchPlainMessage({
          user_key: conv.user_key,
          message,
        });

        await lunchConversationStore.addOutgoingMessage(sessionId, message, "시스템");
        console.log(`[lunch-auto-payment] 안내 발송: ${summary.vendorName} (${summary.count}건)`);
        noticed++;
      } catch (msgErr) {
        const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
        console.warn(`[lunch-auto-payment] 안내 발송 실패: ${summary.vendorName}`, errMsg);
        noticeFailures.push({ vendor: summary.vendorName, error: errMsg });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[lunch-auto-payment] 완료: 발송=${sent}, 스킵=${skipped}, 실패=${failed}, 안내=${noticed}세션 (${duration}ms)`);

    return NextResponse.json({
      ok: true,
      date: targetDate,
      total: orders.length,
      sent,
      skipped,
      failed,
      noticedSessions: noticed,
      noticeFailures,
      results,
      duration,
    });
  } catch (err) {
    console.error("[lunch-auto-payment] 치명적 오류:", err);
    return NextResponse.json({ error: "런치 자동 결제 요청 실패" }, { status: 500 });
  }
}

function formatPhone(phone: string): string {
  const p = phone.replace(/[^0-9]/g, "");
  if (p.length === 11) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (p.length === 10) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
  return phone;
}

/**
 * 안내 메시지만 재발송 — 특정 날짜의 payment_requested 건에 대해 세션당 1회.
 * 같은 날짜에 동일 시작 문구 메시지가 이미 저장돼 있으면 dedupe.
 */
async function handleResendNotice(targetDate: string): Promise<NextResponse> {
  const [yyyy, mm, dd] = targetDate.split("-").map((s) => parseInt(s, 10));
  if (!yyyy || !mm || !dd) {
    return NextResponse.json({ error: "resendNotice=YYYY-MM-DD 형식 필요" }, { status: 400 });
  }

  const { data: orders, error } = await supabase
    .from("lunch_orders")
    .select("id, order_number, vendor_id, vendor_name, session_id")
    .eq("date", targetDate)
    .eq("status", "payment_requested")
    .eq("settlement_type", "link_pay");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, date: targetDate, noticed: 0, skipped: 0, failures: [], debug: "no orders found" });
  }

  const phoneCache = new Map<string, string>();
  async function lookupPhone(vendorId: string | null): Promise<string> {
    if (!vendorId) return "";
    if (phoneCache.has(vendorId)) return phoneCache.get(vendorId)!;
    const { data: v } = await supabase
      .from("lunch_vendors")
      .select("owner_phone")
      .eq("id", vendorId)
      .maybeSingle();
    const p = (v?.owner_phone || "").replace(/[^0-9]/g, "");
    phoneCache.set(vendorId, p);
    return p;
  }

  async function resolveSessionId(row: { session_id: string | null; vendor_id: string | null }): Promise<string | null> {
    if (row.session_id) return row.session_id;
    if (!row.vendor_id) return null;
    const { data: conv } = await supabase
      .from("lunch_conversations")
      .select("session_id")
      .eq("vendor_id", row.vendor_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return conv?.session_id ?? null;
  }

  const sessionSummaries = new Map<string, { vendorName: string; phone: string }>();
  const orderDebug: Array<{ order: string; vendor: string; sessionId: string | null; phone: string; reason?: string }> = [];
  for (const o of orders) {
    const vendor = o.vendor_name || "지점";
    const sessionId = await resolveSessionId({ session_id: o.session_id, vendor_id: o.vendor_id });
    if (!sessionId) {
      orderDebug.push({ order: o.order_number, vendor, sessionId: null, phone: "", reason: "session 매칭 실패" });
      continue;
    }
    if (sessionSummaries.has(sessionId)) {
      orderDebug.push({ order: o.order_number, vendor, sessionId, phone: "", reason: "세션 중복 (이미 집계됨)" });
      continue;
    }
    const phone = await lookupPhone(o.vendor_id as string | null);
    if (!phone) {
      orderDebug.push({ order: o.order_number, vendor, sessionId, phone: "", reason: "owner_phone 없음" });
      continue;
    }
    sessionSummaries.set(sessionId, { vendorName: vendor, phone });
    orderDebug.push({ order: o.order_number, vendor, sessionId, phone });
  }

  let noticed = 0;
  let skipped = 0;
  const failures: { vendor: string; error: string }[] = [];
  // 메시지 시작에 [자동발송] prefix 가 붙은 신/구 포맷 모두 매칭 — anchor 만 검색
  const noticePrefix = `${mm}월 ${dd}일 수거진행건 결제 안내`;

  for (const [sessionId, summary] of sessionSummaries) {
    try {
      // dedupe: 같은 세션에서 동일 시작 문구 메시지가 이미 있으면 스킵
      const { data: prior } = await supabase
        .from("lunch_messages")
        .select("id")
        .eq("session_id", sessionId)
        .eq("role", "assistant")
        .ilike("content", `%${noticePrefix}%`)
        .limit(1);
      if (prior && prior.length > 0) {
        skipped++;
        continue;
      }

      const { data: conv } = await supabase
        .from("lunch_conversations")
        .select("user_key")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (!conv?.user_key) {
        failures.push({ vendor: summary.vendorName, error: "user_key 없음" });
        continue;
      }

      const message =
        `[자동발송]\n` +
        `안녕하세요, 커버링 런치입니다.\n` +
        `${mm}월 ${dd}일 수거진행건 결제 안내 드립니다.\n` +
        `${formatPhone(summary.phone)} 카카오톡으로 나이스 링크페이 결제요청 보내드렸으며 빠른 결제 부탁드립니다.\n\n` +
        `결제에 문제가 있으시면 말씀해 주세요:)\n` +
        `수거가 진행되지 않았다면, 결제하지 말고 말씀해 주세요.`;

      await sendLunchPlainMessage({ user_key: conv.user_key, message });
      await lunchConversationStore.addOutgoingMessage(sessionId, message, "시스템");
      noticed++;
      console.log(`[lunch-auto-payment:resend] ${summary.vendorName} 안내 발송`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      failures.push({ vendor: summary.vendorName, error: errMsg });
      console.warn(`[lunch-auto-payment:resend] ${summary.vendorName} 실패`, errMsg);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "resendNotice",
    date: targetDate,
    totalOrders: orders.length,
    sessionsTargeted: sessionSummaries.size,
    noticed,
    skipped,
    failures,
    orderDebug,
  });
}
