import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const VALID_STATUSES = ["cancelled", "payment_requested", "confirmed", "completed"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];
const MAX_MESSAGES_PER_SESSION = 200;

export const maxDuration = 30;

interface OrderOut {
  id: string;
  sessionId: string | null;
  customerName: string;
  phone: string;
  address: string;
  date: string | null;
  timeSlot: string | null;
  totalPrice: number;
  status: string;
  createdAt: string;
  messages: Array<{ id: string; role: string; content: string; createdAt: string; sentBy: string | null }>;
}

// [CS-DSH-034] Health Check 카드 상세 — 취소율 / 미결제율 등 status 별 orders + 채팅
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { status, fromIso, toIso } = (await request.json()) as { status?: string; fromIso?: string; toIso?: string };
    if (!status || !fromIso || !toIso) {
      return NextResponse.json({ error: "status/fromIso/toIso required" }, { status: 400 });
    }
    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    const targetStatus = status as ValidStatus;

    // 1. 기간 + status 로 orders fetch
    const orderRows = await paginate<{
      id: string;
      session_id: string | null;
      customer_name: string | null;
      phone: string | null;
      address: string | null;
      date: string | null;
      time_slot: string | null;
      total_price: number | null;
      status: string;
      created_at: string;
    }>(() =>
      supabase
        .from("orders")
        .select("id, session_id, customer_name, phone, address, date, time_slot, total_price, status, created_at")
        .eq("status", targetStatus)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false }),
    );
    if (orderRows.length === 0) {
      return NextResponse.json({ status: targetStatus, orders: [] });
    }

    // 2. 각 order의 session messages 병렬 fetch
    const out = await Promise.all(orderRows.map(async (o): Promise<OrderOut> => {
      let messages: OrderOut["messages"] = [];
      if (o.session_id) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("id, role, content, created_at, sent_by")
          .eq("session_id", o.session_id)
          .order("created_at", { ascending: true })
          .limit(MAX_MESSAGES_PER_SESSION);
        messages = (msgs ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          sentBy: m.sent_by ?? null,
        }));
      }
      return {
        id: o.id,
        sessionId: o.session_id,
        customerName: o.customer_name ?? "",
        phone: o.phone ?? "",
        address: o.address ?? "",
        date: o.date,
        timeSlot: o.time_slot,
        totalPrice: o.total_price ?? 0,
        status: o.status,
        createdAt: o.created_at,
        messages,
      };
    }));

    return NextResponse.json({ status: targetStatus, orders: out });
  } catch (err) {
    console.error("[new_dashboard/orders-detail] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
