/**
 * P5 넛지 이탈 사유 분류 — Haiku on-demand + DB 캐시.
 *
 * 모집단: P5 도달 + P7 미도달 (= 넛지 받았지만 예약 안 한 케이스)
 * 분류: 비싸다 / 일정안맞음 / 무응답 / 기타
 *
 * 캐시 키: session_id (영구). 한 번 분류하면 재호출 X.
 * 마지막 고객 발화 없으면 자동 "무응답" (Haiku 호출 X).
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

export const P5_REASON_KEYWORDS = ["비싸다", "일정안맞음", "무응답", "기타"] as const;
export type P5ReasonKeyword = (typeof P5_REASON_KEYWORDS)[number];

const BATCH_SIZE = 30;       // Haiku 호출 1회당 발화 수
const MAX_BATCHES = 10;      // 1회 요청당 최대 호출 수 (300건/회)

export interface P5SessionInput {
  sessionId: string;
  lastUserMessage: string | null;
}

export interface P5ReasonRow {
  session_id: string;
  reason_keyword: P5ReasonKeyword;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM_PROMPT = `당신은 방문수거 상담 분석가입니다. 견적을 받고 넛지(리마인드 메시지)까지 받았지만 예약하지 않은 고객의 마지막 발화를 분류합니다.

분류 카테고리 4종 (반드시 이 중 하나):
- 비싸다: 가격·견적 비용 부담 / 깎아달라 / 너무 비싸다 / 다른 곳보다 비싸다 등
- 일정안맞음: 시간/날짜 안 맞음 / 다음에 / 다음달 / 더 이른 날짜 / 일정 변경 등
- 무응답: 의미 없는 단답 / 알겠다 정도만 / 결정 미루기 명확치 않음
- 기타: 위 셋에 안 맞는 모든 경우

규칙:
- 발화 N개 입력 → JSON 배열 N개 (입력 순서대로) 반환
- 각 항목은 위 4개 키워드 중 하나만
- 짧은 단답이라도 의미 추론 가능하면 분류, 추론 불가면 "기타"
- 마크다운/설명 금지. JSON 배열만.`;

/** 캐시에서 (sessionId → reason) lookup */
async function fetchCached(sessionIds: string[]): Promise<Map<string, P5ReasonKeyword>> {
  if (sessionIds.length === 0) return new Map();
  const CHUNK = 500;
  const map = new Map<string, P5ReasonKeyword>();
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    const rows = await paginate<P5ReasonRow>(() =>
      supabase.from("dashboard_p5_reasons").select("session_id, reason_keyword").in("session_id", chunk),
    );
    for (const r of rows) map.set(r.session_id, r.reason_keyword);
  }
  return map;
}

/** Haiku 배치 호출 */
async function classifyBatch(messages: string[]): Promise<P5ReasonKeyword[]> {
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
      return (P5_REASON_KEYWORDS as readonly string[]).includes(k) ? (k as P5ReasonKeyword) : "기타";
    });
  } catch (err) {
    console.error("[p5-classify] Haiku 호출 실패:", err);
    return messages.map(() => "기타");
  }
}

/**
 * 입력 sessions 의 분류 결과를 카테고리별 카운트로 집계.
 * 캐시 hit 즉시 + 미분류만 Haiku 호출 + DB 저장.
 */
export async function classifyP5Reasons(
  sessions: P5SessionInput[],
): Promise<Record<P5ReasonKeyword, number>> {
  const counts: Record<P5ReasonKeyword, number> = { 비싸다: 0, 일정안맞음: 0, 무응답: 0, 기타: 0 };
  if (sessions.length === 0) return counts;

  // 1. 캐시 lookup
  const sessionIds = sessions.map((s) => s.sessionId);
  const cached = await fetchCached(sessionIds);
  for (const r of cached.values()) counts[r]++;

  // 2. 미분류 conversation
  const uncached = sessions.filter((s) => !cached.has(s.sessionId));
  if (uncached.length === 0) return counts;

  // 3. 마지막 발화 없는 케이스는 Haiku 호출 X → "무응답" 확정
  const noMessage = uncached.filter((s) => !s.lastUserMessage || !s.lastUserMessage.trim());
  const withMessage = uncached.filter((s) => s.lastUserMessage && s.lastUserMessage.trim());

  const newRows: P5ReasonRow[] = [];
  for (const s of noMessage) {
    counts["무응답"]++;
    newRows.push({ session_id: s.sessionId, reason_keyword: "무응답" });
  }

  // 4. Haiku 배치 — MAX_BATCHES 만큼만 (1회 요청당 한도)
  const target = withMessage.slice(0, BATCH_SIZE * MAX_BATCHES);
  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const chunk = target.slice(i, i + BATCH_SIZE);
    const classifications = await classifyBatch(chunk.map((s) => s.lastUserMessage as string));
    chunk.forEach((s, idx) => {
      const reason = classifications[idx] ?? "기타";
      counts[reason]++;
      newRows.push({ session_id: s.sessionId, reason_keyword: reason });
    });
  }

  // 5. DB 저장 (실패해도 결과는 반환)
  if (newRows.length > 0) {
    try {
      const dbRows = newRows.map((r) => ({
        session_id: r.session_id,
        reason_keyword: r.reason_keyword,
        last_user_message:
          sessions.find((s) => s.sessionId === r.session_id)?.lastUserMessage?.slice(0, 500) ?? null,
      }));
      await supabase.from("dashboard_p5_reasons").upsert(dbRows, { onConflict: "session_id" });
    } catch (err) {
      console.error("[p5-classify] 캐시 저장 실패:", err);
    }
  }

  return counts;
}
