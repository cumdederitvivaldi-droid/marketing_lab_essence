import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-CT-008] 상담 태그 마스터 목록 조회
export async function GET(): Promise<NextResponse> {
  try {
    const { data, error } = await supabase
      .from("consultation_tags")
      .select("id, tag, description, category, is_active")
      .order("category")
      .order("tag");

    if (error) {
      console.error("[CT] consultation_tags fetch error:", error);
      return NextResponse.json({ error: "태그 목록 조회 실패" }, { status: 500 });
    }

    return NextResponse.json({ tags: data ?? [] });
  } catch (err) {
    console.error("[CT] tags list error:", err);
    return NextResponse.json({ error: "태그 목록 조회 실패" }, { status: 500 });
  }
}

// [CS-CT-015] 상담 태그 추가
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tag, description, category } = (await request.json()) as {
    tag: string; description?: string; category?: string;
  };

  if (!tag?.trim()) {
    return NextResponse.json({ error: "태그명은 필수입니다" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("consultation_tags")
    .upsert(
      { tag: tag.trim(), description: description?.trim() ?? "", category: category?.trim() ?? "", is_active: true },
      { onConflict: "tag" }
    )
    .select("id, tag, description, category, is_active")
    .single();

  if (error) {
    console.error("[CT] tag create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag: data });
}

// [CS-CT-016] 상담 태그 삭제 (비활성화)
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = (await request.json()) as { id: number };

  const { error } = await supabase
    .from("consultation_tags")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    console.error("[CT] tag delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// [CS-CT-017] 상담 태그 수정
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, tag, description, category, is_active } = (await request.json()) as {
    id: number; tag?: string; description?: string; category?: string; is_active?: boolean;
  };

  const updates: Record<string, unknown> = {};
  if (tag !== undefined) updates.tag = tag.trim();
  if (description !== undefined) updates.description = description.trim();
  if (category !== undefined) updates.category = category.trim();
  if (is_active !== undefined) updates.is_active = is_active;

  const { data, error } = await supabase
    .from("consultation_tags")
    .update(updates)
    .eq("id", id)
    .select("id, tag, description, category, is_active")
    .single();

  if (error) {
    console.error("[CT] tag update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag: data });
}
