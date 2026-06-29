import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

// [CS-DSH-042] 상담사 일별 상담 기록 — 상담사 카드 모달 데이터.
//   각 일자마다:
//     - 상담수: 운영시간 내 distinct (system + session/chat) 수
//     - 답변수: 운영시간 내 총 답변 메시지 수 (방문수거 + 런치 + 채널톡)
//     - 근무 분: cs_presence_log distinct 1분 bucket
//   모두 KST 08–22 운영시간 한정.

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const OPERATING_START_HOUR = 8;
const OPERATING_END_HOUR = 22;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;

export const maxDuration = 30;

interface PresenceRow { user_name: string; recorded_at: string }
interface VisitOrLunchMsgRow { session_id: string; created_at: string }
interface CtMsgRow { chat_id: string; sent_at: string }

function inOperatingHourKst(epochMs: number): boolean {
  const hour = new Date(epochMs + KST_OFFSET_MS).getUTCHours();
  return hour >= OPERATING_START_HOUR && hour < OPERATING_END_HOUR;
}

function dateKeyKst(epochMs: number): string {
  const d = new Date(epochMs + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const counselor = searchParams.get("counselor");
    if (!counselor) {
      return NextResponse.json({ error: "counselor required" }, { status: 400 });
    }
    const fromParam = searchParams.get("from"); // "YYYY-MM-DD" KST 날짜
    const toParam = searchParams.get("to");     // "YYYY-MM-DD" KST 날짜
    const daysParam = parseInt(searchParams.get("days") ?? "", 10);

    // 날짜 윈도우 결정 — from/to 가 있으면 우선, 없으면 days preset
    const now = Date.now();
    const nowKst = new Date(now + KST_OFFSET_MS);
    const todayKstYear = nowKst.getUTCFullYear();
    const todayKstMonth = nowKst.getUTCMonth();
    const todayKstDate = nowKst.getUTCDate();

    let windowFromY: number, windowFromM: number, windowFromD: number;
    let windowToY: number, windowToM: number, windowToD: number;
    let days: number;

    const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/;
    const fromMatch = fromParam ? dateRe.exec(fromParam) : null;
    const toMatch = toParam ? dateRe.exec(toParam) : null;

    if (fromMatch && toMatch) {
      windowFromY = parseInt(fromMatch[1], 10);
      windowFromM = parseInt(fromMatch[2], 10) - 1;
      windowFromD = parseInt(fromMatch[3], 10);
      windowToY = parseInt(toMatch[1], 10);
      windowToM = parseInt(toMatch[2], 10) - 1;
      windowToD = parseInt(toMatch[3], 10);
      // from <= to 보장 + 일수 계산
      const fromMs = Date.UTC(windowFromY, windowFromM, windowFromD);
      const toMs = Date.UTC(windowToY, windowToM, windowToD);
      if (fromMs > toMs) {
        return NextResponse.json({ error: "from > to" }, { status: 400 });
      }
      days = Math.floor((toMs - fromMs) / 86_400_000) + 1;
      if (days > MAX_DAYS) {
        return NextResponse.json({ error: `days exceeds MAX_DAYS (${MAX_DAYS})` }, { status: 400 });
      }
    } else {
      days = Number.isFinite(daysParam) && daysParam > 0
        ? Math.min(daysParam, MAX_DAYS)
        : DEFAULT_DAYS;
      // 오늘 → N-1일 전
      windowToY = todayKstYear; windowToM = todayKstMonth; windowToD = todayKstDate;
      const fromDate = new Date(Date.UTC(todayKstYear, todayKstMonth, todayKstDate - (days - 1)));
      windowFromY = fromDate.getUTCFullYear();
      windowFromM = fromDate.getUTCMonth();
      windowFromD = fromDate.getUTCDate();
    }

    const fromIso = new Date(Date.UTC(windowFromY, windowFromM, windowFromD, 0, 0, 0) - KST_OFFSET_MS).toISOString();
    const toIso = new Date(Date.UTC(windowToY, windowToM, windowToD, 24, 0, 0) - KST_OFFSET_MS).toISOString();

    const [presenceRows, visitMsgs, lunchMsgs, ctMsgs] = await Promise.all([
      paginate<PresenceRow>(() =>
        supabase
          .from("cs_presence_log")
          .select("user_name, recorded_at")
          .eq("user_name", counselor)
          .gte("recorded_at", fromIso)
          .lte("recorded_at", toIso),
      ).catch((err) => {
        console.warn("[work-history] cs_presence_log 조회 실패:", err);
        return [] as PresenceRow[];
      }),
      paginate<VisitOrLunchMsgRow>(() =>
        supabase
          .from("messages")
          .select("session_id, created_at")
          .eq("sent_by", counselor)
          .eq("role", "assistant")
          .not("reply_kind", "is", null)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
      ),
      paginate<VisitOrLunchMsgRow>(() =>
        supabase
          .from("lunch_messages")
          .select("session_id, created_at")
          .eq("sent_by", counselor)
          .eq("role", "assistant")
          .not("reply_kind", "is", null)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
      ),
      paginate<CtMsgRow>(() =>
        supabase
          .from("channeltalk_reply_logs")
          .select("chat_id, sent_at")
          .eq("manager_name", counselor)
          .gte("sent_at", fromIso)
          .lte("sent_at", toIso),
      ),
    ]);

    // ─── 일별 집계 ───
    // - 근무 분: 운영시간(08–22) 한정 — 정시 근무 시간만 산정
    // - 상담/답변: 하루 전체(00–24) — 새벽·늦은시간 답변도 활동으로 카운트
    // - 시스템별(visit/lunch/channeltalk) 분리 집계 — 모달에서 방/런/채 분리 표시
    type Sys = "visit" | "lunch" | "channeltalk";
    const minutesByDate = new Map<string, Set<number>>();
    const sessionsByDateBySys: Record<Sys, Map<string, Set<string>>> = {
      visit: new Map(), lunch: new Map(), channeltalk: new Map(),
    };
    const repliesByDateBySys: Record<Sys, Map<string, number>> = {
      visit: new Map(), lunch: new Map(), channeltalk: new Map(),
    };

    for (const row of presenceRows) {
      const ts = new Date(row.recorded_at).getTime();
      if (!inOperatingHourKst(ts)) continue;
      const key = dateKeyKst(ts);
      let set = minutesByDate.get(key);
      if (!set) { set = new Set(); minutesByDate.set(key, set); }
      set.add(Math.floor(ts / 60_000));
    }

    function tallyMessage(system: Sys, ts: number, sessionId: string) {
      const key = dateKeyKst(ts);
      let sset = sessionsByDateBySys[system].get(key);
      if (!sset) { sset = new Set(); sessionsByDateBySys[system].set(key, sset); }
      sset.add(sessionId);
      repliesByDateBySys[system].set(key, (repliesByDateBySys[system].get(key) ?? 0) + 1);
    }

    for (const m of visitMsgs) tallyMessage("visit", new Date(m.created_at).getTime(), m.session_id);
    for (const m of lunchMsgs) tallyMessage("lunch", new Date(m.created_at).getTime(), m.session_id);
    for (const m of ctMsgs) tallyMessage("channeltalk", new Date(m.sent_at).getTime(), m.chat_id);

    // ─── 윈도우 내 모든 날짜 채우기 (없는 날은 0) — to → from (최신 → 오래된 순) ───
    const todayKey = `${todayKstYear}-${String(todayKstMonth + 1).padStart(2, "0")}-${String(todayKstDate).padStart(2, "0")}`;
    interface SysCount { consults: number; replies: number }
    const records: Array<{
      dateKst: string;
      minutes: number;
      consultCount: number;
      replyCount: number;
      bySystem: { visit: SysCount; lunch: SysCount; channeltalk: SysCount };
      isToday: boolean;
    }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.UTC(windowToY, windowToM, windowToD - i));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const visit = {
        consults: sessionsByDateBySys.visit.get(key)?.size ?? 0,
        replies: repliesByDateBySys.visit.get(key) ?? 0,
      };
      const lunch = {
        consults: sessionsByDateBySys.lunch.get(key)?.size ?? 0,
        replies: repliesByDateBySys.lunch.get(key) ?? 0,
      };
      const channeltalk = {
        consults: sessionsByDateBySys.channeltalk.get(key)?.size ?? 0,
        replies: repliesByDateBySys.channeltalk.get(key) ?? 0,
      };
      records.push({
        dateKst: key,
        minutes: minutesByDate.get(key)?.size ?? 0,
        // 시스템별 session_id 는 다른 시스템과 겹치지 않으므로 단순 합산
        consultCount: visit.consults + lunch.consults + channeltalk.consults,
        replyCount: visit.replies + lunch.replies + channeltalk.replies,
        bySystem: { visit, lunch, channeltalk },
        isToday: key === todayKey,
      });
    }

    const totalMinutes = records.reduce((s, r) => s + r.minutes, 0);
    const totalConsults = records.reduce((s, r) => s + r.consultCount, 0);
    const totalReplies = records.reduce((s, r) => s + r.replyCount, 0);
    const workedDayCount = records.filter((r) => r.minutes > 0 || r.replyCount > 0).length;
    const avgMinutesPerWorkedDay = workedDayCount > 0 ? Math.round(totalMinutes / workedDayCount) : 0;
    const avgRepliesPerWorkedDay = workedDayCount > 0 ? Math.round(totalReplies / workedDayCount) : 0;

    const fromDateKst = `${windowFromY}-${String(windowFromM + 1).padStart(2, "0")}-${String(windowFromD).padStart(2, "0")}`;
    const toDateKst = `${windowToY}-${String(windowToM + 1).padStart(2, "0")}-${String(windowToD).padStart(2, "0")}`;

    return NextResponse.json({
      counselor,
      days,
      fromDateKst,
      toDateKst,
      operatingHoursKst: { start: OPERATING_START_HOUR, end: OPERATING_END_HOUR },
      records,
      summary: {
        totalMinutes,
        totalConsults,
        totalReplies,
        workedDayCount,
        avgMinutesPerWorkedDay,
        avgRepliesPerWorkedDay,
      },
    });
  } catch (err) {
    console.error("[cs-realtime/work-history] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
