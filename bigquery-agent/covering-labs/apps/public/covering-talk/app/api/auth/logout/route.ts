import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// [CS-AUTH-002] 로그아웃 처리
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
  return NextResponse.json({ status: "ok" });
}
