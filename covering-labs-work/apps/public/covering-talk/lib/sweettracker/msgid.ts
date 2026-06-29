import { randomBytes } from "crypto";

// msgid 규칙: 발신프로필 40일 unique, 영문/숫자/_/- 허용, 20자 이내
// 형식: {8자prefix}_{5자random}_{rowIdx} — 최대 8+1+5+1+5 = 20자

export function generateMsgid(campaignShortId: string, rowIdx: number): string {
  const prefix = campaignShortId.slice(0, 8).replace(/[^a-zA-Z0-9_-]/g, "x");
  const rand = randomBytes(3).toString("hex"); // 6자 hex
  const idx = String(rowIdx).padStart(0, "0");
  const raw = `${prefix}_${rand}_${idx}`;
  // 20자 초과 시 truncate (rowIdx 는 보존)
  if (raw.length <= 20) return raw;
  const idxStr = `_${idx}`;
  const remaining = 20 - idxStr.length;
  return raw.slice(0, remaining) + idxStr;
}
