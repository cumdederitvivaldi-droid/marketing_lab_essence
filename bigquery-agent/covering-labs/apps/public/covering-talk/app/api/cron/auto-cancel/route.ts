// §6.1 100% 선결제 — 방문 12시간 전까지 미결제 시 자동 취소.
//   30분 주기 cron. feature flag(prepayment_enabled) ON 일 때만 동작.
//   대상: status='payment_requested' AND (방문 시작 시각 - 12h) <= now
//   결과: orders.status='cancelled' + 카카오톡 안내 (audit_logs 는 orders CRUD trigger 가 자동 기록)
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getPrepaymentEnabled, getPrepaymentCutoffIso } from "@/lib/store/app-settings";
import { getDeadlineUtc } from "@/lib/orders/visit-start-time";
import { sendPlainMessage } from "@/lib/happytalk/client";
import { conversationStore } from "@/lib/store/conversations";

// 멘션 (tomorrow-pickup-slack 와 동일) — 유대현, 김원빈
const SLACK_MENTION_USERS = "<@U07865TB7F1> <@U0AAF0BJEUX>";

// 가장 최근 tomorrow-pickup-slack summary thread_ts 조회 (30h 이내만 사용).
//   30h 초과 = stale thread → 새 채널 본문에 standalone post 로 fallback.
async function getLatestBriefThreadTs(): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "slack_latest_pickup_brief")
      .single();
    const v = data?.value as { ts?: string; postedAt?: string } | null;
    if (!v?.ts || !v?.postedAt) return null;
    const ageMs = Date.now() - new Date(v.postedAt).getTime();
    if (ageMs > 30 * 3600 * 1000) return null;
    return v.ts;
  } catch {
    return null;
  }
}

// 슬랙 실시간 알림 — auto-cancel 발생 시 18시 brief 의 thread 에 reply (+ 운영자 멘션).
//   thread 가 stale 하거나 없으면 채널 본문에 standalone post 로 fallback.
async function postCancelToSlack(text: string, threadTs: string | null): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN ?? "";
  const channel = (process.env.SLACK_PICKUP_CHANNEL_ID ?? "C0AENH7JW2Y").trim();
  if (!token || !channel) return;
  try {
    const body: Record<string, unknown> = { channel, text: `${text}\n${SLACK_MENTION_USERS}` };
    if (threadTs) body.thread_ts = threadTs;
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("[auto-cancel slack] post 실패:", e);
  }
}

interface PendingOrderRow {
  id: string;
  order_number: string;
  session_id: string | null;
  customer_name: string;
  phone: string;
  date: string;
  time_slot: string | null;
  status: string;
}

// [CS-CRON-005] §6.1 선결제 미완료 자동취소 (30분, feature flag `prepayment_enabled`)
export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  const enabled = await getPrepaymentEnabled();
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "prepayment_enabled=false" });
  }

  // ⚠ cutoff 필수 — 정책 시행 이전 주문(payment_requested 의미가 "수거 끝, 결제 대기")
  //   을 잘못 취소하지 않도록 cutoff 이후 created_at 주문만 대상으로.
  const cutoffIso = await getPrepaymentCutoffIso();
  if (!cutoffIso) {
    return NextResponse.json({ ok: true, skipped: true, reason: "prepayment_cutoff_iso 미설정 — 안전상 미실행" });
  }

  // ⚠ Sanity guard — 방문일이 오늘/내일(KST) 인 주문만 대상.
  //   파서 버그 등으로 deadline 이 잘못 계산돼도 미래 visit 주문이 잘못 취소되지 않게 방어.
  //   "방문 12시간 전" rule 자체가 visit 가 24h 이내일 때만 활성.
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);
  const tomorrowKst = new Date(kstNow.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // payment_requested + cutoff 이후 created_at + 방문 오늘/내일 + 활성 주문만 조회.
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, session_id, customer_name, phone, date, time_slot, status, created_at")
    .eq("status", "payment_requested")
    .gte("created_at", cutoffIso)
    .in("date", [todayKst, tomorrowKst]);
  if (error) {
    console.error("[auto-cancel] 조회 오류:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []) as PendingOrderRow[];
  if (orders.length === 0) {
    return NextResponse.json({ ok: true, total: 0, cancelled: 0, results: [] });
  }

  const now = Date.now();
  const results: { id: string; name: string; status: "cancelled" | "skipped"; reason?: string }[] = [];
  let cancelled = 0;

  for (const o of orders) {
    const deadline = getDeadlineUtc(o.date, o.time_slot, 12);
    if (!deadline) {
      results.push({ id: o.id, name: o.customer_name, status: "skipped", reason: "방문시각 파싱 실패" });
      continue;
    }
    if (deadline.getTime() > now) {
      results.push({ id: o.id, name: o.customer_name, status: "skipped", reason: "기한 미도래" });
      continue;
    }

    try {
      // 동시성 가드 — 조회~취소 사이 결제가 들어와 prepaid/completed 로 전환됐을 수 있어
      //   status='payment_requested' 인 행만 원자적으로 업데이트. affected row 가 없으면 skip.
      //   audit_logs 기록은 orders CRUD trigger 가 자동 처리 — 수동 로깅 시 중복 발생.
      const { data: updated, error: updateError } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", o.id)
        .eq("status", "payment_requested")
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) {
        results.push({ id: o.id, name: o.customer_name, status: "skipped", reason: "상태 변경됨" });
        continue;
      }

      // 카카오톡 안내 (session 이 있을 때만)
      if (o.session_id) {
        try {
          const { data: conv } = await supabase
            .from("conversations")
            .select("user_key, sender_key")
            .eq("session_id", o.session_id)
            .single();
          if (conv) {
            const text = `방문 12시간 전까지 결제 미완료되어 예약이 자동으로 취소되었습니다.\n\n다시 예약을 원하시면 채팅으로 말씀해 주세요 :)`;
            await sendPlainMessage({ user_key: conv.user_key, sender_key: conv.sender_key, message: text });
            await conversationStore.addAssistantMessage(o.session_id, text, "시스템", false);
          }
        } catch (e) {
          console.warn(`[auto-cancel] 안내 발송 실패 ${o.customer_name}:`, e);
        }
      }

      // 슬랙 실시간 알림 — 가장 최근 18시 brief thread 에 reply + 운영자 멘션.
      //   thread 가 stale/없으면 standalone post 로 fallback.
      //   session 이 있으면 고객명을 커버링톡 세션 링크로.
      const nameDisplay = o.session_id
        ? `<https://public-labs.covering.app/covering-talk/conversations?id=${o.session_id}|${o.customer_name}>`
        : o.customer_name;
      const slackText = `❌ 자동취소 (결제 미완료) — ${nameDisplay} / ${o.date} ${o.time_slot ?? ""} / ${o.phone ?? "-"} (#${o.order_number})`;
      const threadTs = await getLatestBriefThreadTs();
      postCancelToSlack(slackText, threadTs).catch(() => {});

      cancelled++;
      results.push({ id: o.id, name: o.customer_name, status: "cancelled" });
      console.log(`[auto-cancel] ${o.customer_name} (${o.order_number}) 자동취소`);
    } catch (e) {
      console.error(`[auto-cancel] ${o.customer_name} 처리 실패:`, e);
      results.push({ id: o.id, name: o.customer_name, status: "skipped", reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const duration = Date.now() - startedAt;
  console.log(`[auto-cancel] 완료: 검사=${orders.length}, 취소=${cancelled} (${duration}ms)`);
  return NextResponse.json({
    ok: true,
    total: orders.length,
    cancelled,
    skipped: orders.length - cancelled,
    duration_ms: duration,
    results,
  });
}
