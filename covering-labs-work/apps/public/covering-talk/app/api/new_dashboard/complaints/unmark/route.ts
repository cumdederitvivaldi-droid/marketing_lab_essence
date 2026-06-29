import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

// [CS-DSH-040] 컴플레인 false-positive 수동 unmark — dashboard_complaints.category = 'none'
//   PO 가 모달에서 "불만 아님" 버튼으로 호출. cron 재분류가 와도 캐시 hit 으로 그대로 유지.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { sessionId, messageId } = (await request.json()) as { sessionId?: string; messageId?: string };
    if (!sessionId || !messageId) {
      return NextResponse.json({ error: "sessionId/messageId required" }, { status: 400 });
    }

    const { data: existing, error: selErr } = await supabase
      .from("dashboard_complaints")
      .select("session_id, message_id, category")
      .eq("session_id", sessionId)
      .eq("message_id", messageId)
      .maybeSingle();

    if (selErr) {
      console.error("[complaints/unmark] select 실패:", selErr);
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "분류 캐시에 없는 메시지" }, { status: 404 });
    }
    if (existing.category === "none") {
      return NextResponse.json({ ok: true, alreadyNone: true });
    }

    const { error: updErr } = await supabase
      .from("dashboard_complaints")
      .update({ category: "none" })
      .eq("session_id", sessionId)
      .eq("message_id", messageId);
    if (updErr) {
      console.error("[complaints/unmark] update 실패:", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    console.log(`[complaints/unmark] ${user.name} → session=${sessionId} message=${messageId} (${existing.category} → none)`);
    return NextResponse.json({ ok: true, prevCategory: existing.category });
  } catch (err) {
    console.error("[complaints/unmark] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
