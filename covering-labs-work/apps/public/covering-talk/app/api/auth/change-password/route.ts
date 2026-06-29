import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-AUTH-004] 비밀번호 변경
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요" }, { status: 400 });
  }

  if (newPassword.length < 6) {
    return NextResponse.json({ error: "비밀번호는 6자 이상이어야 합니다" }, { status: 400 });
  }

  // 현재 비밀번호 확인
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", `counselor:${user.name}`)
    .single();

  if (!data) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  const counselor = data.value as { id: number; password_hash: string; is_active: boolean; role: string };
  const valid = await bcrypt.compare(currentPassword, counselor.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다" }, { status: 400 });
  }

  // 새 비밀번호 저장
  const newHash = await bcrypt.hash(newPassword, 10);
  await supabase
    .from("app_settings")
    .update({
      value: { ...counselor, password_hash: newHash },
      updated_at: new Date().toISOString(),
    })
    .eq("key", `counselor:${user.name}`);

  return NextResponse.json({ status: "ok" });
}
