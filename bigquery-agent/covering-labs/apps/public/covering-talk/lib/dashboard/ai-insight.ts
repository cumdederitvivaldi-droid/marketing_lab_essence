/**
 * Customer Journey Map AI 인사이트 생성 — Sonnet 호출 + DB 캐싱.
 *
 * 같은 (period_key, journey_hash) 조합이 이미 있으면 캐시된 텍스트 반환.
 * 데이터 변화가 있으면 (journey_hash 다르면) 새로 호출 + 저장.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase/client";
import type { JourneyMapData } from "./types";

// 프롬프트 버전 — 변경 시 bump 해서 캐시 무효화 (journey_hash 에 포함)
const PROMPT_VERSION = "v2";

const SYSTEM_PROMPT = `당신은 방문수거 서비스(Covering Spot) 운영 분석가.

서비스 두 형태:
- 방문수거: 가구·가전·잡동사니 등 큰 폐기물을 기사가 방문해서 수거 (주간)
- 코어 커버링(야간봉투): 220L 대형봉투에 담아 밖에 두면 22~06시 야간 수거. 고객이 "밤에 수거" 라 부르며, **이탈이 아니라 다른 형태의 전환**.

Funnel: P1 첫인사 → P2 정보수집 → P4 견적안내 → P5 넛지 → P7 일정확정 → P8 수거완료 (P3.1 품목변경 분기).

churnStatuses 라벨 의미 (반드시 정확히 해석):
- 오인입: 지역 외/잘못 들어온 인입 → 진짜 이탈
- 야간수거: 코어 커버링(야간봉투) 으로 전환 → **이탈 아님**, 다른 채널 전환
- 상담완료: 대화가 종료된 케이스 → 이탈 아님 (정상 종료)
- 무응답/기타: 진짜 이탈
- 넛지불가: 야간/공휴일 등으로 넛지 발송 불가
- 수거예정: 일정만 잡혀 있고 수거 대기 중
- 예약취소: 고객이 취소 → 진짜 이탈

작성 규칙 (엄격):
- **2문장 이내, 200자 이내**, 한국어 평서문, 마크다운/이모지/머리글 금지.
- 이탈 단계와 진짜 이탈 사유만 짚고 (야간수거·상담완료를 이탈 사유로 적지 말 것), 개선 액션 1개 제안.
- 데이터에 근거. 추측 표현 ("추정된다" 등) 자제.
- "급락/급증" 같은 강한 표현 자제 — 수치 자체를 보여주기.`;

export interface InsightContext {
  periodLabel: string;
  fromDate: string;
  toDate: string;
}

interface ColumnSlim {
  phase: string;
  shortName: string;
  reachedCount: number;
  conversionRate: number;
  durationLabel: string;
  churnStatuses: { keyword: string; count: number }[];
  churnReasons: { keyword: string; count: number }[];
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

/** journeyMap 의 핵심 수치만 추려 hash — 표시 변화 없는 메타 데이터는 제외 */
function hashJourney(map: JourneyMapData): string {
  const slim: ColumnSlim[] = map.columns.map((c) => ({
    phase: c.phase,
    shortName: c.shortName,
    reachedCount: c.reachedCount,
    conversionRate: c.conversionRate,
    durationLabel: c.durationLabel,
    churnStatuses: c.churnStatuses,
    churnReasons: c.churnReasons,
  }));
  // 프롬프트 버전 포함 → SYSTEM_PROMPT 변경 시 자동 캐시 무효화
  const json = JSON.stringify({ v: PROMPT_VERSION, totalStarted: map.totalStarted, columns: slim });
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

export async function getOrCreateInsight(
  ctx: InsightContext,
  map: JourneyMapData,
  presetKey: string,
): Promise<string | null> {
  const periodKey = `${presetKey}_${ctx.fromDate}_${ctx.toDate}`;
  const journeyHash = hashJourney(map);

  // 1. 캐시 lookup
  try {
    const { data: cached } = await supabase
      .from("dashboard_insights")
      .select("insight_text")
      .eq("period_key", periodKey)
      .eq("journey_hash", journeyHash)
      .maybeSingle();
    if (cached?.insight_text) return cached.insight_text as string;
  } catch (err) {
    console.error("[ai-insight] 캐시 조회 실패:", err);
  }

  // 2. miss → Sonnet 호출
  const slim = map.columns.map((c) => ({
    phase: c.shortName,
    reached: c.reachedCount,
    conversionRate: c.conversionRate,
    duration: c.durationLabel,
    churnStatuses: c.churnStatuses,
    churnReasons: c.churnReasons,
  }));
  const userPrompt = `기간: ${ctx.periodLabel} (${ctx.fromDate} ~ ${ctx.toDate})
전체 시작자 (P1 도달): ${map.totalStarted}명

Funnel JSON:
${JSON.stringify(slim, null, 2)}

위 데이터 분석 → 가장 큰 이탈 단계 + 의심 원인 + 개선 액션 1~2개를 1~3문장으로 작성. 마크다운 금지.`;

  let text: string;
  try {
    const res = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) return null;
  } catch (err) {
    console.error("[ai-insight] Sonnet 호출 실패:", err);
    return null;
  }

  // 3. 저장 (실패해도 결과는 반환)
  try {
    await supabase
      .from("dashboard_insights")
      .insert({ period_key: periodKey, journey_hash: journeyHash, insight_text: text });
  } catch (err) {
    console.error("[ai-insight] 캐시 저장 실패:", err);
  }

  return text;
}
