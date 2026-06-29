// [CS-DSH-048] 전화상담 실험 분석 — 전화요청 tag 카운트, 일자별, 전환율
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

interface ConvRow {
  session_id: string;
  user_key: string | null;
  name: string | null;
  phone: string | null;
  status: string;
  tags: string[] | null;
  current_phase: string | null;
  created_at: string;
  updated_at: string;
  assignee: string | null;
}

interface OrderRow {
  id: string;
  session_id: string | null;
  phone: string | null;
  customer_name: string | null;
  status: string;
  total_price: number | null;
  created_at: string;
}

interface DailyBucket {
  date: string;
  total: number;
  converted: number;
  cancelled: number;
  pending: number;
}

interface SessionItem {
  sessionId: string;
  name: string | null;
  phone: string | null;
  status: string;
  currentPhase: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  isCompleted: boolean;
  isConverted: boolean;
  hasOrder: boolean;
  orderStatus: string | null;
  orderTotal: number | null;
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010")) return digits;
  if (digits.length === 10 && digits.startsWith("10")) return "0" + digits;
  return null;
}

function isoToKstYmd(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
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

    // 1. 전화요청 / 전화요청완료 tag 가 있는 conversations
    //    .overlaps() 는 array 컬럼에 한 값이라도 겹치면 매칭 — postgres `&&` 연산자.
    const convs = await paginate<ConvRow>(() =>
      supabase
        .from("conversations")
        .select("session_id, user_key, name, phone, status, tags, current_phase, created_at, updated_at, assignee")
        .gte("created_at", fromIso)
        .lte("created_at", toEndIso)
        .overlaps("tags", ["전화요청", "전화요청완료"])
        .order("created_at", { ascending: false }),
    );

    if (convs.length === 0) {
      return NextResponse.json({
        summary: {
          total: 0, completed: 0, completionRate: 0,
          converted: 0, conversionRate: 0,
          inProgress: 0,
        },
        daily: [],
        sessions: [],
      });
    }

    // 2. 해당 sessions 의 orders 매칭 — sessionId 기준 + phone 기준 (보조)
    const sessionIds = convs.map((c) => c.session_id);
    const phoneDigits = new Set<string>();
    for (const c of convs) {
      const norm = normalizePhone(c.phone);
      if (norm) phoneDigits.add(norm);
    }

    // session_id 매칭 우선
    const ordersBySession: OrderRow[] = [];
    {
      const CHUNK = 250;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const rows = await paginate<OrderRow>(() =>
          supabase
            .from("orders")
            .select("id, session_id, phone, customer_name, status, total_price, created_at")
            .in("session_id", chunk),
        );
        ordersBySession.push(...rows);
      }
    }

    // phone 매칭 (보조) — session_id 가 없는 OLD order 대응. period 기간 ± 30일 범위.
    const phoneToOrders = new Map<string, OrderRow[]>();
    if (phoneDigits.size > 0) {
      const phones: string[] = [];
      for (const d of phoneDigits) {
        phones.push(d);
        phones.push(`${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`);
      }
      const expandFromIso = new Date(new Date(fromIso).getTime() - 30 * 86400000).toISOString();
      const expandToIso = new Date(new Date(toEndIso).getTime() + 30 * 86400000).toISOString();
      const CHUNK = 250;
      for (let i = 0; i < phones.length; i += CHUNK) {
        const chunk = phones.slice(i, i + CHUNK);
        const rows = await paginate<OrderRow>(() =>
          supabase
            .from("orders")
            .select("id, session_id, phone, customer_name, status, total_price, created_at")
            .in("phone", chunk)
            .gte("created_at", expandFromIso)
            .lte("created_at", expandToIso),
        );
        for (const o of rows) {
          const norm = normalizePhone(o.phone);
          if (!norm) continue;
          if (!phoneToOrders.has(norm)) phoneToOrders.set(norm, []);
          phoneToOrders.get(norm)!.push(o);
        }
      }
    }

    // session_id 별 best order 결정 (우선순위: session 매칭 → phone 매칭의 최근 1건)
    const ordersBySessionId = new Map<string, OrderRow>();
    for (const o of ordersBySession) {
      if (!o.session_id) continue;
      const prev = ordersBySessionId.get(o.session_id);
      if (!prev || new Date(o.created_at) > new Date(prev.created_at)) {
        ordersBySessionId.set(o.session_id, o);
      }
    }

    // 3. session 별 분석 row 생성
    const sessions: SessionItem[] = convs.map((c) => {
      let order: OrderRow | undefined = ordersBySessionId.get(c.session_id);
      if (!order) {
        const norm = normalizePhone(c.phone);
        if (norm) {
          const list = phoneToOrders.get(norm) ?? [];
          // conv.created_at 이후 + 7일 내에 만들어진 order 우선
          const convTs = new Date(c.created_at).getTime();
          const within = list
            .filter((o) => {
              const ts = new Date(o.created_at).getTime();
              return ts >= convTs - 86400000 && ts <= convTs + 7 * 86400000;
            })
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          order = within[0];
        }
      }
      const tags = c.tags ?? [];
      const isCompleted = tags.includes("전화요청완료");
      const orderStatus = order?.status ?? null;
      // 전환: order 가 있으면 무조건 예약완료로 카운트 (취소 포함 — 일단 예약은 했었으니까)
      const isConverted = !!order;
      return {
        sessionId: c.session_id,
        name: c.name ?? order?.customer_name ?? null,
        phone: c.phone,
        status: c.status,
        currentPhase: c.current_phase,
        assignee: c.assignee,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        isCompleted,
        isConverted,
        hasOrder: !!order,
        orderStatus,
        orderTotal: order?.total_price ?? null,
      };
    });

    // 4. summary
    const total = sessions.length;
    const completed = sessions.filter((s) => s.isCompleted).length;
    const converted = sessions.filter((s) => s.isConverted).length;
    const inProgress = total - completed;

    // 5. daily breakdown (KST)
    const dailyMap = new Map<string, DailyBucket>();
    for (const s of sessions) {
      const ymd = isoToKstYmd(s.createdAt);
      if (!dailyMap.has(ymd)) {
        dailyMap.set(ymd, { date: ymd, total: 0, converted: 0, cancelled: 0, pending: 0 });
      }
      const b = dailyMap.get(ymd)!;
      b.total += 1;
      if (s.isConverted) b.converted += 1;
      else if (s.orderStatus === "cancelled") b.cancelled += 1;
      else if (!s.isCompleted) b.pending += 1;
    }
    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      summary: {
        total,
        completed,
        completionRate: total ? Math.round((completed / total) * 1000) / 10 : 0,
        converted,
        conversionRate: total ? Math.round((converted / total) * 1000) / 10 : 0,
        inProgress,
      },
      daily,
      sessions,
    });
  } catch (e) {
    console.error("[phone-consultations] error", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
