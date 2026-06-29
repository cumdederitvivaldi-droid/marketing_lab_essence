import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { invalidateWorkflowCache } from "@/lib/utils/workflow-config";
import { invalidateProviderCache } from "@/lib/ai/ai-client";

// 기본 설정값
const DEFAULTS: Record<string, unknown> = {
  auto_mode: false,
  ai_provider: "anthropic",
  extraction_model: "haiku",
};

// [CS-ADM-003] 설정 조회
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value");

    if (error) {
      // 테이블 미존재 시 기본값 반환
      return NextResponse.json({ settings: DEFAULTS });
    }

    const settings: Record<string, unknown> = { ...DEFAULTS };
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json({ settings: DEFAULTS });
  }
}

// [CS-ADM-004] 설정 수정
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json({ error: "key는 필수입니다" }, { status: 400 });
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      console.error("[settings] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 캐시 무효화
    if (key === "workflow_config") invalidateWorkflowCache();
    if (key === "ai_provider") invalidateProviderCache();

    return NextResponse.json({ status: "ok", key, value });
  } catch {
    return NextResponse.json({ error: "설정 저장 실패" }, { status: 500 });
  }
}
