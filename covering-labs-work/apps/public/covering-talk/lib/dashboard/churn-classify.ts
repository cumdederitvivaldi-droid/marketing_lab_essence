/**
 * Phase 별 이탈 사유 분류 (P2 / P4 / P5 공통) — Haiku on-demand + DB 캐시.
 *
 * 분류 카테고리 7종 — 모든 phase 공통.
 * 캐시 키: (session_id, phase). 다른 phase 라도 같은 conversation 이면 별도 분류.
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

// 표시 순서 (사용자 우선순위) — 무응답·서비스문의가 가장 흔하므로 위로
export const CHURN_REASON_KEYWORDS = [
  "무응답",
  "서비스문의",
  "비싸다",
  "일정안맞음",
  "변심",
  "다른견적",
  "검토중",
  "종료",
  "기타",
] as const;
export type ChurnReasonKeyword = (typeof CHURN_REASON_KEYWORDS)[number];

const BATCH_SIZE = 30;
const MAX_BATCHES = 10;

export interface ChurnSessionInput {
  sessionId: string;
  lastUserMessage: string | null;
}

interface ChurnReasonRow {
  session_id: string;
  phase: string;
  reason_keyword: ChurnReasonKeyword;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `당신은 방문수거 상담 분석가입니다. 다음 단계로 진행하지 못한 고객의 마지막 발화를 분류합니다.

분류 카테고리 9종 (반드시 이 중 하나):
- 비싸다: 가격·견적 비용 부담 / 깎아달라 / 너무 비싸다 / 다른 곳보다 비싸다
- 일정안맞음: 시간/날짜 안 맞음 / 다음에 / 다음달 / 더 이른 날짜 / 일정 변경 요청
- 무응답: 의미 없는 단답 ("네", "넵", "감사"), 정보 수집 단계 응답 (주소·층·품목 등) 만 있고 실 의사 표현 없음, 결정 미루기 명확치 않음
- 변심: 안 한다 / 그만두기 / 포기 / 처분함 / 다른 방법으로 해결
- 다른견적: 다른 업체 알아본다 / 비교 중 / 견적 받고 결정 / 일반쓰레기로
- 서비스문의: 서비스 정보만 묻고 끝 / 가능한지 / 어떻게 / 절차 / 단순 문의
- 검토중: "생각해보고 연락드리겠다" / "검토 후 연락" / "고민해보고" / 즉답 안 하고 다음에 다시 연락한다 류 — 변심도 아니고 단순 무응답도 아닌 명시적 보류
- 종료: 메시지가 정확히 "종료" / "상담 종료" / "끝" 같은 카카오톡 종료 버튼 / 명시적 대화 종료 의사
- 기타: 위 모든 것에 안 맞는 경우

규칙:
- 발화 N개 입력 → JSON 배열 N개 (입력 순서대로) 반환
- 각 항목은 위 7개 키워드 중 하나만
- 추론 가능하면 적극 분류, 추론 불가하면 "기타"
- 마크다운/설명 금지. JSON 배열만.`;

async function fetchCached(sessionIds: string[], phase: string): Promise<Map<string, ChurnReasonKeyword>> {
  if (sessionIds.length === 0) return new Map();
  const CHUNK = 500;
  const map = new Map<string, ChurnReasonKeyword>();
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    const rows = await paginate<ChurnReasonRow>(() =>
      supabase
        .from("dashboard_churn_reasons")
        .select("session_id, phase, reason_keyword")
        .eq("phase", phase)
        .in("session_id", chunk),
    );
    for (const r of rows) map.set(r.session_id, r.reason_keyword);
  }
  return map;
}

async function classifyBatch(messages: string[]): Promise<ChurnReasonKeyword[]> {
  if (messages.length === 0) return [];
  const numbered = messages.map((m, i) => `${i + 1}. ${m.replace(/\s+/g, " ").slice(0, 200)}`).join("\n");
  try {
    const res = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `발화 ${messages.length}개:\n${numbered}\n\n위 순서대로 JSON 배열 반환:` }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return messages.map(() => "기타");
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return messages.map(() => "기타");
    return parsed.map((v) => {
      const k = String(v).trim();
      return (CHURN_REASON_KEYWORDS as readonly string[]).includes(k) ? (k as ChurnReasonKeyword) : "기타";
    });
  } catch (err) {
    console.error("[churn-classify] Haiku 호출 실패:", err);
    return messages.map(() => "기타");
  }
}

export async function classifyChurnReasons(
  sessions: ChurnSessionInput[],
  phase: string,
): Promise<Record<ChurnReasonKeyword, number>> {
  const counts: Record<ChurnReasonKeyword, number> = {
    무응답: 0, 서비스문의: 0, 비싸다: 0, 일정안맞음: 0, 변심: 0, 다른견적: 0, 검토중: 0, 종료: 0, 기타: 0,
  };
  if (sessions.length === 0) return counts;

  const sessionIds = sessions.map((s) => s.sessionId);
  const cached = await fetchCached(sessionIds, phase);
  for (const r of cached.values()) counts[r]++;

  const uncached = sessions.filter((s) => !cached.has(s.sessionId));
  if (uncached.length === 0) return counts;

  const noMessage = uncached.filter((s) => !s.lastUserMessage || !s.lastUserMessage.trim());
  const withMessage = uncached.filter((s) => s.lastUserMessage && s.lastUserMessage.trim());

  const newRows: { session_id: string; phase: string; reason_keyword: ChurnReasonKeyword; last_user_message: string | null }[] = [];
  for (const s of noMessage) {
    counts["무응답"]++;
    newRows.push({ session_id: s.sessionId, phase, reason_keyword: "무응답", last_user_message: null });
  }

  const target = withMessage.slice(0, BATCH_SIZE * MAX_BATCHES);
  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const chunk = target.slice(i, i + BATCH_SIZE);
    const classifications = await classifyBatch(chunk.map((s) => s.lastUserMessage as string));
    chunk.forEach((s, idx) => {
      const reason = classifications[idx] ?? "기타";
      counts[reason]++;
      newRows.push({
        session_id: s.sessionId,
        phase,
        reason_keyword: reason,
        last_user_message: s.lastUserMessage?.slice(0, 500) ?? null,
      });
    });
  }

  if (newRows.length > 0) {
    try {
      await supabase.from("dashboard_churn_reasons").upsert(newRows, { onConflict: "session_id,phase" });
    } catch (err) {
      console.error("[churn-classify] 캐시 저장 실패:", err);
    }
  }

  return counts;
}
