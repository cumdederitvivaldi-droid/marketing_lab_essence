import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

// [CS-ADM-019] 관리자 대시보드 — 셀 메모 수정 / 해결 처리
export async function PATCH(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await request.json();

  // 메모 본인 확인 (해결 토글은 누구나, 내용 수정은 작성자 본인만)
  const { data: existing, error: fetchErr } = await supabase
    .from("dashboard_notes")
    .select("author, resolved")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "메모를 찾을 수 없습니다" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (typeof body.content === "string") {
    if (existing.author !== user.name) {
      return NextResponse.json({ error: "본인 작성 메모만 수정 가능" }, { status: 403 });
    }
    const content = body.content.trim();
    if (!content) return NextResponse.json({ error: "content empty" }, { status: 400 });
    if (content.length > 2000) return NextResponse.json({ error: "content too long" }, { status: 400 });
    updates.content = content;
  }

  if (typeof body.resolved === "boolean") {
    updates.resolved = body.resolved;
    updates.resolved_by = body.resolved ? user.name : null;
    updates.resolved_at = body.resolved ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "변경 사항 없음" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("dashboard_notes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note: data });
}

// [CS-ADM-020] 관리자 대시보드 — 셀 메모 삭제 (작성자 본인만)
export async function DELETE(request: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;

  const { data: existing } = await supabase
    .from("dashboard_notes")
    .select("author")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "메모를 찾을 수 없습니다" }, { status: 404 });
  }
  if (existing.author !== user.name) {
    return NextResponse.json({ error: "본인 작성 메모만 삭제 가능" }, { status: 403 });
  }

  const { error } = await supabase.from("dashboard_notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
