/**
 * 서버사이드 세션 유틸 — Node.js API Route 전용 (cookies() 사용)
 * middleware.ts에서는 import 금지 (Edge Runtime 비호환)
 */
import { cookies } from "next/headers";
import { verifySessionToken } from "./jwt";
import type { CounselorSession } from "./types";

const COOKIE_NAME = "session";

export async function getCurrentUser(): Promise<CounselorSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
