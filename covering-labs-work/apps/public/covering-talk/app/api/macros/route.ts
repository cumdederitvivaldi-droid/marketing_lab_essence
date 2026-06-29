import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore, diffObjects } from "@/lib/store/audit-logs";

// 매크로 목록 조회
// [CS-ADM-006] 매크로 목록 조회
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");

  let query = supabase
    .from("macros")
    .select("*")
    .eq("is_active", true)
    .order("category")
    .order("sort_order")
    .order("name");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[macros] 조회 오류:", error);
    return NextResponse.json({ macros: [], error: error.message }, { status: 500 });
  }

  // 카테고리 목록도 함께 반환
  const categories = [...new Set((data ?? []).map((m: { category: string }) => m.category))];

  return NextResponse.json({ macros: data ?? [], categories });
}

// 매크로 추가
// [CS-ADM-007] 매크로 등록
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, content, category } = body;

  if (!name || !content) {
    return NextResponse.json({ error: "name과 content는 필수입니다" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("macros")
    .insert({
      name,
      content,
      category: category || "일반",
      sort_order: 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    console.error("[macros] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // audit log
  const user = await getCurrentUser();
  if (user && data) {
    auditStore.log({
      entityType: "macro",
      entityId: String(data.id),
      action: "create",
      changes: {},
      description: `템플릿 추가: [${category || "일반"}] ${name}`,
      userId: user.id,
      userName: user.name,
    });
  }

  return NextResponse.json({ macro: data });
}

// 매크로 수정
// [CS-ADM-008] 매크로 수정
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
  }

  // 기존 데이터 조회 (변경 비교용)
  const { data: existing } = await supabase
    .from("macros")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("macros")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[macros] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // audit log
  const user = await getCurrentUser();
  if (user && existing) {
    const changes = diffObjects(existing, updates, Object.keys(updates));
    if (Object.keys(changes).length > 0) {
      const fields = Object.keys(changes).join(", ");
      auditStore.log({
        entityType: "macro",
        entityId: String(id),
        action: "update",
        changes,
        description: `템플릿 수정 (${existing.name}): ${fields}`,
        userId: user.id,
        userName: user.name,
      });
    }
  }

  return NextResponse.json({ macro: data });
}

// 매크로 삭제
// [CS-ADM-009] 매크로 삭제
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
  }

  // 기존 데이터 조회 (로그용)
  const { data: existing } = await supabase
    .from("macros")
    .select("name, category")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("macros").delete().eq("id", id);

  if (error) {
    console.error("[macros] delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // audit log
  const user = await getCurrentUser();
  if (user) {
    auditStore.log({
      entityType: "macro",
      entityId: String(id),
      action: "delete",
      changes: {},
      description: `템플릿 삭제: [${existing?.category || ""}] ${existing?.name || id}`,
      userId: user.id,
      userName: user.name,
    });
  }

  return NextResponse.json({ status: "ok" });
}
