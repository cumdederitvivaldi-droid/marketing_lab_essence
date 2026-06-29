// [CS-DSH-046] 첫 응답 속도 ↔ 전환률 — 응답 시간 구간별 전환률 + AI vs 사람
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const ACTIVE_STATUSES = ["confirmed", "payment_requested", "completed"] as const;

interface ConvRow {
  session_id: string;
}

interface MsgRow {
  session_id: string;
  role: string;
  sent_by: string | null;
  created_at: string;
}

interface OrderRow {
  session_id: string;
  status: string;
}

interface ResponseTimeBucket {
  range: string;
  totalConvs: number;
  converted: number;
  conversionRate: number;
  aiCount: number;
  humanCount: number;
}

const RANGES = [
  { range: "1분 미만", minMin: 0, maxMin: 1 },
  { range: "1–5분", minMin: 1, maxMin: 5 },
  { range: "5–30분", minMin: 5, maxMin: 30 },
  { range: "30분–1시간", minMin: 30, maxMin: 60 },
  { range: "1시간+", minMin: 60, maxMin: Infinity },
  { range: "무응답", minMin: -1, maxMin: -1 },
];

function getRangeIndex(minutes: number | null): number {
  if (minutes === null) return 5;
  for (let i = 0; i < RANGES.length - 1; i++) {
    if (minutes < RANGES[i].maxMin) return i;
  }
  return 4;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const fromDate = params.get("fromDate");
    const toDate = params.get("toDate");
    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "fromDate and toDate required (YYYY-MM-DD)" }, { status: 400 });
    }

    const fromIso = new Date(`${fromDate}T00:00:00+09:00`).toISOString();
    const toEndIso = new Date(`${toDate}T23:59:59.999+09:00`).toISOString();

    const convRows = await paginate<ConvRow>(() =>
      supabase
        .from("conversations")
        .select("session_id")
        .gte("created_at", fromIso)
        .lte("created_at", toEndIso),
    );

    if (convRows.length === 0) {
      return NextResponse.json({
        buckets: RANGES.map((r) => ({ range: r.range, totalConvs: 0, converted: 0, conversionRate: 0, aiCount: 0, humanCount: 0 })),
        summary: { avgResponseMinutes: 0, fastestRangeRate: 0, totalConvs: 0 },
      });
    }

    const sessionIds = [...new Set(convRows.map((c) => c.session_id))];
    const CHUNK = 500;
    const msgRows: MsgRow[] = [];
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const chunk = sessionIds.slice(i, i + CHUNK);
      const rows = await paginate<MsgRow>(() =>
        supabase
          .from("messages")
          .select("session_id, role, sent_by, created_at")
          .in("session_id", chunk)
          .order("created_at", { ascending: true }),
      );
      msgRows.push(...rows);
    }

    const orderRows: OrderRow[] = [];
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const chunk = sessionIds.slice(i, i + CHUNK);
      const rows = await paginate<OrderRow>(() =>
        supabase
          .from("orders")
          .select("session_id, status")
          .in("session_id", chunk)
          .in("status", [...ACTIVE_STATUSES]),
      );
      orderRows.push(...rows);
    }

    const convertedSessions = new Set(orderRows.map((o) => o.session_id));

    const msgsBySession = new Map<string, MsgRow[]>();
    for (const m of msgRows) {
      const arr = msgsBySession.get(m.session_id) ?? [];
      arr.push(m);
      msgsBySession.set(m.session_id, arr);
    }

    type BucketAcc = { totalConvs: number; converted: number; aiCount: number; humanCount: number; responseMinutesSum: number; responseCount: number };
    const buckets: BucketAcc[] = RANGES.map(() => ({ totalConvs: 0, converted: 0, aiCount: 0, humanCount: 0, responseMinutesSum: 0, responseCount: 0 }));

    for (const sid of sessionIds) {
      const msgs = msgsBySession.get(sid) ?? [];
      const firstUser = msgs.find((m) => m.role === "user");
      const firstAssistant = msgs.find((m) => m.role === "assistant");

      let responseMinutes: number | null = null;
      let isAi = false;

      if (firstUser && firstAssistant) {
        const diffMs = new Date(firstAssistant.created_at).getTime() - new Date(firstUser.created_at).getTime();
        responseMinutes = diffMs > 0 ? diffMs / 60000 : 0;
        isAi = firstAssistant.sent_by === null || firstAssistant.sent_by === "AI";
      }

      const idx = getRangeIndex(responseMinutes);
      buckets[idx].totalConvs++;
      if (convertedSessions.has(sid)) buckets[idx].converted++;
      if (responseMinutes !== null) {
        if (isAi) buckets[idx].aiCount++;
        else buckets[idx].humanCount++;
        buckets[idx].responseMinutesSum += responseMinutes;
        buckets[idx].responseCount++;
      }
    }

    const result: ResponseTimeBucket[] = RANGES.map((r, i) => ({
      range: r.range,
      totalConvs: buckets[i].totalConvs,
      converted: buckets[i].converted,
      conversionRate: buckets[i].totalConvs > 0 ? Math.round((buckets[i].converted / buckets[i].totalConvs) * 1000) / 10 : 0,
      aiCount: buckets[i].aiCount,
      humanCount: buckets[i].humanCount,
    }));

    const totalResponseCount = buckets.slice(0, 5).reduce((s, b) => s + b.responseCount, 0);
    const totalResponseMinutes = buckets.slice(0, 5).reduce((s, b) => s + b.responseMinutesSum, 0);
    const avgResponseMinutes = totalResponseCount > 0 ? Math.round((totalResponseMinutes / totalResponseCount) * 10) / 10 : 0;

    const fastestRange = result.slice(0, 5).reduce(
      (best, cur) => (cur.totalConvs > 5 && cur.conversionRate > best.conversionRate ? cur : best),
      result[0],
    );

    return NextResponse.json({
      buckets: result,
      summary: {
        avgResponseMinutes,
        fastestRangeRate: fastestRange.conversionRate,
        totalConvs: sessionIds.length,
      },
    });
  } catch (err) {
    console.error("[response-time] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
