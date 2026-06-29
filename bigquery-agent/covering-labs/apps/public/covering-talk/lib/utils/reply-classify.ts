// CS Realtime — AI draft 대비 송신본 분류
//
// reply_kind:
//   ai_auto   : AI draft 그대로 송신 (정규화 후 동일)
//   ai_assist : AI draft 일부 활용 (overlap >= 0.6)
//   human     : AI draft 미사용 또는 40%+ 변경 (overlap < 0.6)
//
// 임계값 튜닝 이력:
//   - 초기 0.7: 짧은 답변(3~10자)에서 핵심 단어 일치해도 0.5~0.6 권에 떨어져 assist 누락 다발
//   - 0.6 (현재): 짧은 답변의 부분 활용도 assist 로 인식. 운영 데이터 보고 추가 조정.

export type ReplyKind = "ai_auto" | "ai_assist" | "human";

export interface ReplyClassification {
  kind: ReplyKind;
  charOverlap: number; // 0.0 ~ 1.0
}

const ASSIST_THRESHOLD = 0.6;

export function classifyReply(sent: string, draft: string | null | undefined): ReplyClassification {
  if (!draft || !draft.trim() || !sent.trim()) {
    return { kind: "human", charOverlap: 0 };
  }
  const a = normalize(sent);
  const b = normalize(draft);
  if (a === b) return { kind: "ai_auto", charOverlap: 1 };
  const overlap = bigramDice(a, b);
  if (overlap >= ASSIST_THRESHOLD) return { kind: "ai_assist", charOverlap: overlap };
  return { kind: "human", charOverlap: overlap };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// 2-gram Sørensen–Dice 계수 — 한글에 적합한 char-level 유사도
function bigramDice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i <= s.length - 2; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let intersect = 0;
  for (const [k, ca] of ga) {
    const cb = gb.get(k);
    if (cb) intersect += Math.min(ca, cb);
  }
  let totalA = 0;
  let totalB = 0;
  for (const c of ga.values()) totalA += c;
  for (const c of gb.values()) totalB += c;
  if (totalA + totalB === 0) return 0;
  return (2 * intersect) / (totalA + totalB);
}
