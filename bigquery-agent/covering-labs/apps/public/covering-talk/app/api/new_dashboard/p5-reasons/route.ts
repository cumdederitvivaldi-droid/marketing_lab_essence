import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { fetchConversationsInRange } from "@/lib/dashboard/funnel";
import { classifyP5Reasons, P5_REASON_KEYWORDS } from "@/lib/dashboard/p5-classify";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const NUDGE_STATUSES = new Set(["quote_sent_nudge", "nudge_sent"]);

export const maxDuration = 60;

// [CS-ADM-022] P5 넛지 이탈 사유 분류 (Haiku on-demand + DB 캐시)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { fromIso, toIso } = body as { fromIso?: string; toIso?: string };
    if (!fromIso || !toIso) {
      return NextResponse.json({ error: "fromIso/toIso required" }, { status: 400 });
    }

    // 1. P5 도달 + P7 미도달 모집단
    //    = scopeConvs 중 reachedP2 && status IN (quote_sent_nudge, nudge_sent)
    const scopeConvs = await fetchConversationsInRange(fromIso, toIso);
    const p5Dropped = scopeConvs.filter((c) => {
      const ci = c.collected_info;
      const reachedP2 =
        (typeof ci?.address === "string" && !!ci.address.trim()) ||
        (Array.isArray(ci?.items) && ci.items.length > 0);
      if (!reachedP2) return false;
      return NUDGE_STATUSES.has(c.status);
    });

    if (p5Dropped.length === 0) {
      const empty = Object.fromEntries(P5_REASON_KEYWORDS.map((k) => [k, 0]));
      return NextResponse.json({ counts: empty, total: 0 });
    }

    // 2. 각 conversation 의 마지막 고객 발화 조회
    const sessionIds = p5Dropped.map((c) => c.session_id);
    const lastMessages = await fetchLastUserMessages(sessionIds);

    // 3. 분류 (캐시 hit + 미분류만 Haiku 호출)
    const inputs = p5Dropped.map((c) => ({
      sessionId: c.session_id,
      lastUserMessage: lastMessages.get(c.session_id) ?? null,
    }));
    const counts = await classifyP5Reasons(inputs);

    return NextResponse.json({ counts, total: p5Dropped.length });
  } catch (err) {
    console.error("[new_dashboard/p5-reasons] error:", err);
    return NextResponse.json(
      { counts: {}, total: 0, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function fetchLastUserMessages(sessionIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (sessionIds.length === 0) return map;
  const CHUNK = 500;
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    const rows = await paginate<{ session_id: string; content: string; created_at: string }>(() =>
      supabase
        .from("messages")
        .select("session_id, content, created_at")
        .in("session_id", chunk)
        .eq("role", "user")
        .order("created_at", { ascending: false }),
    );
    for (const r of rows) {
      if (!map.has(r.session_id) && r.content) {
        map.set(r.session_id, r.content);
      }
    }
  }
  return map;
}
