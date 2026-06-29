/**
 * 예약 확정 후 컴플레인 분류 — Haiku on-demand + DB 캐시.
 *
 * 캐시 키: (session_id, message_id) — 같은 메시지 재분류 안 함, period 변경에도 캐시 재사용.
 * churn-classify 패턴을 따라가며 카테고리만 다르게.
 */

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "./_paginate";

// 'none' 은 비컴플레인 — 캐시에는 저장하되 외부 카운트엔 제외.
export const COMPLAINT_CATEGORIES = [
  "파손훼손",
  "일정변경",
  "누락실수",
  "가격추가비용",
  "응대태도",
  "결제문제",
  "기타",
  "none",
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

// 외부(API/UI) 노출용 — 'none' 제외한 진짜 컴플레인 7종
export const COMPLAINT_CATEGORIES_PUBLIC = COMPLAINT_CATEGORIES.filter(
  (c) => c !== "none",
) as readonly Exclude<ComplaintCategory, "none">[];
export type ComplaintCategoryPublic = (typeof COMPLAINT_CATEGORIES_PUBLIC)[number];

const BATCH_SIZE = 30;
const MAX_BATCHES = 10;

export interface ComplaintInput {
  sessionId: string;
  messageId: string;
  content: string;
  messageCreatedAt: string;          // ISO
  bookingConfirmedAt: string | null; // 'pre' 모드는 null
}

interface CachedRow {
  session_id: string;
  message_id: string;
  category: ComplaintCategory;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// 2단계 분류 — stage1 으로 컴플레인 판별, stage2 로 카테고리 결정.
// none 은 stage1 에서 종결. stage2 는 컴플레인 확정된 것만 호출.

const STAGE1_PROMPT = `당신은 방문수거 서비스의 CS 분석가입니다. 고객 메시지가 *컴플레인(불만/항의/문제 제기)* 인지 true/false 로 분류합니다.

⚠️ 매우 보수적으로 판단합니다. 90% 이상이 false 입니다. 단순 문의·정보 제공·요청은 컴플레인이 아닙니다.

★ 핵심 판단: **답답함/분노/실망/항의의 *톤*이 메시지에 명확히 드러나야 true**.
   톤이 없는 단순 문의·정정·요청은 무조건 false.

true (컴플레인) 기준 — 다음 중 *항의·답답함 톤*과 함께 나타나야 true:
1. 작업 중·후 *물리적 손상 신고* ("벽에 흠집 났어요", "박살난거", "발에 피가 나네요")
2. *약속 시간 안 지킨 것에 대한 항의* ("왜 안 오세요", "1시간 40분 기다리고 있어요", "취소할게요")
3. *빠뜨림·잘못 수거 항의* ("5단 서랍장은 안 가지고 가셨어요", "거실에 그대로 있는데요")
4. *견적·청구 이의제기* — 단순 가격 문의 X, "비싸다·왜·이게 말이 되나" 톤이 있어야 ("왜 273천원?", "이거까지 돈 내야 하나요?")
5. *응대 태도 항의* — "불친절", "말투", "무시", "어이없네요". **"좋으셨어요/친절하셨어요"는 절대 true 아님 — 칭찬은 false**
6. *결제 오류/환불 요구* — "결제 안 됨", "두 번 청구", "환불해주세요"
7. *서비스 거부·강한 부정* ("다신 안 부르겠어요", "최악", "실망")

false (비-컴플레인) 기준 — 다음은 *모두 false*:
- 단순 정보 문의: 가격·일정·절차·결제 방법·세금계산서·인원·옵션
  · ❌ "이건 얼마예요", "견적 어떻게 되죠", "포함인가요?", "사다리차 꼭 써야하나요?"
- 단순 변경/취소/추가 요청 — 톤 없음
  · ❌ "취소해주세요", "변경하고 싶어요", "이것도 추가해주세요", "예약 취소 부탁드립니다"
- 정보 정정·추가 정보 제공
  · ❌ "성동구 아닌데요 마포구입니다", "5칸 입니다", "12층입니다", "봉투 큰 거 없어요"
- 감사·인사·긍정 평가·확인 응답
  · ❌ "기사님 좋으셨어요", "친절하세요", "감사합니다", "수고하셨어요", "네", "확인했어요"
- 정보 제공: 이름·주소·전화번호·품목·사진
  · ❌ "백한얼 01050145384", "사무용 의자", "[사진 수신]"
- 자기 결정 통보(변심) — 항의 아님
  · ❌ "그냥 제가 처리할게요", "다음에 진행하겠습니다", "비싸서 안 할게요"
- 가격 협상·할인 요청 — 단순 요구는 false. *"왜 이래?" 톤*이 있어야 true.
  · ❌ "30% 할인 가능?", "조금만 깎아주세요"
  · ✅ "왜 이렇게 비싸요? 다른 곳보다 너무 비싼데요"

규칙:
- 발화 N개 입력 → JSON 배열 N개 (true/false, 입력 순서대로)
- **모호하면 false** — "조금이라도 항의 톤?" 보다 "명확한 항의?" 기준
- 마크다운/설명 금지. JSON 배열만 (예: [false, false, true, false]).`;

const STAGE2_PROMPT = `당신은 방문수거 CS 분석가입니다. 다음 발화들은 모두 *컴플레인(불만/항의/문제 제기)* 입니다.
7개 카테고리 중 하나로 분류:

1. 파손훼손: 작업 중·후 물리적 손상 항의 (벽 흠집, 가구 파손 등)
2. 일정변경: 약속한 시간을 지키지 못한 것에 대한 항의 (단순 일정 변경 요청 아님)
3. 누락실수: 빠뜨림/잘못 수거/청소 미흡 항의
4. 가격추가비용: 견적·청구 금액 이의제기
5. 응대태도: 기사·상담사 태도 항의
6. 결제문제: 결제 실패/오류/환불·환불 요청
7. 기타: 위 6개에 안 맞는 컴플레인 (서비스 전반 부정·재이용 거부 등)

규칙:
- 발화 N개 → JSON 배열 N개 (카테고리 문자열, 입력 순서대로)
- 마크다운/설명 금지. JSON 배열만.`;

async function fetchCached(pairs: Array<{ sessionId: string; messageId: string }>): Promise<Map<string, ComplaintCategory>> {
  const map = new Map<string, ComplaintCategory>();
  if (pairs.length === 0) return map;
  const CHUNK = 500;
  // (session_id, message_id) 동시 조회는 PostgREST 에서 직접 못 하므로
  // session_id IN (..) 로 가져와 클라이언트에서 message_id 매칭
  const sessionIds = [...new Set(pairs.map((p) => p.sessionId))];
  const wantedKeys = new Set(pairs.map((p) => `${p.sessionId}|${p.messageId}`));
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    const rows = await paginate<CachedRow>(() =>
      supabase
        .from("dashboard_complaints")
        .select("session_id, message_id, category")
        .in("session_id", chunk),
    );
    for (const r of rows) {
      const key = `${r.session_id}|${r.message_id}`;
      if (wantedKeys.has(key)) map.set(key, r.category);
    }
  }
  return map;
}

// Stage 1 — 컴플레인 yes/no
async function classifyBatchStage1(messages: string[]): Promise<boolean[]> {
  if (messages.length === 0) return [];
  const numbered = messages.map((m, i) => `${i + 1}. ${m.replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
  try {
    const res = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: STAGE1_PROMPT,
      messages: [{ role: "user", content: `발화 ${messages.length}개:\n${numbered}\n\n위 순서대로 true/false JSON 배열 반환:` }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return messages.map(() => false);
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return messages.map(() => false);
    return parsed.map((v) => v === true || v === "true");
  } catch (err) {
    console.error("[complaint-classify stage1] Haiku 호출 실패:", err);
    return messages.map(() => false);
  }
}

// Stage 2 — 7카테고리 (none 제외)
async function classifyBatchStage2(messages: string[]): Promise<Exclude<ComplaintCategory, "none">[]> {
  if (messages.length === 0) return [];
  const numbered = messages.map((m, i) => `${i + 1}. ${m.replace(/\s+/g, " ").slice(0, 300)}`).join("\n");
  try {
    const res = await getClient().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: STAGE2_PROMPT,
      messages: [{ role: "user", content: `발화 ${messages.length}개:\n${numbered}\n\n위 순서대로 JSON 배열 반환:` }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return messages.map(() => "기타");
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return messages.map(() => "기타");
    const valid = ["파손훼손", "일정변경", "누락실수", "가격추가비용", "응대태도", "결제문제", "기타"] as const;
    return parsed.map((v) => {
      const k = String(v).trim();
      return (valid as readonly string[]).includes(k) ? (k as Exclude<ComplaintCategory, "none">) : "기타";
    });
  } catch (err) {
    console.error("[complaint-classify stage2] Haiku 호출 실패:", err);
    return messages.map(() => "기타");
  }
}

export interface ClassifyResult {
  counts: Record<ComplaintCategory, number>;
  classified: Array<{
    sessionId: string;
    messageId: string;
    content: string;
    messageCreatedAt: string;
    bookingConfirmedAt: string | null;
    category: ComplaintCategory;
  }>;
}

export async function classifyComplaints(inputs: ComplaintInput[]): Promise<ClassifyResult> {
  // 카테고리별 unique session 집합 — counts 는 메시지 단위가 아닌 세션 단위로 산출
  const sessionsByCat: Record<ComplaintCategory, Set<string>> = {
    파손훼손: new Set(), 일정변경: new Set(), 누락실수: new Set(), 가격추가비용: new Set(),
    응대태도: new Set(), 결제문제: new Set(), 기타: new Set(), none: new Set(),
  };
  const classified: ClassifyResult["classified"] = [];
  const finalize = (): ClassifyResult => {
    const counts = {
      파손훼손: sessionsByCat["파손훼손"].size, 일정변경: sessionsByCat["일정변경"].size,
      누락실수: sessionsByCat["누락실수"].size, 가격추가비용: sessionsByCat["가격추가비용"].size,
      응대태도: sessionsByCat["응대태도"].size, 결제문제: sessionsByCat["결제문제"].size,
      기타: sessionsByCat["기타"].size, none: sessionsByCat["none"].size,
    };
    return { counts, classified };
  };
  if (inputs.length === 0) return finalize();

  const cached = await fetchCached(inputs.map((i) => ({ sessionId: i.sessionId, messageId: i.messageId })));

  // 캐시된 메시지는 그대로 결과에 추가
  const uncached: ComplaintInput[] = [];
  for (const inp of inputs) {
    const key = `${inp.sessionId}|${inp.messageId}`;
    const cat = cached.get(key);
    if (cat) {
      sessionsByCat[cat].add(inp.sessionId);
      classified.push({ ...inp, category: cat });
    } else {
      uncached.push(inp);
    }
  }
  if (uncached.length === 0) return finalize();

  // 미분류 → Haiku 배치 호출 (BATCH_SIZE 단위, MAX_BATCHES 까지)
  const target = uncached.slice(0, BATCH_SIZE * MAX_BATCHES);
  const newRows: Array<{
    session_id: string;
    message_id: string;
    message_content: string;
    message_created_at: string;
    booking_confirmed_at: string | null;
    category: ComplaintCategory;
  }> = [];

  for (let i = 0; i < target.length; i += BATCH_SIZE) {
    const chunk = target.slice(i, i + BATCH_SIZE);

    // Stage 1 — 컴플레인 yes/no (보수적 판단)
    const isComplaint = await classifyBatchStage1(chunk.map((c) => c.content));

    // Stage 2 — true 인 것만 카테고리 분류
    const yesIndices: number[] = [];
    isComplaint.forEach((b, idx) => { if (b) yesIndices.push(idx); });
    const yesContents = yesIndices.map((idx) => chunk[idx].content);
    const stage2Cats = yesIndices.length > 0
      ? await classifyBatchStage2(yesContents)
      : [];

    chunk.forEach((c, idx) => {
      const yesPos = yesIndices.indexOf(idx);
      const cat: ComplaintCategory = yesPos === -1 ? "none" : (stage2Cats[yesPos] ?? "기타");
      sessionsByCat[cat].add(c.sessionId);
      classified.push({ ...c, category: cat });
      newRows.push({
        session_id: c.sessionId,
        message_id: c.messageId,
        message_content: c.content.slice(0, 1000),
        message_created_at: c.messageCreatedAt,
        booking_confirmed_at: c.bookingConfirmedAt,
        category: cat,
      });
    });
  }

  if (newRows.length > 0) {
    try {
      await supabase.from("dashboard_complaints").upsert(newRows, { onConflict: "session_id,message_id" });
    } catch (err) {
      console.error("[complaint-classify] 캐시 저장 실패:", err);
    }
  }

  return finalize();
}
