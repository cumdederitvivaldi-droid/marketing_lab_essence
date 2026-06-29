/**
 * JWT 서명/검증 — Edge Runtime 호환 (jose만 사용)
 * middleware.ts에서 import 가능
 */
import { SignJWT, jwtVerify } from "jose";
import type { CounselorSession } from "./types";

const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export async function createSessionToken(user: CounselorSession): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<CounselorSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: payload.id as number,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}
