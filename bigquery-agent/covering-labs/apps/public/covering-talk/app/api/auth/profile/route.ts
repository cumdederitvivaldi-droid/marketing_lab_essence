import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-AUTH-007] 프로필 조회
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", `counselor:${user.name}`)
    .single();

  if (!data) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  const counselor = data.value as Record<string, unknown>;

  return NextResponse.json({
    channeltalkNickname: (counselor.channeltalk_nickname as string) ?? "",
    ctSendMode: (counselor.ct_send_mode as string) ?? "enter",
    theme: (counselor.theme as string) ?? "light",
    ctAiSuggestVisible: counselor.ct_ai_suggest_visible !== false, // 기본값 true
  });
}

// [CS-AUTH-008] 프로필 수정 (채널톡 닉네임)
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channeltalkNickname, ctSendMode, theme, ctAiSuggestVisible } = (await request.json()) as {
    channeltalkNickname?: string;
    ctSendMode?: string;
    theme?: string;
    ctAiSuggestVisible?: boolean;
  };

  if (channeltalkNickname !== undefined && channeltalkNickname.length > 20) {
    return NextResponse.json({ error: "닉네임은 20자 이내로 입력해주세요" }, { status: 400 });
  }

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", `counselor:${user.name}`)
    .single();

  if (!data) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  const counselor = data.value as Record<string, unknown>;

  await supabase
    .from("app_settings")
    .update({
      value: {
        ...counselor,
        ...(channeltalkNickname !== undefined ? { channeltalk_nickname: channeltalkNickname.trim() || "" } : {}),
        ...(ctSendMode !== undefined ? { ct_send_mode: ctSendMode } : {}),
        ...(theme !== undefined ? { theme } : {}),
        ...(ctAiSuggestVisible !== undefined ? { ct_ai_suggest_visible: ctAiSuggestVisible } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("key", `counselor:${user.name}`);

  return NextResponse.json({ status: "ok" });
}
