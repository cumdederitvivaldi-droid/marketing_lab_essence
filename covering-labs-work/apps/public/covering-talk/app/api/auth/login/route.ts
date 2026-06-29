import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase/client";
import { createSessionToken } from "@/lib/auth/jwt";
import { cookies } from "next/headers";

// [CS-AUTH-001] 로그인 처리
export async function POST(request: NextRequest) {
  const { name, password } = await request.json();

  if (!name || !password) {
    return NextResponse.json({ error: "이름과 비밀번호를 입력해주세요" }, { status: 400 });
  }

  // app_settings에서 counselor:{name} 조회
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("key", `counselor:${name}`)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "이름 또는 비밀번호가 올바르지 않습니다" }, { status: 401 });
  }

  const counselor = (typeof data.value === "string" ? JSON.parse(data.value) : data.value) as { id: number; password_hash: string; is_active: boolean; role: string };

  if (!counselor.is_active) {
    return NextResponse.json({ error: "비활성화된 계정입니다" }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, counselor.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "이름 또는 비밀번호가 올바르지 않습니다" }, { status: 401 });
  }

  const session = { id: counselor.id, name, role: counselor.role };
  const token = await createSessionToken(session);

  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24h
  });

  return NextResponse.json({ user: session });
}
