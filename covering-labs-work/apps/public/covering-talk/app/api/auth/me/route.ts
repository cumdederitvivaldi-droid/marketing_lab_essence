import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-AUTH-003] 현재 사용자 정보 조회
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
