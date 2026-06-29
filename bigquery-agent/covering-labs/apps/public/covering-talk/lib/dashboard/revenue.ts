/**
 * KR1 매출 집계 — orders.status = 'completed' 만 합산
 *
 * 기간(KST 자정~자정) 사이 created_at 기준으로 필터.
 * KR1 카드는 "이번 달" 기준이 기본이지만, 기간 필터에 따라 동적 범위로 호출됨.
 */

import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

export interface RevenueResult {
  totalAmount: number;
  orderCount: number;
}

/**
 * KR1 매출 = 기간 내 "수거일(date)" 기준 + status IN ('prepaid','completed')
 *   created_at(예약 생성일) 이 아닌 date(실제 수거일) 기준 — 월 매출의 자연스러운 의미.
 *   §6.1 선결제 정책 — prepaid 는 결제 완료된 매출(수거 대기 중), 매출에 포함.
 */
export async function getCompletedRevenue(fromIso: string, toIso: string): Promise<RevenueResult> {
  // ISO → YYYY-MM-DD (KST) 로 변환. orders.date 는 TEXT 타입이라 일자 비교만 가능.
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const fromDate = new Date(new Date(fromIso).getTime() + KST_OFFSET).toISOString().slice(0, 10);
  const toDate = new Date(new Date(toIso).getTime() + KST_OFFSET).toISOString().slice(0, 10);

  const rows = await paginate<{ total_price: number | null }>(() =>
    supabase
      .from("orders")
      .select("total_price")
      .in("status", ["prepaid", "completed"])
      .gte("date", fromDate)
      .lte("date", toDate),
  );

  const totalAmount = rows.reduce((sum, o) => sum + (o.total_price ?? 0), 0);
  return { totalAmount, orderCount: rows.length };
}

/**
 * orders.date 범위 + status 필터로 row 카운트 반환.
 * Customer Journey Map 의 P7(일정확정) / P8(수거완료) 등 funnel 단계의 정확한 건수 산출용.
 *
 * @param statuses 매칭할 status 배열 (예: ["confirmed", "payment_requested", "completed"])
 * @param fromIso  기간 시작 (ISO) — KST 자정 기준 YYYY-MM-DD 변환
 * @param toIso    기간 끝 (ISO)
 */
export async function countOrdersByDateRange(
  statuses: string[],
  fromIso: string,
  toIso: string,
): Promise<number> {
  const KST_OFFSET = 9 * 60 * 60 * 1000;
  const fromDate = new Date(new Date(fromIso).getTime() + KST_OFFSET).toISOString().slice(0, 10);
  const toDate = new Date(new Date(toIso).getTime() + KST_OFFSET).toISOString().slice(0, 10);

  const rows = await paginate<{ id: string }>(() =>
    supabase
      .from("orders")
      .select("id")
      .in("status", statuses)
      .gte("date", fromDate)
      .lte("date", toDate),
  );
  return rows.length;
}

/**
 * 주어진 conversation session_id 들 중 orders 테이블에서
 * status='completed' 인 unique session 수를 반환.
 *
 * Customer Journey Map P8(수거 완료) 컬럼의 진짜 reachedCount —
 * conversation.current_phase 가 phase_8 가 아니어도 실제 수거가 끝난 케이스 포함.
 */
export async function countCompletedOrdersBySession(sessionIds: string[]): Promise<number> {
  if (sessionIds.length === 0) return 0;

  const SESSION_CHUNK = 500;
  const completedSessions = new Set<string>();

  for (let i = 0; i < sessionIds.length; i += SESSION_CHUNK) {
    const chunk = sessionIds.slice(i, i + SESSION_CHUNK);
    const rows = await paginate<{ session_id: string | null }>(() =>
      supabase
        .from("orders")
        .select("session_id")
        .in("session_id", chunk)
        .in("status", ["prepaid", "completed"]),
    );
    for (const r of rows) {
      if (r.session_id) completedSessions.add(r.session_id);
    }
  }
  return completedSessions.size;
}
