// [CS-DSH-047] 재예약 (LTV) — 재예약률·리드타임·고객 생애 가치
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

interface OrderRow {
  id: string;
  phone: string;
  status: string;
  total_price: number;
  created_at: string;
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("010")) return digits;
  if (digits.length === 10 && digits.startsWith("10")) return "0" + digits;
  return null;
}

// 정규화된 11자리 → DB 에서 가능한 모든 표기 형식 (하이픈 포함/제외)
function phoneFormats(digits: string): string[] {
  const hyphenated = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return [digits, hyphenated];
}

function maskPhone(digits: string): string {
  return `010-XXXX-${digits.slice(7)}`;
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

    // period 내 첫 주문이 있는 phone 수집
    const periodOrders = await paginate<OrderRow>(() =>
      supabase
        .from("orders")
        .select("id, phone, status, total_price, created_at")
        .gte("created_at", fromIso)
        .lte("created_at", toEndIso)
        .neq("status", "cancelled"),
    );

    const periodPhones = new Set<string>();
    for (const o of periodOrders) {
      const norm = normalizePhone(o.phone);
      if (norm) periodPhones.add(norm);
    }

    if (periodPhones.size === 0) {
      return NextResponse.json({
        distribution: [],
        summary: { totalCustomers: 0, repeatCustomers: 0, repeatRate: 0, avgLeadTimeDays: 0, avgLtvKrw: 0 },
        topCustomers: [],
      });
    }

    // 해당 phone 의 전체 주문 (period 무관)
    // ⚠️ orders.phone 은 "010-1234-5678" 하이픈 형식으로 저장됨 — 정규화된 11자리로
    //    .in() 쿼리하면 매칭 0건. 두 표기 모두 query 에 포함시켜야 함.
    const CHUNK = 250;
    const phoneArr = [...periodPhones];
    const allOrders: OrderRow[] = [];
    for (let i = 0; i < phoneArr.length; i += CHUNK) {
      const chunk = phoneArr.slice(i, i + CHUNK);
      const allFormats = chunk.flatMap(phoneFormats);
      const rows = await paginate<OrderRow>(() =>
        supabase
          .from("orders")
          .select("id, phone, status, total_price, created_at")
          .in("phone", allFormats)
          .neq("status", "cancelled")
          .order("created_at", { ascending: true }),
      );
      allOrders.push(...rows);
    }

    // phone 정규화 후 그룹화
    const customerMap = new Map<string, OrderRow[]>();
    for (const o of allOrders) {
      const norm = normalizePhone(o.phone);
      if (!norm || !periodPhones.has(norm)) continue;
      const arr = customerMap.get(norm) ?? [];
      arr.push(o);
      customerMap.set(norm, arr);
    }

    // distribution: 1회, 2회, 3회+ 묶기
    const distMap = new Map<number, number>();
    let repeatCustomers = 0;
    let totalLeadTimeDays = 0;
    let leadTimeCount = 0;
    let totalLtv = 0;

    const topCandidates: { phoneMasked: string; orderCount: number; totalRevenue: number; firstOrderAt: string; lastOrderAt: string }[] = [];

    for (const [phone, orders] of customerMap.entries()) {
      const count = orders.length;
      const bucket = count >= 3 ? 3 : count;
      distMap.set(bucket, (distMap.get(bucket) ?? 0) + 1);

      const ltv = orders.reduce((s, o) => s + (o.total_price ?? 0), 0);
      totalLtv += ltv;

      if (count >= 2) {
        repeatCustomers++;
        const sorted = [...orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const leadMs = new Date(sorted[1].created_at).getTime() - new Date(sorted[0].created_at).getTime();
        totalLeadTimeDays += leadMs / (1000 * 60 * 60 * 24);
        leadTimeCount++;
      }

      topCandidates.push({
        phoneMasked: maskPhone(phone),
        orderCount: count,
        totalRevenue: ltv,
        firstOrderAt: orders[0].created_at,
        lastOrderAt: orders[orders.length - 1].created_at,
      });
    }

    const totalCustomers = customerMap.size;
    const distribution = [1, 2, 3].map((k) => ({
      orderCount: k,
      customerCount: distMap.get(k) ?? 0,
    }));

    topCandidates.sort((a, b) => b.totalRevenue - a.totalRevenue);
    const topCustomers = topCandidates.slice(0, 10);

    return NextResponse.json({
      distribution,
      summary: {
        totalCustomers,
        repeatCustomers,
        repeatRate: totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 1000) / 10 : 0,
        avgLeadTimeDays: leadTimeCount > 0 ? Math.round((totalLeadTimeDays / leadTimeCount) * 10) / 10 : 0,
        avgLtvKrw: totalCustomers > 0 ? Math.round(totalLtv / totalCustomers) : 0,
      },
      topCustomers,
    });
  } catch (err) {
    console.error("[repeat-customers] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
