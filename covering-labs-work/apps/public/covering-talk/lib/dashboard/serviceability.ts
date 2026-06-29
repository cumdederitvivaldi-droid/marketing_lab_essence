/**
 * 수거불가(지역) 케이스 식별 — messages 테이블에서 상담사가
 * "지역 외/서비스 불가" 안내 메시지를 보낸 sessionId 추출.
 *
 * status='wrong_inbound' 분류로 잡히지 않는 케이스가 약 50% 더 있음 (4월 기준 67건 vs 30건).
 * 상담사마다 표현이 달라서 ILIKE OR 패턴 매칭 — 추후 Haiku 분류로 정확도 향상 가능.
 */

import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

// 수거 불가 안내 메시지 패턴 (상담사 매크로/직접 발화 모두 커버)
const UNSERVICEABLE_PATTERNS = [
  "수거 진행이 어려",
  "서비스 지역이 아",
  "지역 외",
  "서비스 불가",
  "수거가 어려",
  "수거 불가",
  "운영 지역이 아",
  "서비스 지역만 운영",
  "서비스 가능 지역이 아",
  "서비스 가능한 지역이 아",
  "서비스가 진행되지 않",
];

/**
 * 기간 내 messages 중 수거 불가 안내 패턴이 1회 이상 등장한 sessionId 집합.
 * messages.created_at 기준 (보통 conversation 기간과 동일 범위).
 */
export async function fetchUnserviceableSessionIds(fromIso: string, toIso: string): Promise<Set<string>> {
  const orClause = UNSERVICEABLE_PATTERNS.map((p) => `content.ilike.%${p}%`).join(",");
  const rows = await paginate<{ session_id: string }>(() =>
    supabase
      .from("messages")
      .select("session_id")
      .eq("role", "assistant")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .or(orClause),
  );
  return new Set(rows.map((r) => r.session_id));
}
