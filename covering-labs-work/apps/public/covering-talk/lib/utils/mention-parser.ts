/** 내부대화 메시지에서 @상담사 멘션 추출.
 *   counselors 목록과 정확 매칭 (fuzzy X) — 오인식 방지.
 *   매칭되지 않은 @텍스트는 그대로 두고 ids 에서만 제외.
 */
export interface CounselorRef {
  id: number;
  name: string;
}

export interface ParsedMentions {
  /** 매칭된 counselor id 배열 (dedup). */
  ids: number[];
  /** 매칭된 이름 배열 (UI 하이라이트용). */
  names: string[];
}

const MENTION_RE = /@([가-힣]{2,5}|[a-zA-Z][a-zA-Z0-9_]{1,15})/g;

export function parseMentions(text: string, counselors: CounselorRef[]): ParsedMentions {
  if (!text) return { ids: [], names: [] };
  const byName = new Map<string, number>();
  for (const c of counselors) byName.set(c.name, c.id);

  const ids = new Set<number>();
  const names = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const candidate = m[1];
    const cid = byName.get(candidate);
    if (cid !== undefined) {
      ids.add(cid);
      names.add(candidate);
    }
  }
  return { ids: Array.from(ids), names: Array.from(names) };
}
