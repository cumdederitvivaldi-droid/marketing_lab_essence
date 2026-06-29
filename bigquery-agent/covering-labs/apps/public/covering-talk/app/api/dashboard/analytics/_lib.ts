import { supabase } from "@/lib/supabase/client";

// 운영 분석 — 공통 계산 로직 (analytics + export 공유)

const PAGE_SIZE = 1000;
const QUOTE_SENT_STATUSES = ["quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent"];
const CLOSED_STATUSES = ["booked", "completed", "cancelled", "no_response", "wrong_inbound"];

// 자동발송 봇/시스템 sent_by 는 상담사 통계에서 제외
const BOT_NAMES = new Set(["시스템", "리마인드봇", "넛지봇", "AI", "미배정"]);
function isHumanCounselor(name: string): boolean {
  if (!name) return false;
  if (BOT_NAMES.has(name)) return false;
  if (/\(자동생성\)|\(시간안내\)/.test(name)) return false;
  return true;
}

export interface AssigneeMetrics {
  name: string;
  total: number | null;        // 자동발송 봇 합산 행은 null
  quoteSent: number | null;
  booked: number | null;
  totalReplies: number;
  aiAsIs: number;
  aiEdited: number;
  aiAsIsRate: number | null;            // %
  activeHours: number;                   // h, 1 decimal — 내부용 (시간당 메트릭 계산), CSV/UI 노출 안함
  repliesPerHour: number | null;
  closuresPerHour: number | null;
  medianResponseTimeMin: number | null;  // 중위값 — 평균은 outlier 영향 큼
}

export interface ResponseMetrics {
  firstResponseAvg: number;
  firstResponseMedian: number;
  closeTimeAvg: number;
  closeTimeMedian: number;
  sampleCount: number;
  closeSampleCount: number;
}

export interface AnalyticsResult {
  total: number;
  heatmap: number[][];
  assignees: AssigneeMetrics[];
  responseMetrics: ResponseMetrics;
  startDate: string;
  endDate: string;
}

export interface DateRange {
  startIso: string;
  endIso: string;
}

export function toDateRange(startDate: string, endDate: string): DateRange {
  const startIso = new Date(startDate + "T00:00:00+09:00").toISOString();
  const endDateNext = new Date(endDate + "T00:00:00+09:00");
  endDateNext.setDate(endDateNext.getDate() + 1);
  const endIso = endDateNext.toISOString();
  return { startIso, endIso };
}

interface ConversationRow {
  session_id: string;
  assignee: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  quote: { sentAt?: number | null } | null;
  booking: unknown;
}

interface MessageRow {
  session_id: string;
  role: string;
  sent_by: string | null;
  is_edited: boolean;
  created_at: string;
}

async function fetchAllConversations(startIso: string, endIso: string): Promise<ConversationRow[]> {
  const all: ConversationRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("conversations")
      .select("session_id, assignee, status, created_at, updated_at, quote, booking")
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ConversationRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function fetchAllAssistantMessages(startIso: string, endIso: string): Promise<MessageRow[]> {
  const all: MessageRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("messages")
      .select("session_id, role, sent_by, is_edited, created_at")
      .eq("role", "assistant")
      .not("sent_by", "is", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("session_id", { ascending: true })
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as MessageRow[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

/** 평균응답시간을 위해 user 메시지도 필요 — session 내에서 user→assistant(sentBy) 페어링 */
async function fetchAllSessionMessages(sessionIds: string[], startIso: string, endIso: string): Promise<MessageRow[]> {
  if (sessionIds.length === 0) return [];
  const all: MessageRow[] = [];
  // session_id IN 청크로 분할 (URL 길이 제한 회피)
  const CHUNK = 200;
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("messages")
        .select("session_id, role, sent_by, is_edited, created_at")
        .in("session_id", chunk)
        .in("role", ["user", "assistant"])
        .gte("created_at", startIso)
        .lt("created_at", endIso)
        .order("session_id", { ascending: true })
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as MessageRow[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return all;
}

export async function computeAnalytics(startDate: string, endDate: string): Promise<AnalyticsResult> {
  const { startIso, endIso } = toDateRange(startDate, endDate);

  const [convRows, assistantMsgs] = await Promise.all([
    fetchAllConversations(startIso, endIso),
    fetchAllAssistantMessages(startIso, endIso),
  ]);

  // ── 시간대별 히트맵 (요일 × 24시간, KST 기준) ──
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of convRows) {
    const utc = new Date(r.created_at);
    const kst = new Date(utc.getTime() + 9 * 60 * 60 * 1000);
    heatmap[kst.getUTCDay()][kst.getUTCHours()]++;
  }

  // ── 예약 전환: orders 테이블 기준 (session_id로 매칭) ──
  const { data: ordersData } = await supabase
    .from("orders")
    .select("session_id")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .neq("status", "cancelled");
  const bookedSessionIds = new Set(
    (ordersData ?? []).filter(o => o.session_id).map(o => o.session_id)
  );

  // ── 종결 카운트 (per assignee, 시간당 종결수용) ──
  // updated_at IN [start, end) AND status='completed'
  // 페이지네이션
  const completedAssignees: string[] = [];
  {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("conversations")
        .select("assignee, updated_at, status")
        .eq("status", "completed")
        .not("assignee", "is", null)
        .gte("updated_at", startIso)
        .lt("updated_at", endIso)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      for (const r of rows) {
        if (r.assignee) completedAssignees.push(r.assignee);
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  const closuresByAssignee: Record<string, number> = {};
  for (const name of completedAssignees) {
    closuresByAssignee[name] = (closuresByAssignee[name] ?? 0) + 1;
  }

  // ── 상담사별 base 퍼포먼스 (conversations 기반) ──
  const assigneeBase: Record<string, { total: number; quoteSent: number; booked: number }> = {};
  for (const r of convRows) {
    const name = r.assignee || "미배정";
    if (!assigneeBase[name]) assigneeBase[name] = { total: 0, quoteSent: 0, booked: 0 };
    assigneeBase[name].total++;
    const q = r.quote;
    const hasSentAt = q?.sentAt != null;
    const legacyQuoteSent = !hasSentAt && QUOTE_SENT_STATUSES.includes(r.status);
    if (hasSentAt || legacyQuoteSent) assigneeBase[name].quoteSent++;
    if (r.session_id && bookedSessionIds.has(r.session_id)) assigneeBase[name].booked++;
  }

  // ── 메시지 기반 상담사 메트릭 ──
  const msgByCounselor: Record<string, MessageRow[]> = {};
  for (const m of assistantMsgs) {
    const name = m.sent_by!;
    if (!msgByCounselor[name]) msgByCounselor[name] = [];
    msgByCounselor[name].push(m);
  }

  // ── 평균 응답시간 — session 내 user → 다음 assistant(sent_by=name) 페어 ──
  // 활성 session 한정 (적어도 한 명의 상담사가 답변한 세션)
  const involvedSessionIds = Array.from(new Set(assistantMsgs.map(m => m.session_id)));
  const sessionMsgs = await fetchAllSessionMessages(involvedSessionIds, startIso, endIso);

  // Group by session
  const bySession: Record<string, MessageRow[]> = {};
  for (const m of sessionMsgs) {
    if (!bySession[m.session_id]) bySession[m.session_id] = [];
    bySession[m.session_id].push(m);
  }
  // 세션별 메시지를 시간순 정렬, 각 user 메시지 직후의 assistant(sentBy)와 페어링
  const responseDeltasByCounselor: Record<string, number[]> = {};
  for (const sid of Object.keys(bySession)) {
    const msgs = bySession[sid].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role !== "user") continue;
      // find next assistant with sent_by
      for (let j = i + 1; j < msgs.length; j++) {
        if (msgs[j].role === "assistant" && msgs[j].sent_by) {
          const deltaMs = new Date(msgs[j].created_at).getTime() - new Date(msgs[i].created_at).getTime();
          if (deltaMs > 0) {
            const name = msgs[j].sent_by!;
            if (!responseDeltasByCounselor[name]) responseDeltasByCounselor[name] = [];
            responseDeltasByCounselor[name].push(deltaMs);
          }
          break;
        }
        // user 메시지가 연속되면 무시 (가장 최근 user 기준이 자연스러움)
        if (msgs[j].role === "user") {
          // 다음 user를 새 시작점으로 — 현재 i의 페어링은 포기
          break;
        }
      }
    }
  }

  // 모든 등장 상담사 이름 집합 (자동발송 봇/시스템 제외)
  const counselorNames = new Set<string>(
    [
      ...Object.keys(assigneeBase),
      ...Object.keys(msgByCounselor),
    ].filter(isHumanCounselor)
  );

  const assignees: AssigneeMetrics[] = [];
  for (const name of counselorNames) {
    const base = assigneeBase[name] ?? { total: 0, quoteSent: 0, booked: 0 };
    const msgs = msgByCounselor[name] ?? [];
    const totalReplies = msgs.length;
    const aiAsIs = msgs.filter(m => !m.is_edited).length;
    const aiEdited = msgs.filter(m => m.is_edited).length;
    const aiAsIsRate = totalReplies > 0 ? Math.round((aiAsIs / totalReplies) * 1000) / 10 : null;

    let activeHours = 0;
    if (msgs.length >= 2) {
      const times = msgs.map(m => new Date(m.created_at).getTime());
      const min = Math.min(...times);
      const max = Math.max(...times);
      activeHours = Math.round(((max - min) / 3600000) * 10) / 10;
    }

    const repliesPerHour = activeHours >= 0.1 ? Math.round((totalReplies / activeHours) * 10) / 10 : null;
    const closuresCount = closuresByAssignee[name] ?? 0;
    const closuresPerHour = activeHours >= 0.1 ? Math.round((closuresCount / activeHours) * 10) / 10 : null;

    const deltas = responseDeltasByCounselor[name] ?? [];
    const medianResponseTimeMin = (() => {
      if (deltas.length === 0) return null;
      const sorted = [...deltas].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medMs = sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
      return Math.round((medMs / 60000) * 10) / 10;
    })();

    assignees.push({
      name,
      total: base.total,
      quoteSent: base.quoteSent,
      booked: base.booked,
      totalReplies,
      aiAsIs,
      aiEdited,
      aiAsIsRate,
      activeHours,
      repliesPerHour,
      closuresPerHour,
      medianResponseTimeMin,
    });
  }
  assignees.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  // ── 자동발송 봇/시스템 합산 — 단일 "AI" 행으로 추가 ──
  const botMsgs = Object.entries(msgByCounselor)
    .filter(([n]) => !isHumanCounselor(n))
    .flatMap(([, ms]) => ms);
  if (botMsgs.length > 0) {
    let botActiveHours = 0;
    if (botMsgs.length >= 2) {
      const times = botMsgs.map(m => new Date(m.created_at).getTime());
      botActiveHours = Math.round(((Math.max(...times) - Math.min(...times)) / 3600000) * 10) / 10;
    }
    const botRepliesPerHour = botActiveHours >= 0.1
      ? Math.round((botMsgs.length / botActiveHours) * 10) / 10
      : null;
    assignees.push({
      name: "AI",
      total: null,
      quoteSent: null,
      booked: null,
      totalReplies: botMsgs.length,
      aiAsIs: botMsgs.filter(m => !m.is_edited).length,
      aiEdited: botMsgs.filter(m => m.is_edited).length,
      aiAsIsRate: null,         // 봇은 항상 AI 자체 → 비교 무의미
      activeHours: botActiveHours,
      repliesPerHour: botRepliesPerHour,
      closuresPerHour: null,        // 봇은 종결 권한 없음
      medianResponseTimeMin: null,  // 봇은 자동 발송 → 응답시간 비교 무의미
    });
  }

  // ── 응답 시간 지표 (전체) ──
  const firstResponseTimes: number[] = [];
  const closeTimes: number[] = [];
  for (const r of convRows) {
    const createdMs = new Date(r.created_at).getTime();
    const q = r.quote;
    if (q?.sentAt) {
      const diff = q.sentAt - createdMs;
      if (diff > 0 && diff < 86400000) firstResponseTimes.push(diff);
    }
    if (CLOSED_STATUSES.includes(r.status) && r.updated_at) {
      const diff = new Date(r.updated_at).getTime() - createdMs;
      if (diff > 0 && diff < 7 * 86400000) closeTimes.push(diff);
    }
  }
  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };

  const responseMetrics: ResponseMetrics = {
    firstResponseAvg: avg(firstResponseTimes),
    firstResponseMedian: median(firstResponseTimes),
    closeTimeAvg: avg(closeTimes),
    closeTimeMedian: median(closeTimes),
    sampleCount: firstResponseTimes.length,
    closeSampleCount: closeTimes.length,
  };

  return {
    total: convRows.length,
    heatmap,
    assignees,
    responseMetrics,
    startDate,
    endDate,
  };
}

/** CSV 한 셀 escaping */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

export function buildAnalyticsCsv(result: AnalyticsResult): string {
  const period = `${result.startDate}~${result.endDate}`;
  const header = [
    "기간", "상담사",
    "총상담수", "견적발송수", "견적발송율(%)",
    "예약전환수", "예약전환율(%)",
    "총답변수", "AI", "AI수정사용", "AI 답변(%)",
    "시간당답변수", "시간당종결수", "응답시간 중위값(분)",
  ];
  const lines: string[] = [header.map(csvCell).join(",")];
  for (const a of result.assignees) {
    const quoteRate = (a.total !== null && a.quoteSent !== null && a.total > 0)
      ? Math.round((a.quoteSent / a.total) * 1000) / 10 : null;
    const bookedRate = (a.total !== null && a.booked !== null && a.total > 0)
      ? Math.round((a.booked / a.total) * 1000) / 10 : null;
    const row = [
      period, a.name,
      a.total, a.quoteSent, quoteRate,
      a.booked, bookedRate,
      a.totalReplies, a.aiAsIs, a.aiEdited, a.aiAsIsRate,
      a.repliesPerHour, a.closuresPerHour, a.medianResponseTimeMin,
    ];
    lines.push(row.map(csvCell).join(","));
  }
  // BOM (Excel Korean) + CRLF for Excel compatibility
  return "﻿" + lines.join("\r\n");
}
