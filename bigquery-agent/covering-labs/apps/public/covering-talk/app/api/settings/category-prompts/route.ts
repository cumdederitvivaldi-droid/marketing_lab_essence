import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { invalidateCache } from "@/lib/channeltalk-ai/category-prompts";

// [CS-ADM-011] 카테고리 프롬프트 전체 조회
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("category_prompts")
      .select("*")
      .order("category_id");

    if (error) {
      return NextResponse.json(
        { error: "카테고리 프롬프트 조회 실패: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ prompts: data ?? [] });
  } catch {
    return NextResponse.json(
      { error: "서버 오류" },
      { status: 500 }
    );
  }
}

// [CS-ADM-012] 카테고리 프롬프트 수정 (upsert)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { category_id, prompt_rules, policy_sections, ai_scope_note } = body as {
      category_id: string;
      prompt_rules?: string;
      policy_sections?: string[];
      ai_scope_note?: string | null;
    };

    if (!category_id) {
      return NextResponse.json(
        { error: "category_id는 필수입니다" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (prompt_rules !== undefined) updates.prompt_rules = prompt_rules;
    if (policy_sections !== undefined) updates.policy_sections = policy_sections;
    if (ai_scope_note !== undefined) updates.ai_scope_note = ai_scope_note;

    const { data, error } = await supabase
      .from("category_prompts")
      .update(updates)
      .eq("category_id", category_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "프롬프트 수정 실패: " + error.message },
        { status: 500 }
      );
    }

    // 캐시 무효화
    invalidateCache();

    return NextResponse.json({ prompt: data });
  } catch {
    return NextResponse.json(
      { error: "서버 오류" },
      { status: 500 }
    );
  }
}
