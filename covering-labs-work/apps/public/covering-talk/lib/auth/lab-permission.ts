import { getCurrentUser } from "./session";
import type { CounselorSession } from "./types";

// 실험실 접근 허용 — 김원빈 / 강성진 만
const LAB_ALLOWED_USERS = new Set(["김원빈", "강성진"]);

export class LabForbiddenError extends Error {
  constructor() {
    super("실험실 접근 권한이 없습니다.");
    this.name = "LabForbiddenError";
  }
}

export async function requireLabAccess(): Promise<CounselorSession> {
  const user = await getCurrentUser();
  if (!user) throw new LabForbiddenError();
  if (!LAB_ALLOWED_USERS.has(user.name)) throw new LabForbiddenError();
  return user;
}
