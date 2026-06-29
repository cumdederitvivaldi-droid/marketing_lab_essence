import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { listAllUserChats } from "@/lib/channeltalk/client";

// [CS-DSH-031] CS Realtime 통합 KPI — 큐 깊이 / 처리량 / FRT median / AI 분류 / 상담사 KPI
//
// 운영시간(KST 08:00–22:00) 외 도착건은 별도 overnight 카드로 분리해 KPI 왜곡 방지.
// 상담사 카드는 오늘(KST 08–22) 기준 상담수 / 답변수 / 근무시간을 함께 집계.

export const maxDuration = 30;

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const OPERATING_START_HOUR = 8;
const OPERATING_END_HOUR = 22;

function inOperatingHourKst(epochMs: number): boolean {
  const hourKst = new Date(epochMs + KST_OFFSET_MS).getUTCHours();
  return hourKst >= OPERATING_START_HOUR && hourKst < OPERATING_END_HOUR;
}

/** 오늘 KST 하루 전체 윈도우 — 상담/답변 카운트용 (운영시간 외 답변도 포함) */
function todayKstDayWindow(now: number): { startMs: number; endMs: number } {
  const nowKstMs = now + KST_OFFSET_MS;
  const nowKst = new Date(nowKstMs);
  const yyyy = nowKst.getUTCFullYear();
  const mm = nowKst.getUTCMonth();
  const dd = nowKst.getUTCDate();
  const startMs = Date.UTC(yyyy, mm, dd, 0, 0, 0) - KST_OFFSET_MS;
  const endMs = Math.min(Date.UTC(yyyy, mm, dd, 24, 0, 0) - KST_OFFSET_MS, now);
  return { startMs, endMs };
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

interface ReplyRow {
  ts: number;
  sender: string | null;
  kind: "ai_auto" | "ai_assist" | "human" | null;
  respMs: number | null;
  system: "visit" | "lunch" | "channeltalk";
  /** 시스템별 세션 식별자 — 방문수거 / 런치 = session_id, 채널톡 = chat_id */
  sessionKey: string | null;
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const dayAgoIso = new Date(now - 86_400_000).toISOString();
  const today = todayKstDayWindow(now);
  const todayStartIso = new Date(today.startMs).toISOString();
  const todayEndIso = new Date(today.endMs).toISOString();

  // ─── 답변 로그 — 24시간치 (session_id / chat_id 포함, 오늘 상담사 KPI 도 동일 dataset 에서 집계) ───
  const [visitRes, lunchRes, ctRes, ctChatsResult, counselorsRes, presenceRes] = await Promise.all([
    supabase
      .from("messages")
      .select("created_at, sent_by, reply_kind, responded_in_ms, session_id")
      .eq("role", "assistant")
      .gte("created_at", dayAgoIso)
      .not("reply_kind", "is", null),
    supabase
      .from("lunch_messages")
      .select("created_at, sent_by, reply_kind, responded_in_ms, session_id")
      .eq("role", "assistant")
      .gte("created_at", dayAgoIso)
      .not("reply_kind", "is", null),
    supabase
      .from("channeltalk_reply_logs")
      .select("sent_at, manager_name, reply_kind, chat_id")
      .gte("sent_at", dayAgoIso),
    // 채널톡 큐 깊이 — opened state chats 카운트
    listAllUserChats({ state: "opened" }).catch(() => null),
    // 활성 상담사 목록 — 답변 0건이어도 카드에 표시
    supabase
      .from("app_settings")
      .select("key, value")
      .like("key", "counselor:%"),
    // 오늘 KST 운영시간 내 출석 로그 — 상담사별 distinct 분 = 근무시간(분)
    // 테이블이 아직 없을 수 있음 (migration 미적용) — 에러는 catch 후 [] 로 fallback
    // ⚠️ Supabase 기본 1000건 제한 → 다수 상담사 + 14h 운영시간 시 1000건 빨리 차서 누락 → 카드 근무 분이 멈춰보임
    //    .range(0, 49999) 로 5만건까지 확보 (10명 * 14h * 60min ≈ 8400건 — 충분)
    supabase
      .from("cs_presence_log")
      .select("user_name, recorded_at")
      .gte("recorded_at", todayStartIso)
      .lte("recorded_at", todayEndIso)
      .range(0, 49999),
  ]);

  const visit: ReplyRow[] = (visitRes.data ?? []).map((r) => ({
    ts: new Date(r.created_at as string).getTime(),
    sender: (r.sent_by as string | null) ?? null,
    kind: (r.reply_kind as ReplyRow["kind"]) ?? null,
    respMs: (r.responded_in_ms as number | null) ?? null,
    system: "visit",
    sessionKey: (r.session_id as string | null) ?? null,
  }));
  const lunch: ReplyRow[] = (lunchRes.data ?? []).map((r) => ({
    ts: new Date(r.created_at as string).getTime(),
    sender: (r.sent_by as string | null) ?? null,
    kind: (r.reply_kind as ReplyRow["kind"]) ?? null,
    respMs: (r.responded_in_ms as number | null) ?? null,
    system: "lunch",
    sessionKey: (r.session_id as string | null) ?? null,
  }));
  const ct: ReplyRow[] = (ctRes.data ?? []).map((r) => ({
    ts: new Date(r.sent_at as string).getTime(),
    sender: (r.manager_name as string | null) ?? null,
    kind: (r.reply_kind as ReplyRow["kind"]) ?? null,
    respMs: null,
    system: "channeltalk",
    sessionKey: (r.chat_id as string | null) ?? null,
  }));
  const all = [...visit, ...lunch, ...ct];

  // ─── 처리량 — 최근 1시간 답변 건수 ───
  const cutoff1h = now - 3600_000;
  const throughput = {
    visit: visit.filter((r) => r.ts >= cutoff1h).length,
    lunch: lunch.filter((r) => r.ts >= cutoff1h).length,
    channeltalk: ct.filter((r) => r.ts >= cutoff1h).length,
  };
  const throughputTotal = throughput.visit + throughput.lunch + throughput.channeltalk;

  // ─── First Response Time — 최근 30분 + user 메시지가 운영시간에 도착한 답변만 ───
  const cutoffFrt = now - 30 * 60_000;
  const isOpFrt = (r: ReplyRow) =>
    r.respMs != null && r.respMs > 0 && r.ts >= cutoffFrt && inOperatingHourKst(r.ts - r.respMs);
  const frtVisit = visit.filter(isOpFrt).map((r) => r.respMs!);
  const frtLunch = lunch.filter(isOpFrt).map((r) => r.respMs!);
  const firstResponseMedian = {
    visit: median(frtVisit),
    lunch: median(frtLunch),
    channeltalk: null as number | null, // 채널톡은 cases API 별도 — MVP 미포함
    visitCount: frtVisit.length,
    lunchCount: frtLunch.length,
  };

  // ─── AI 분류 — 24시간 ───
  function bucket(rs: ReplyRow[]) {
    let auto = 0;
    let assist = 0;
    let human = 0;
    for (const r of rs) {
      if (r.kind === "ai_auto") auto++;
      else if (r.kind === "ai_assist") assist++;
      else if (r.kind === "human") human++;
    }
    return { ai_auto: auto, ai_assist: assist, human, total: auto + assist + human };
  }
  const aiBreakdown = {
    visit: bucket(visit),
    lunch: bucket(lunch),
    channeltalk: bucket(ct),
    total: bucket(all),
  };

  // ─── 큐 깊이 — 답변 대기 중 세션 수 (한 세션에 5개 와도 1) ───
  // 방문수거: conversations 페이지의 "대기중" 탭과 동일 (status pending/needs_check)
  // 런치: 안 읽은 메시지가 있는 세션 (메뉴 뱃지와 동일 의미)
  const [{ count: visitUnread }, { count: lunchUnread }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "needs_check"]),
    supabase
      .from("lunch_conversations")
      .select("*", { count: "exact", head: true })
      .gt("unread_count", 0),
  ]);
  // 채널톡 — listAllUserChats 결과의 messages 로 마지막 매니저/봇 이후 연속 user 메시지 존재 여부 판단
  const ctUnreadChats = (() => {
    if (!ctChatsResult) return null;
    const msgsByChat = new Map<string, Array<{ personType: string; createdAt: number; log?: unknown }>>();
    for (const m of ctChatsResult.messages ?? []) {
      if ((m as { log?: unknown }).log) continue;
      if (!msgsByChat.has(m.chatId)) msgsByChat.set(m.chatId, []);
      msgsByChat.get(m.chatId)!.push({ personType: m.personType, createdAt: m.createdAt });
    }
    let unreadChatCount = 0;
    for (const chat of ctChatsResult.userChats) {
      const msgs = msgsByChat.get(chat.id);
      if (!msgs || msgs.length === 0) continue;
      msgs.sort((a, b) => b.createdAt - a.createdAt); // 최신순
      // 마지막 매니저/봇 메시지 이전에 user 메시지가 있으면 unread
      let hasUnread = false;
      for (const m of msgs) {
        if (m.personType === "user") { hasUnread = true; break; }
        break; // 매니저/봇이 마지막이면 read
      }
      if (hasUnread) unreadChatCount++;
    }
    return unreadChatCount;
  })();
  const queueDepth = {
    visit: visitUnread ?? 0,
    lunch: lunchUnread ?? 0,
    channeltalk: ctUnreadChats,
  };

  // ─── Overnight Proxy — 응답시간 1시간 이상 (= 새벽 큐 처리 흔적) ───
  const HOUR_MS = 60 * 60_000;
  const overnight = {
    visit: visit.filter((r) => r.respMs != null && r.respMs > HOUR_MS).length,
    lunch: lunch.filter((r) => r.respMs != null && r.respMs > HOUR_MS).length,
  };

  // ─── 활성 상담사 목록 (app_settings) — 답변 0건이어도 카드에 출력 ───
  const activeCounselorNames: string[] = [];
  for (const row of counselorsRes.data ?? []) {
    const v = typeof row.value === "string"
      ? (() => { try { return JSON.parse(row.value as string); } catch { return null; } })()
      : (row.value as { is_active?: boolean } | null);
    if (!v) continue;
    if (v.is_active === false) continue; // 명시적 비활성만 제외 (undefined 는 활성으로 간주)
    const name = (row.key as string).replace(/^counselor:/, "");
    if (!name) continue;
    activeCounselorNames.push(name);
  }

  // ─── 오늘 KST 운영시간(08–22) 내 distinct 분 = 근무시간(분) ───
  // 출석 로그는 운영시간 외에도 들어올 수 있으므로 row 별로 운영시간 체크.
  // 동시에 lastActivityAt (DB 진본) 도 user 별로 추적 — presence 채널 stale 시 폴백.
  const minutesByUser = new Map<string, Set<number>>();
  const lastActivityByUser = new Map<string, number>();
  for (const row of presenceRes.data ?? []) {
    const ts = new Date(row.recorded_at as string).getTime();
    if (ts < today.startMs || ts > today.endMs) continue;
    const userName = row.user_name as string;
    // 활동 진본 — 운영시간 무관하게 today 내 최신 heartbeat
    const prevAct = lastActivityByUser.get(userName) ?? 0;
    if (ts > prevAct) lastActivityByUser.set(userName, ts);
    if (!inOperatingHourKst(ts)) continue; // 근무 시간은 08–22 한정
    const minute = Math.floor(ts / 60_000);
    let set = minutesByUser.get(userName);
    if (!set) { set = new Set(); minutesByUser.set(userName, set); }
    set.add(minute);
  }

  // ─── 상담사 KPI 집계 ───
  // 카드 노출은 "오늘 KST 하루 전체(00–24)" 기준 — 운영시간 외 답변(새벽/늦은시간)도 카운트.
  // (운영시간 한정은 근무 분 / FRT median KPI 에서만 사용)
  // 시스템별 (visit / lunch / channeltalk) 따로 집계해 카드에서 분리 표시.
  type SysCounts = { sessions: Set<string>; replies: number };
  const newSysCounts = (): SysCounts => ({ sessions: new Set(), replies: 0 });
  type OpAgg = {
    name: string;
    systems: Set<string>;
    todayReplyCount: number;
    todaySessions: Set<string>;
    todayAiAuto: number; todayAiAssist: number; todayHuman: number;
    todayRespMsList: number[];
    todayBySystem: { visit: SysCounts; lunch: SysCounts; channeltalk: SysCounts };
    lastReplyAt: number;  // 24시간 내 마지막 답변 시각 (epoch ms) — 데스크앱/모바일로 답변하는 상담사도 active 표시 위해
  };
  const opMap = new Map<string, OpAgg>();
  const ensure = (name: string): OpAgg => {
    let agg = opMap.get(name);
    if (!agg) {
      agg = {
        name, systems: new Set(),
        todayReplyCount: 0, todaySessions: new Set(),
        todayAiAuto: 0, todayAiAssist: 0, todayHuman: 0,
        todayRespMsList: [],
        todayBySystem: { visit: newSysCounts(), lunch: newSysCounts(), channeltalk: newSysCounts() },
        lastReplyAt: 0,
      };
      opMap.set(name, agg);
    }
    return agg;
  };

  for (const r of all) {
    const name = r.sender ?? "(미지정)";
    const agg = ensure(name);
    agg.systems.add(r.system);
    if (r.ts > agg.lastReplyAt) agg.lastReplyAt = r.ts;
    // 오늘 KST 하루 전체 윈도우 내 답변 카운트 (운영시간 외 새벽/늦은시간 답변도 포함)
    if (r.ts >= today.startMs && r.ts <= today.endMs) {
      agg.todayReplyCount++;
      if (r.sessionKey) agg.todaySessions.add(`${r.system}:${r.sessionKey}`);
      if (r.kind === "ai_auto") agg.todayAiAuto++;
      else if (r.kind === "ai_assist") agg.todayAiAssist++;
      else if (r.kind === "human") agg.todayHuman++;
      // 시스템별 분리 집계 — 카드에서 방/런/채 분리 표시
      const bs = agg.todayBySystem[r.system];
      bs.replies++;
      if (r.sessionKey) bs.sessions.add(r.sessionKey);
      // 응답시간 median 은 운영시간 내 user 메시지에 대한 응답만 (KPI 일관성)
      if (r.respMs != null && r.respMs > 0 && inOperatingHourKst(r.ts - r.respMs)) {
        agg.todayRespMsList.push(r.respMs);
      }
    }
  }

  // 활성 상담사 명단을 모두 보장 (답변 0건이어도 카드 노출)
  for (const name of activeCounselorNames) ensure(name);

  // 노이즈 라벨 제외 — 카드에 표시할 가치 없음
  const HIDDEN = new Set(["(미지정)", "AI", "시스템"]);

  const operators = [...opMap.values()]
    .filter((a) => !HIDDEN.has(a.name))
    .map((a) => ({
      name: a.name,
      systems: [...a.systems],
      // 모든 카운트는 오늘 KST 하루 전체(00–24) 기준 (운영시간 외 답변도 포함)
      todayConsultCount: a.todaySessions.size,
      todayReplyCount: a.todayReplyCount,
      todayAiAuto: a.todayAiAuto,
      todayAiAssist: a.todayAiAssist,
      todayHuman: a.todayHuman,
      todayMedianRespMs: median(a.todayRespMsList),
      todayBySystem: {
        visit: { consults: a.todayBySystem.visit.sessions.size, replies: a.todayBySystem.visit.replies },
        lunch: { consults: a.todayBySystem.lunch.sessions.size, replies: a.todayBySystem.lunch.replies },
        channeltalk: { consults: a.todayBySystem.channeltalk.sessions.size, replies: a.todayBySystem.channeltalk.replies },
      },
      onlineMinutesToday: minutesByUser.get(a.name)?.size ?? 0,
      lastReplyAt: a.lastReplyAt || null,
      lastActivityAt: lastActivityByUser.get(a.name) ?? null,
    }))
    .sort((a, b) => {
      // 1차: 오늘 답변 많은 순, 2차: 근무 시간 긴 순
      if (b.todayReplyCount !== a.todayReplyCount) return b.todayReplyCount - a.todayReplyCount;
      return b.onlineMinutesToday - a.onlineMinutesToday;
    });

  return NextResponse.json({
    generatedAt: new Date(now).toISOString(),
    throughput: { ...throughput, total: throughputTotal },
    firstResponseMedian,
    aiBreakdown,
    queueDepth,
    overnight,
    operators,
  });
}
