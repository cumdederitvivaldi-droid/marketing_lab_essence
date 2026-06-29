/**
 * Phase별 담당 상담사 산출 — 발화 수 1위 + 발화 카운트
 *
 * 각 conversation 의 Phase 구간 [entered, exited 또는 nowMs] 동안
 * messages 테이블에서 role='assistant' 발화만 추려 sent_by 별로 집계.
 *
 * sent_by 가 비어있거나 AI 봇 이름인 경우 → "AI" 로 묶음.
 * 그 외는 실명 그대로.
 *
 * Phase별로 통합한 뒤 1위(최다 발화자)를 PhaseColumnData.primaryAssignee 로 반환.
 */

import { Phase } from "@/lib/ai/phases";
import { JOURNEY_PHASES, AssigneeRatio } from "./types";
import { ConversationRow } from "./funnel";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

const BOT_NAMES = new Set(["시스템", "리마인드봇", "넛지봇", "AI", "미배정"]);
const BOT_PATTERNS = [/\(자동생성\)/, /\(시간안내\)/, /\(자동으로\)/];

function normalizeAssignee(sentBy: string | null | undefined): { name: string; isAI: boolean } {
  const s = (sentBy ?? "").trim();
  if (!s) return { name: "AI", isAI: true };
  if (BOT_NAMES.has(s) || BOT_PATTERNS.some((p) => p.test(s))) return { name: "AI", isAI: true };
  return { name: s, isAI: false };
}

interface MessageRow {
  session_id: string;
  role: string;
  sent_by: string | null;
  created_at: string;
}

/** Phase 진입 시각 (ms) — funnel.ts 와 동일 정의 */
function entryMsOf(conv: ConversationRow, phase: Phase): number | null {
  if (phase === Phase.PHASE_1_INITIAL) return new Date(conv.created_at).getTime();
  const t = (conv.phase_history ?? []).find((h) => h.to === phase);
  return t ? new Date(t.timestamp).getTime() : null;
}

function exitMsOf(conv: ConversationRow, phase: Phase): number | null {
  const t = (conv.phase_history ?? []).find((h) => h.from === phase);
  return t ? new Date(t.timestamp).getTime() : null;
}

export async function fetchMessagesForSessions(
  sessionIds: string[],
  fromIso: string,
  toIso: string,
): Promise<MessageRow[]> {
  if (sessionIds.length === 0) return [];

  // session_id IN (...) 절은 너무 길면 URL 한계에 걸림 — 500개씩 chunk
  const SESSION_CHUNK = 500;
  const all: MessageRow[] = [];

  for (let i = 0; i < sessionIds.length; i += SESSION_CHUNK) {
    const chunk = sessionIds.slice(i, i + SESSION_CHUNK);
    const rows = await paginate<MessageRow>(() =>
      supabase
        .from("messages")
        .select("session_id, role, sent_by, created_at")
        .in("session_id", chunk)
        .eq("role", "assistant")
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
    );
    all.push(...rows);
  }
  return all;
}

export interface PhaseAssigneeMap {
  byPhase: Map<Phase, AssigneeRatio | null>;
}

/**
 * Phase별 발화 1위 산출.
 *
 * @param conversations  기간 내 conversations (Phase 진입/탈출 시각 산출용)
 * @param messages       해당 sessionId 들의 assistant 메시지
 * @param nowMs          기준 시각 (탈출 시각 없는 Phase는 nowMs 까지로 간주)
 */
export function computePhaseAssignees(
  conversations: ConversationRow[],
  messages: MessageRow[],
  nowMs: number,
): PhaseAssigneeMap {
  // session_id → messages
  const msgsBySession = new Map<string, MessageRow[]>();
  for (const m of messages) {
    const arr = msgsBySession.get(m.session_id) ?? [];
    arr.push(m);
    msgsBySession.set(m.session_id, arr);
  }
  for (const arr of msgsBySession.values()) {
    arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  const byPhase = new Map<Phase, AssigneeRatio | null>();

  for (const phase of JOURNEY_PHASES) {
    let aiCount = 0;
    let humanCount = 0;

    for (const conv of conversations) {
      const enteredMs = entryMsOf(conv, phase);
      if (enteredMs == null) continue;
      const exitMs = exitMsOf(conv, phase) ?? nowMs;
      const msgs = msgsBySession.get(conv.session_id) ?? [];
      for (const m of msgs) {
        const tMs = new Date(m.created_at).getTime();
        if (tMs < enteredMs || tMs >= exitMs) continue;
        const norm = normalizeAssignee(m.sent_by);
        if (norm.isAI) aiCount++;
        else humanCount++;
      }
    }

    const total = aiCount + humanCount;
    if (total === 0) {
      byPhase.set(phase, null);
    } else {
      const aiPct = Math.round((aiCount / total) * 1000) / 10;
      const humanPct = Math.round((humanCount / total) * 1000) / 10;
      byPhase.set(phase, { aiCount, humanCount, total, aiPct, humanPct });
    }
  }

  return { byPhase };
}
