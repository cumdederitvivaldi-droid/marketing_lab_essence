/**
 * 일별 funnel 시계열 — 기간 내 KST 자정 기준 버킷팅.
 *   - 인입(intake)  : conversations.created_at 일별 카운트
 *   - 견적(quote)   : 인입 conversations 중 quote.sentAt 있거나 status 견적발송계열
 *   - 전환(booked)  : orders.created_at 일별 활성 3종 (confirmed + payment_requested + completed)
 *                     — "이날 신규로 들어온 예약 건수" 운영 시점 활동량 그래프.
 *                     KR1 매출(orders.date 수거예정일 기준)과 다름 — 의도적 분리.
 *
 * Customer Journey Map 그래프 (재진입률 그래프 대체).
 */

import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

const KST_OFFSET = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const QUOTE_SENT_STATUSES = new Set(["quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent", "booked"]);
const ACTIVE_ORDER_STATUSES = ["confirmed", "payment_requested", "prepaid", "completed"];

export interface DailyFunnelPoint {
  date: string;     // YYYY-MM-DD (KST)
  intake: number;   // 인입 (P1 도달)
  quote: number;    // 견적 발송
  booked: number;   // 예약 전환 (활성 orders)
}

interface ConvRow {
  created_at: string;
  status: string;
  quote: { sentAt?: number | null } | null;
}

interface OrderRow {
  created_at: string;
  status: string;
}

/** UTC ms → "YYYY-MM-DD" KST */
function toKstDateString(utcMs: number): string {
  return new Date(utcMs + KST_OFFSET).toISOString().slice(0, 10);
}

/** 기간 시작/끝 사이 KST 일자 list */
function buildDayKeys(fromIso: string, toIso: string): string[] {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  const fromKstStart = new Date(fromMs + KST_OFFSET);
  fromKstStart.setUTCHours(0, 0, 0, 0);
  const fromUtc = fromKstStart.getTime() - KST_OFFSET;

  const days: string[] = [];
  for (let t = fromUtc; t <= toMs; t += DAY_MS) {
    days.push(toKstDateString(t));
  }
  return days;
}

export async function getDailyFunnel(fromIso: string, toIso: string): Promise<DailyFunnelPoint[]> {
  const dayKeys = buildDayKeys(fromIso, toIso);

  // 1. conversations + orders 병렬 fetch (둘 다 페이지네이션 적용)
  const [convs, orders] = await Promise.all([
    paginate<ConvRow>(() =>
      supabase
        .from("conversations")
        .select("created_at, status, quote")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ),
    paginate<OrderRow>(() =>
      supabase
        .from("orders")
        .select("created_at, status")
        .in("status", ACTIVE_ORDER_STATUSES)
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    ),
  ]);

  // 2. 일별 카운트 누적
  const map = new Map<string, DailyFunnelPoint>();
  for (const d of dayKeys) map.set(d, { date: d, intake: 0, quote: 0, booked: 0 });

  for (const c of convs) {
    const d = toKstDateString(new Date(c.created_at).getTime());
    const point = map.get(d);
    if (!point) continue;
    point.intake++;
    if (c.quote?.sentAt != null || QUOTE_SENT_STATUSES.has(c.status)) {
      point.quote++;
    }
  }

  for (const o of orders) {
    const d = toKstDateString(new Date(o.created_at).getTime());
    const point = map.get(d);
    if (!point) continue;
    point.booked++;
  }

  return [...map.values()];
}
