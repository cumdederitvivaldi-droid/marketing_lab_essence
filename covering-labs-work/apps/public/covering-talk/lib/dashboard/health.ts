/**
 * Health Check 4종 산출 — orders.status 흐름 기반
 *
 * status 흐름: confirmed → payment_requested → completed (취소 시 cancelled)
 *
 * 정의:
 *   - 취소율   : cancelled / 사이클 종결 건 (completed + payment_requested + cancelled)
 *                = "처리 끝난 건 중 취소 비율" — 진행중(confirmed) 제외
 *   - 미결제율  : payment_requested / (payment_requested + completed)
 *                = "수거 완료한 건 중 결제 미완료 비율" — 시간 기준 없음
 *   - 고객 불만 : MVP 미구현 (별도 케이스 구축 후 연동) → null
 *   - NPS     : 수집 파이프라인 미구축 → null
 *
 * (미수거율은 운영 판단이 어려워 카드에서 제거 — settings.health_no_pickup_threshold 는 보존하되 미사용.)
 *
 * 임계값은 dashboard_settings 에서 동적으로 로드.
 */

import { supabase } from "@/lib/supabase/client";
import { HealthCardData } from "./types";
import { DashboardSettingsMap } from "./settings";
import { paginate } from "./_paginate";

interface OrderHealthRow {
  status: string;
}

export async function getHealthMetrics(
  fromIso: string,
  toIso: string,
  settings: DashboardSettingsMap,
): Promise<HealthCardData[]> {
  // 기간 내 생성된 orders 만 대상으로 산출
  const rows = await paginate<OrderHealthRow>(() =>
    supabase
      .from("orders")
      .select("status")
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
  );

  let cancelled = 0;
  let paymentRequested = 0;
  let prepaid = 0;
  let completed = 0;

  for (const r of rows) {
    if (r.status === "cancelled") cancelled++;
    else if (r.status === "payment_requested") paymentRequested++;
    else if (r.status === "prepaid") prepaid++;
    else if (r.status === "completed") completed++;
  }

  // 사이클 종결 건 — 취소율 분모 (confirmed 제외). prepaid 도 결제 진입한 건으로 포함.
  const settledTotal = completed + prepaid + paymentRequested + cancelled;
  // 미결제율 분모 — 결제 단계 진입한 건 (prepaid/completed 는 결제 끝, payment_requested 는 대기).
  const paymentSettled = paymentRequested + prepaid + completed;

  const pctOf = (n: number, denom: number) =>
    denom > 0 ? Math.round((n / denom) * 1000) / 10 : 0;

  return [
    pctCard("cancel", "취소율", pctOf(cancelled, settledTotal), settings.health_cancel_threshold),
    pctCard("no_payment", "미결제율", pctOf(paymentRequested, paymentSettled), settings.health_no_payment_threshold),
    countCardTbd("complaints", "고객 불만 (전/후)", settings.health_complaint_threshold),
    npsCardTbd("nps", "NPS", settings.health_nps_threshold),
  ];
}

function pctCard(id: string, label: string, value: number, threshold: number): HealthCardData {
  return {
    id,
    label,
    threshold,
    thresholdLabel: `≤ ${threshold.toFixed(1)}%`,
    current: value,
    currentDisplay: `${value.toFixed(1)}%`,
    unit: "percent",
    status: classifyLte(value, threshold),
    thresholdDirection: "lte",
  };
}

function countCardTbd(id: string, label: string, threshold: number): HealthCardData {
  return {
    id,
    label,
    threshold,
    thresholdLabel: `≤ ${threshold}건`,
    current: null,
    currentDisplay: "TBD",
    unit: "count",
    status: "tbd",
    thresholdDirection: "lte",
  };
}

function npsCardTbd(id: string, label: string, threshold: number): HealthCardData {
  return {
    id,
    label,
    threshold,
    thresholdLabel: `≥ ${threshold.toFixed(1)}점`,
    current: null,
    currentDisplay: "TBD",
    unit: "pt",
    status: "tbd",
    thresholdDirection: "gte",
  };
}

function classifyLte(value: number, threshold: number): HealthCardData["status"] {
  if (value > threshold) return "alert";
  if (value >= threshold * 0.8) return "warn";
  return "ok";
}
