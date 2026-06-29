/**
 * dashboard_settings 헬퍼 — key/value JSONB 설정 테이블 접근
 *
 * 집계 모듈에서 한 번에 여러 키를 조회하므로 getMany 를 우선 사용.
 */

import { supabase } from "@/lib/supabase/client";

export interface DashboardSettingsMap {
  kr1_target: number;
  kr2_target: number;
  kr2_use_hardcoded: boolean;
  kr2_current_hardcoded: number;
  kr3_target: number;
  kr3_use_hardcoded: boolean;
  kr3_current_hardcoded: number;
  churn_window_hours: number;
  reentry_window_days: number;
  health_no_pickup_threshold: number;
  health_cancel_threshold: number;
  health_no_payment_threshold: number;
  health_complaint_threshold: number;
  health_nps_threshold: number;
}

const DEFAULTS: DashboardSettingsMap = {
  kr1_target: 300_000_000,
  kr2_target: 500_000_000,
  kr2_use_hardcoded: true,
  kr2_current_hardcoded: 0,
  kr3_target: 50,
  kr3_use_hardcoded: true,
  kr3_current_hardcoded: 0,
  churn_window_hours: 24,
  reentry_window_days: 14,
  health_no_pickup_threshold: 3.0,
  health_cancel_threshold: 3.0,
  health_no_payment_threshold: 2.0,
  health_complaint_threshold: 5,
  health_nps_threshold: 4,
};

/**
 * 전체 설정 로드. 테이블 미생성/쿼리 실패 시 DEFAULTS 로 graceful fallback.
 * 집계 API 1회 호출마다 1번씩만 읽도록 호출자가 캐싱 권장.
 */
export async function loadDashboardSettings(): Promise<DashboardSettingsMap> {
  try {
    const { data, error } = await supabase
      .from("dashboard_settings")
      .select("key, value");

    if (error || !data) return { ...DEFAULTS };

    const map = { ...DEFAULTS };
    for (const row of data) {
      const key = row.key as keyof DashboardSettingsMap;
      if (key in DEFAULTS) {
        // JSONB → JS 타입 그대로 할당 (숫자/불리언)
        (map as Record<string, unknown>)[key] = row.value;
      }
    }
    return map;
  } catch {
    return { ...DEFAULTS };
  }
}
