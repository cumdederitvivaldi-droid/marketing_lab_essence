import { conversationStore } from "@/lib/store/conversations";
import { sendPlainMessage, sendRichMessage } from "@/lib/happytalk/client";
import { generateMemoSummary } from "@/lib/ai/claude";
import { Phase, getDefaultStatusForPhase } from "@/lib/ai/phases";
import { findNextPendingAmbiguousItem } from "@/lib/ai/ambiguous-items";
import {
  parseBasicInfoResponse,
  findNextBasicInfoQuestion,
} from "./message-parser";

/** 버튼 질문 이모지 매핑 */
const ITEM_EMOJI: Record<string, string> = {
  "냉장고": "🧊",
  "침대": "🛏️",
  "매트리스": "🛏️",
  "소파": "🛋️",
  "세탁기": "🫧",
  "책상": "📝",
  "식탁": "🍽️",
  "옷장": "👔",
  "책장": "📚",
  "행거": "🧥",
  "에어컨": "❄️",
  "화장대": "💄",
  "서랍장": "🗄️",
  "의자": "🪑",
  "신발장": "👟",
  "TV": "📺",
  "티비": "📺",
  "피아노": "🎹",
  "금고": "🔐",
  "장식장": "🏺",
  "씽크대": "🚰",
  "케이지": "🐾",
  "캐비닛": "🗄️",
  "욕조": "🛁",
};

/** Phase 전환 + Status 자동 동기화 */
export async function updatePhaseWithStatus(sessionId: string, phase: Phase, reason: string, actor: "auto" | "agent") {
  await conversationStore.updatePhase(sessionId, phase, reason, actor);
  let newStatus = getDefaultStatusForPhase(phase);
  const conv = await conversationStore.getById(sessionId);
  const currentStatus = conv?.status ?? "pending";
  // needs_check / cancelled / pending은 자동 덮어쓰기 방지
  // pending: 고객 재연락으로 전환된 상태 → AI가 booked 등으로 되돌리면 안 됨
  if (currentStatus === "needs_check" || currentStatus === "cancelled" || currentStatus === "pending") return;
  // ★ Phase 5 진입 시: 견적이 실제로 전송된 경우에만 quote_sent_nudge 허용
  // quote.sentAt이 없으면 견적이 실제 고객에게 전달되지 않은 것 → status 변경 차단
  if (phase === Phase.PHASE_5_NUDGE) {
    const quoteSentAt = conv?.quote?.sentAt;
    if (!quoteSentAt) {
      console.log(`[updatePhaseWithStatus] Phase5 진입이지만 견적 미발송(sentAt=${quoteSentAt}) → status 유지: ${sessionId}`);
      return;
    }
  }
  // ★ booked 상태는 고객 성함+연락처가 있을 때만 허용 (없으면 pending 유지)
  if (newStatus === "booked" && (!conv?.name || !conv?.phone)) {
    console.log(`[updatePhaseWithStatus] booked 차단: 고객정보 미완성 (name=${conv?.name}, phone=${conv?.phone})`);
    newStatus = "pending";
  }
  // status가 변경 필요할 때만 업데이트
  if (currentStatus !== newStatus) {
    await conversationStore.updateStatus(sessionId, newStatus as import("@/lib/store/conversations").ConversationStatus);
    // ★ booked 상태 진입 시 상담 메모 자동 요약 (fire-and-forget)
    if (newStatus === "booked" && conv && conv.messages.length >= 2) {
      generateMemoSummary(conv.messages.map((m) => ({ role: m.role, content: m.content })))
        .then((summary) => { if (summary) conversationStore.updateMemo(sessionId, summary); })
        .catch((err) => console.error("[Webhook] 메모 요약 오류:", err));
    }
  }
}

/** 견적 메시지 실제 전송 시 sentAt 타임스탬프 기록 */
export async function markQuoteSent(sessionId: string) {
  try {
    const conv = await conversationStore.getById(sessionId);
    if (conv?.quote && !conv.quote.sentAt) {
      await conversationStore.updateQuote(sessionId, { ...conv.quote, sentAt: Date.now() });
    }
  } catch (err) {
    console.error(`[markQuoteSent] ${sessionId}:`, err);
  }
}

/** 버튼 응답 감지 — extractCollectedInfo 스킵 가능 여부 판단 */
/** ABC 타임 슬롯 버튼 응답 감지 및 처리.
 *  매칭 시 collectedInfo 에 selectedTimeBlock/selectedDate 저장 + 확인 메시지 발송 + true 반환.
 */
export async function handleAbcSlotButtonResponse(
  sessionId: string,
  userKey: string,
  senderKey: string,
  userMessage: string,
  conv: { collectedInfo?: unknown; name?: string | null; phone?: string | null }
): Promise<boolean> {
  const txt = userMessage.trim();
  // 버튼 레이블 → 블록. 버튼명/단순 영문/시간 표기 모두 허용.
  const LABEL_TO_BLOCK: Record<string, "A" | "B" | "C"> = {
    "A 오전 9시~12시": "A",
    "B 오후 1시~4시": "B",
    "C 오후 5시~8시": "C",
    "A": "A", "B": "B", "C": "C",
    "a": "A", "b": "B", "c": "C",
    "오전 9시~12시": "A",
    "오후 1시~4시": "B",
    "오후 5시~8시": "C",
  };
  const block = LABEL_TO_BLOCK[txt];
  if (!block) return false;

  // 직전 발송된 ABC 슬롯의 날짜 찾기 (collectedInfo._abcSlotsSent)
  const sent = (conv.collectedInfo || {}) as Record<string, unknown>;
  const abcSent = sent._abcSlotsSent as { date?: string; blocks?: string[]; sentAt?: string } | undefined;
  if (!abcSent?.date || !abcSent.blocks?.includes(block)) {
    // 발송 이력 없으면 우연의 일치 가능 → 무시
    return false;
  }
  const date = abcSent.date;

  // 재검증: 해당 블록 여전히 가능?
  try {
    const origin = process.env.NEXT_PUBLIC_BASE_URL || "";
    const scheduleRes = await fetch(`${origin}/api/schedule/abc?date=${date}`);
    if (scheduleRes.ok) {
      const schedule = await scheduleRes.json();
      if (!schedule.blocks?.[block]?.available) {
        // 마감 안내
        const msg = `죄송합니다 :( ${date} ${block === "A" ? "오전 9~12시" : block === "B" ? "오후 1~4시" : "오후 5~8시"} 시간대는 방금 마감되었습니다. 다른 시간대 안내드리겠습니다.`;
        try { await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: msg }); } catch {}
        await conversationStore.addAssistantMessage(sessionId, msg, "AI(시간안내)", false);
        return true;
      }
    }
  } catch { /* 재검증 실패 시 그냥 진행 (보수적으로 수용) */ }

  // collectedInfo 에 선택 저장
  await conversationStore.updateCollectedInfo(sessionId, {
    selectedTimeBlock: block,
    selectedDate: date,
    // requestedDate 도 같이 (고객이 다른 날짜 버튼 클릭 시)
    requestedDate: date,
  });

  // Phase 7 로 전환
  try { await updatePhaseWithStatus(sessionId, Phase.PHASE_7_CONFIRM, "ABC 슬롯 버튼 선택", "auto"); } catch {}

  // 성함/연락처 미수집 시 자동으로 요청 (AI 홍보성 "접수해드렸습니다" 문구는 제거)
  const hasName = !!(conv.name && String(conv.name).trim());
  const hasPhone = !!(conv.phone && String(conv.phone).trim());
  if (!hasName || !hasPhone) {
    const askMsg = "원활한 수거 진행과 문제 발생 시 안내 드릴 수 있도록 성함과 연락처 남겨주시면 감사하겠습니다 : )";
    try { await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: askMsg }); } catch {}
    await conversationStore.addAssistantMessage(sessionId, askMsg, "AI(시간안내)", false);
  }
  // 이미 성함·연락처 수집된 경우 — 조용히 반영만 하고 상담사가 최종 확정 처리

  return true;
}

/** 모호 품목 버튼 전송 — 버튼 전송 여부를 반환 */
export async function handleAmbiguousItemButtons(
  sessionId: string,
  userKey: string,
  senderKey: string,
  autoSentBy: string
): Promise<boolean> {
  const freshConv = await conversationStore.getById(sessionId);
  const freshMessages = freshConv?.messages ?? [];
  const nextItem = findNextPendingAmbiguousItem(freshMessages);

  if (!nextItem) return false;

  // 중복 전송 방지: 동일한 질문이 이미 전송된 경우 스킵
  const alreadySent = freshMessages.some(
    (m: { role: string; content: string }) =>
      m.role === "assistant" && m.content.includes(nextItem.question)
  );
  if (alreadySent) return false;

  const emoji = ITEM_EMOJI[nextItem.patterns[0]] ?? "📦";
  const buttons = nextItem.options.slice(0, 5).map((opt) => ({
    name: opt.label,
    type: "BK" as const,
  }));

  try {
    await sendRichMessage({
      user_key: userKey,
      sender_key: senderKey,
      message: `${emoji} ${nextItem.question}`,
      buttons,
    });
    const optionText = nextItem.options.map((o, idx) => `${idx + 1}. ${o.label}`).join("\n");
    await conversationStore.addAssistantMessage(
      sessionId,
      `${emoji} ${nextItem.question}\n${optionText}`,
      autoSentBy
    );
    console.log(`[Webhook/bg] 모호 품목 버튼 전송: ${nextItem.patterns.join("/")}`);
    return true;
  } catch (err) {
    console.error("[Webhook/bg] 모호 품목 버튼 전송 실패:", err);
    return false;
  }
}

/** 기본정보 버튼 전송 — 버튼 전송 여부를 반환 */
export async function handleBasicInfoButtons(
  sessionId: string,
  userKey: string,
  senderKey: string,
  userMessage: string,
  autoSentBy: string
): Promise<boolean> {
  const conv = await conversationStore.getById(sessionId);
  if (!conv) return false;

  const messages = conv.messages ?? [];
  const hasQuote = (conv.quote?.items?.length ?? 0) > 0;

  // 품목이 아직 없으면 기본정보 질문 안함
  if (!hasQuote) return false;

  // 0. 품목은 있지만 주소 미수집 → 주소 먼저 질문 (자동발송)
  const ADDRESS_ASK_MSG = "수거 주소를 알려주시면 견적 안내해 드리겠습니다 :)";
  const currentInfo = conv.collectedInfo;
  if (!currentInfo?.address) {
    // 이미 주소 질문을 보낸 적 있으면 재전송 안함 (AI에게 위임)
    const alreadyAsked = messages.some(
      (m) => m.role === "assistant" && m.content.includes(ADDRESS_ASK_MSG)
    );
    if (alreadyAsked) return false;

    // 주소 질문 자동발송
    await conversationStore.addAssistantMessage(sessionId, ADDRESS_ASK_MSG, autoSentBy);
    try {
      await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: ADDRESS_ASK_MSG });
      console.log(`[BasicInfo] 주소 질문 자동발송: ${sessionId}`);
    } catch (err) {
      console.error("[BasicInfo] 주소 질문 전송 실패 (메시지는 DB에 저장됨):", err);
    }
    return true;
  }

  // 1. 현재 메시지가 기본정보 버튼 응답인지 확인
  const parsed = parseBasicInfoResponse(messages, userMessage);
  if (parsed) {
    await conversationStore.updateCollectedInfo(sessionId, {
      [parsed.key]: parsed.value,
    });
    console.log(`[BasicInfo] 버튼 응답 파싱: ${parsed.key} = ${parsed.value}`);
  }

  // 2. 최신 collectedInfo 조회
  let freshConv = parsed ? await conversationStore.getById(sessionId) : conv;
  let freshInfo = freshConv?.collectedInfo ?? conv.collectedInfo;

  // 3. 다음 미수집 기본정보 찾기 (1층/지하면 엘리베이터 자동 설정 포함)
  let result = findNextBasicInfoQuestion(freshInfo);

  // autoSet이 있으면 자동 설정 후 다음 질문 재탐색
  while (result.autoSet) {
    await conversationStore.updateCollectedInfo(sessionId, {
      [result.autoSet.key]: result.autoSet.value,
    });
    console.log(`[BasicInfo] 자동 설정: ${result.autoSet.key} = ${result.autoSet.value} (1층/지하)`);
    freshConv = await conversationStore.getById(sessionId);
    freshInfo = freshConv?.collectedInfo ?? conv.collectedInfo;
    result = findNextBasicInfoQuestion(freshInfo);
  }

  const nextQ = result.question;
  if (!nextQ) return false;

  // 같은 질문을 이미 보냈고 유효한 응답이 아니면 재전송 안함 (AI에게 위임)
  if (!parsed) {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.content.includes(nextQ.question)) {
      return false;
    }
  }

  // 4. 버튼 전송
  const buttons = nextQ.options.map((opt) => ({
    name: opt.label,
    type: "BK" as const,
  }));

  // ★ 메시지 저장을 먼저 수행 (send 실패와 무관하게 대화 히스토리 보존)
  const optionText = nextQ.options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  await conversationStore.addAssistantMessage(
    sessionId,
    `${nextQ.question}\n${optionText}`,
    autoSentBy
  );
  try {
    await sendRichMessage({
      user_key: userKey,
      sender_key: senderKey,
      message: nextQ.question,
      buttons,
    });
    console.log(`[BasicInfo] 버튼 전송: ${nextQ.key}`);
  } catch (err) {
    console.error("[BasicInfo] 버튼 전송 실패 (메시지는 DB에 저장됨):", err);
  }
  return true;
}

/** Phase 6 예약접수 시 예약 정보(성함/연락처/일자/시간) 완성 여부 체크 */
export function checkBookingInfoComplete(
  conv: { name?: string | null; phone?: string | null } | null,
  messages: { role: string; content: string }[]
): boolean {
  if (!conv?.name || !conv?.phone) return false;

  const userTexts = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  const hasDate = /\d{1,2}월\s*\d{1,2}일|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|내일|모레|이번\s*주|다음\s*주|금요일|토요일|일요일|월요일|화요일|수요일|목요일/.test(userTexts);
  const hasTime = /오전\s*\d{1,2}\s*시|오후\s*\d{1,2}\s*시|\d{1,2}\s*시|\d{1,2}:\d{2}/.test(userTexts);

  return hasDate && hasTime;
}
