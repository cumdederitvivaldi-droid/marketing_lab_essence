import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { COMPLAINT_CATEGORIES_PUBLIC, type ComplaintCategoryPublic } from "@/lib/dashboard/complaint-classify";
import { type ComplaintMode } from "../route";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const MAX_MESSAGES_PER_SESSION = 200;

export const maxDuration = 30;

interface ConversationOut {
  sessionId: string;
  customerName: string | null;
  phone: string | null;
  firstComplaintAt: string;
  complaintMessageIds: string[];
  messages: Array<{ id: string; role: string; content: string; createdAt: string; sentBy: string | null }>;
}

// [CS-DSH-033] 카테고리별 컴플레인 대화 상세 — 모달 그리드용
//
// 캐시(dashboard_complaints) 직접 조회 — 모집단 재계산 X.
// 미분류 메시지는 cron(/api/cron/classify-complaints) 이 5분 안에 자동 분류.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { fromIso, toIso, category, mode } = (await request.json()) as {
      fromIso?: string; toIso?: string; category?: string; mode?: ComplaintMode;
    };
    if (!fromIso || !toIso || !category || !mode) {
      return NextResponse.json({ error: "fromIso/toIso/category/mode required" }, { status: 400 });
    }
    if (!(COMPLAINT_CATEGORIES_PUBLIC as readonly string[]).includes(category)) {
      return NextResponse.json({ error: "invalid category" }, { status: 400 });
    }
    if (mode !== "pre" && mode !== "post") {
      return NextResponse.json({ error: "mode must be 'pre' or 'post'" }, { status: 400 });
    }
    const targetCat = category as ComplaintCategoryPublic;

    // 1. 캐시에서 카테고리 + 기간 직접 조회
    const classified = await paginate<{ session_id: string; message_id: string; message_created_at: string }>(() =>
      supabase
        .from("dashboard_complaints")
        .select("session_id, message_id, message_created_at")
        .eq("category", targetCat)
        .gte("message_created_at", fromIso)
        .lte("message_created_at", toIso)
        .order("message_created_at", { ascending: false }),
    );
    if (classified.length === 0) {
      return NextResponse.json({ category: targetCat, mode, conversations: [] });
    }

    // 2. session 별로 묶기
    const bySession = new Map<string, typeof classified>();
    for (const c of classified) {
      if (!bySession.has(c.session_id)) bySession.set(c.session_id, []);
      bySession.get(c.session_id)!.push(c);
    }
    const allSessionIds = [...bySession.keys()];

    // 3. conversations 메타 (이름·전화) — mode 필터 + 표시용
    const convRows = await paginate<{ session_id: string; name: string | null; phone: string | null }>(() =>
      supabase
        .from("conversations")
        .select("session_id, name, phone")
        .in("session_id", allSessionIds),
    );
    const convMeta = new Map<string, { name: string | null; phone: string | null }>();
    for (const r of convRows) convMeta.set(r.session_id, { name: r.name, phone: r.phone });

    // 4. mode 필터 — post = name 있음, pre = name 없음 (메타 없는 세션은 name 없음으로 간주)
    const sessionIds = allSessionIds.filter((sid) => {
      const meta = convMeta.get(sid);
      const hasName = !!(meta?.name && meta.name.trim());
      return mode === "post" ? hasName : !hasName;
    });
    if (sessionIds.length === 0) {
      return NextResponse.json({ category: targetCat, mode, conversations: [] });
    }

    // 5. 각 세션의 첫 컴플레인 메시지 30분 전부터의 컨텍스트 (병렬 fetch)
    const CONTEXT_WINDOW_MS = 30 * 60_000;
    const out = await Promise.all(sessionIds.map(async (sid): Promise<ConversationOut> => {
      const cs = bySession.get(sid)!;
      const firstComplaintAt = cs
        .map((c) => c.message_created_at)
        .sort()[0];
      const cutoff = new Date(new Date(firstComplaintAt).getTime() - CONTEXT_WINDOW_MS).toISOString();
      const { data: msgs } = await supabase
        .from("messages")
        .select("id, role, content, created_at, sent_by")
        .eq("session_id", sid)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(MAX_MESSAGES_PER_SESSION);
      return {
        sessionId: sid,
        customerName: convMeta.get(sid)?.name ?? null,
        phone: convMeta.get(sid)?.phone ?? null,
        firstComplaintAt,
        complaintMessageIds: cs.map((c) => c.message_id),
        messages: (msgs ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at,
          sentBy: m.sent_by ?? null,
        })),
      };
    }));

    out.sort((a, b) => b.firstComplaintAt.localeCompare(a.firstComplaintAt));

    return NextResponse.json({ category: targetCat, mode, conversations: out });
  } catch (err) {
    console.error("[new_dashboard/complaints/conversations] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
