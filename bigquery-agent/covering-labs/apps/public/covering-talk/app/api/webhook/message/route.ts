import { NextRequest, NextResponse, after } from "next/server";
import { sendPlainMessage, sendRichMessage } from "@/lib/happytalk/client";
import { orderStore, ORDER_CHANNELS, type OrderChannel } from "@/lib/store/orders";
import { npsStore, NPS_SCORE_BUCKETS, type NpsScoreBucket } from "@/lib/store/nps";
import { generateAIResponse, extractMessage, extractItemsFromConversation, extractCollectedInfo, generateMemoSummary } from "@/lib/ai/claude";
import { getSessionHistory, saveSessionHistory } from "@/lib/session/store";
import { conversationStore } from "@/lib/store/conversations";
import { supabase } from "@/lib/supabase/client";
import { resolveDistrict, isOutOfServiceArea } from "@/lib/ai/district-resolver";
import { getTripFee, calcVat, ceilTo1000 } from "@/lib/utils/trip-fee";
import { Phase } from "@/lib/ai/phases";
import { checkPhaseTransition } from "@/lib/ai/phase-transitions";
import { ProcessContext } from "@/lib/utils/process-context";
import { persistImage } from "@/lib/supabase/storage";
import { extractBookingDateTime } from "@/lib/utils/booking-datetime";
import {
  isValidPhoneNumber,
  extractCustomerName,
  extractImageUrls,
  mergeConsecutiveUserMessages,
  isDuplicateMessage,
  detectButtonResponse,
  parseBasicInfoResponse,
  findNextBasicInfoQuestion,
  isPendingAmbiguousItem,
  filterResolvedAmbiguousItems,
  resolveButtonKeywords,
  applyButtonResolution,
  BASIC_INFO_QUESTIONS,
} from "@/lib/webhook/message-parser";
import {
  updatePhaseWithStatus,
  markQuoteSent,
  handleAbcSlotButtonResponse,
  handleAmbiguousItemButtons,
  handleBasicInfoButtons,
  checkBookingInfoComplete,
} from "@/lib/webhook/phase-engine";
import {
  getPhase1Template,
  buildQuoteContext,
  autoMapQuoteItems,
} from "@/lib/webhook/response-builder";

// Vercel 함수 타임아웃 60초 (기본 10초로는 AI 웹검색 + 추출 완료 불가)
export const maxDuration = 60;

/** 자동생성 sentBy 생성 — 담당 상담사 있으면 "이름(자동생성)", 없으면 "AI(자동생성)" */
/** 전화상담 요청 감지 — 부정 컨텍스트 우선 + 다양한 긍정 표현 매칭. */
function detectPhoneConsultRequest(msg: string): boolean {
  if (!msg) return false;
  const t = msg.trim();
  // 부정 컨텍스트 — 다음 패턴이 매칭되면 false:
  //   "전화 안 ...", "전화는 괜찮", "톡으로만", "전화 필요 없", "전화 어려",
  //   "전화상담 괜찮" / "전화 상담 안 받" 같이 '상담' 이 끼어든 경우도 포함.
  const negative = /(?:전화|통화|콜)(?:\s*상담)?\s*(?:은|는|도|을|이|만)?\s*(?:안|아니|필요\s*없|괜찮|어려|불가|못\s*받|할\s*수\s*없|안돼|곤란|싫|말|마|없|마세요)|(?:톡|카톡|문자|채팅|메세지|메시지)\s*(?:으로만|로만|만)/;
  if (negative.test(t)) return false;
  // 긍정: 다양한 phrasing
  const positive = /전화\s*상담|전화로\s*(?:상담|문의|연락|진행|안내|얘기|이야기|드리|받|소통|말씀)|전화\s*(?:받고\s*싶|드릴|드려|주세요|주실|부탁|한\s*번|한번|한\s*통|한통|요청|가능|할\s*수|할수|기다|좀\s*해|좀\s*주)|통화\s*(?:가능|상담|로|요청|부탁|좀|한\s*번|한번|원해)|콜\s*상담|연락\s*(?:주세요|주실|부탁|바랍|드릴|좀)/;
  return positive.test(t);
}

function getAutoSentBy(assignee: string | null | undefined): string {
  if (assignee) return `${assignee}(자동생성)`;
  return "AI(자동생성)";
}

/** DB에서 자동상담 모드 설정 읽기 (fallback: 환경변수 → manual) */
async function getAutoMode(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "auto_mode")
      .single();
    if (data?.value === true) return true;
  } catch {
    // 테이블 미존재 등 → 환경변수 fallback
  }
  return (process.env.SEND_MODE ?? "manual") === "auto";
}

/** 세션의 최신 고객 메시지 ID 조회 */
async function getLatestUserTextMessageId(sessionId: string): Promise<string | null> {
  const { data } = await supabase
    .from("messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("role", "user")
    .eq("message_type", "text")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.id ?? null;
}

// [CS-EXT-003] 고객 메시지 수신 및 AI 응답 생성
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  const senderKey = body.sender_key as string;

  // ── 런치 채널이면 런치 핸들러로 리다이렉트 ──
  const lunchSenderKey = process.env.LUNCH_SENDER_KEY;
  if (lunchSenderKey && senderKey === lunchSenderKey) {
    const baseUrl = request.nextUrl.origin;
    const res = await fetch(`${baseUrl}/api/webhook/lunch/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  }

  console.log("[Webhook/message] 수신:", JSON.stringify(body));

  const sessionId = body.session_id as string;
  const userKey = body.user_key as string;
  const msgType = body.type as string;

  // ─── 이미지/사진/파일 수신 ───
  if (msgType === "image" || msgType === "photo" || msgType === "file") {
    const imageUrls = extractImageUrls(body);
    const isImage = msgType === "image" || msgType === "photo";

    console.log(`[Webhook/image] ${sessionId}: ${imageUrls.length}개 이미지 수신`);

    // 각 이미지를 Supabase Storage에 영구 저장 후 개별 메시지로 기록
    if (imageUrls.length > 0) {
      for (const url of imageUrls) {
        // KakaoTalk CDN URL → Supabase Storage 영구 URL
        const permanentUrl = await persistImage(sessionId, url);
        await conversationStore.upsertMessage({
          sessionId, userKey, senderKey,
          userMessage: isImage ? "[사진 수신]" : "[파일 수신]",
          messageType: isImage ? "image" : "file",
          imageUrl: permanentUrl,
          aiDraft: null,
          needsHuman: false,
        });
      }
    } else {
      // URL 없는 경우도 메시지 기록
      await conversationStore.upsertMessage({
        sessionId, userKey, senderKey,
        userMessage: isImage ? "[사진 수신]" : "[파일 수신]",
        messageType: isImage ? "image" : "file",
        aiDraft: null,
        needsHuman: false,
      });
    }

    // 마지막 이미지로 AI 분석 (백그라운드)
    const lastImageUrl = imageUrls[imageUrls.length - 1];
    after(async () => {
      if (isImage && lastImageUrl) {
        try {
          const history = await getSessionHistory(userKey, sessionId);
          const prompt = imageUrls.length > 1
            ? `고객이 사진을 ${imageUrls.length}장 보냈습니다. 마지막 사진을 분석하여 폐기물 품목을 파악하고 견적에 도움이 되는 정보를 제공해주세요.`
            : "고객이 사진을 보냈습니다. 사진을 분석하여 폐기물 품목을 파악하고 견적에 도움이 되는 정보를 제공해주세요.";
          const aiResult = await generateAIResponse(prompt, history, lastImageUrl);
          const aiDraft = extractMessage(aiResult.response);
          await conversationStore.updateDraft(sessionId, aiDraft);
        } catch (err) {
          console.error("[Webhook/bg] 이미지 분석 오류:", err);
          await conversationStore.updateDraft(sessionId, "사진을 확인했습니다. 사진에 대해 추가 정보를 알려주시면 정확한 견적을 안내해드리겠습니다.");
        }
      } else {
        await conversationStore.updateDraft(sessionId, "파일을 확인했습니다. 추가 정보가 필요하시면 말씀해주세요.");
      }
    });

    return NextResponse.json({ status: "ok" });
  }

  // ─── 텍스트 메시지 ───
  const contents = body.contents as (string | { url?: string })[] | undefined;
  const rawUserMessage = Array.isArray(contents)
    ? (typeof contents[0] === "string" ? contents[0] : "")
    : "";
  if (!rawUserMessage?.trim()) return NextResponse.json({ status: "ok" });

  // 고객이 템플릿 "예)" 접두어를 남긴 채 작성한 경우 제거
  const userMessage = rawUserMessage
    .split("\n")
    .map(line => line.replace(/^예\)\s*/, ""))
    .join("\n");

  // 중복 메시지 체크 (해피톡 재시도로 인한 중복 방지)
  const duplicate = await isDuplicateMessage(sessionId, userMessage);
  if (duplicate) {
    console.log(`[Webhook] 중복 메시지 스킵: ${sessionId}`);
    return NextResponse.json({ status: "ok" });
  }

  // 어떤 상태든 고객 메시지 → 대기중으로 전환 (상담사 확인 필요)
  let isRecontact = false;
  {
    const convForStatus = await conversationStore.getById(sessionId);
    if (convForStatus && convForStatus.status !== "pending") {
      isRecontact = true;
      console.log(`[Webhook] ${convForStatus.status} 상태에서 고객 재연락 → pending 전환: ${sessionId}`);
      await conversationStore.updateStatus(sessionId, "pending");
    }
  }

  // 메시지 즉시 저장 (AI 초안 없이)
  await conversationStore.upsertMessage({
    sessionId, userKey, senderKey, userMessage,
    aiDraft: null,
    needsHuman: false,
  });

  // 전화번호 추출 — 항상 시도 (regex 가 엄격해 false positive 적음).
  //   인입 직후 첫 메시지에 "민윤경 010-..." 보내는 케이스도 잡기 위해 상담사 요청 가드 제거.
  //   `[-\s]*` 로 복수 공백/하이픈 허용 ("010  3234  6915" 같은 이중 공백 입력 대응)
  const phoneMatch = userMessage.match(/(?<!\d)01[016789][-\s]*\d{3,4}[-\s]*\d{4}(?!\d)/);
  if (phoneMatch) {
    const cleanPhone = phoneMatch[0].replace(/[-\s]/g, "");
    if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && isValidPhoneNumber(cleanPhone)) {
      await conversationStore.updatePhone(sessionId, cleanPhone);
    } else {
      console.log(`[Webhook] 전화번호 형식 불일치 또는 가짜 번호: ${cleanPhone}`);
    }
  }

  // 이름 추출 — Pattern 1~7 은 항상, Pattern 8 (단독 한글 2~4자) 은 직전 AI 가 성함 요청한 경우만.
  //   "민윤경" 단독 케이스 보호용 contextAskedName 게이팅.
  const { data: recentAssistantMsgs } = await supabase
    .from("messages")
    .select("content")
    .eq("session_id", sessionId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(5);
  const assistantAskedForContact = (recentAssistantMsgs ?? []).some(
    (m) => /성함|연락처|이름|전화번호|휴대폰/.test(m.content)
  );
  const extractedName = extractCustomerName(userMessage, { contextAskedName: assistantAskedForContact });
  if (extractedName) {
    const conv = await conversationStore.getById(sessionId);
    const hasPhoneInMessage = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/.test(userMessage);
    const hasExplicitNameKeyword = /이름|성함|성명/.test(userMessage);
    const isHighConfidence = hasPhoneInMessage || hasExplicitNameKeyword;
    if (conv && (!conv.name || isHighConfidence)) {
      await conversationStore.updateName(sessionId, extractedName);
    }
  }

  // 전화상담 요청 감지 → "전화요청" tag — regex 기반 detectPhoneConsultRequest 는
  //   "전화상담 괜찮아요" 같은 negation 을 모두 못 잡아 false positive 빈번.
  //   AI 기반 extractCollectedInfo.wantsPhoneConsult (infoExtractionTask 내부) 로 일원화.

  // ── 유입 채널 설문 응답 처리 ─────────────────────
  // 카카오 MD 버튼 클릭 시 메시지 형식: "버튼명\n\n원본 메시지 전체" → 첫 줄만 추출해 매칭.
  const trimmedMsg = userMessage.trim();
  const firstLine = trimmedMsg.split(/\r?\n/)[0].trim();
  if ((ORDER_CHANNELS as readonly string[]).includes(firstLine)) {
    try {
      const order = await orderStore.getBySessionId(sessionId);
      if (order && !order.channel) {
        await orderStore.setChannel(order.id, firstLine);
        await sendPlainMessage({
          user_key: userKey,
          sender_key: senderKey,
          message: "답변 감사합니다 ☺️ 더 좋은 서비스로 보답할게요!",
        });
        await conversationStore.addAssistantMessage(
          sessionId,
          "답변 감사합니다 ☺️ 더 좋은 서비스로 보답할게요!",
          "AI",
          true,
        );
        console.log(`[Webhook] 채널 응답 저장: ${sessionId} → "${firstLine as OrderChannel}"`);
        return NextResponse.json({ status: "ok" });
      }
    } catch (channelErr) {
      console.error("[Webhook] 채널 응답 처리 오류:", channelErr);
    }
  }

  // ── NPS 응답 처리 ─────────────────────
  // (1) 점수 버튼 클릭 → score_bucket 저장 + Step 2 (피드백 요청) 송출
  // (2) 점수 응답 후 30분 이내 자유 텍스트 → feedback_text 저장
  // 둘 다 처리 후 AI 처리 스킵.
  try {
    const conv = await conversationStore.getById(sessionId);
    const phone = conv?.phone;
    if (phone) {
      const npsRow = await npsStore.getByPhone(phone);
      if (npsRow) {
        // (1) 점수 응답 — 카카오 MD 버튼 (예: "5점") 또는 단순 숫자 입력 (예: "5") 둘 다 매칭
        const scoreBucket: NpsScoreBucket | null =
          (NPS_SCORE_BUCKETS as readonly string[]).includes(firstLine)
            ? (firstLine as NpsScoreBucket)
            : /^[12]$/.test(firstLine) ? "1~2점"
            : firstLine === "3" ? "3점"
            : firstLine === "4" ? "4점"
            : firstLine === "5" ? "5점"
            : null;
        if (!npsRow.scoreBucket && scoreBucket) {
          await npsStore.setScore(npsRow.id, scoreBucket);
          const step2 = "소중한 점수 감사합니다 ☺️\n좋았던 점이나 아쉬웠던 점이 있으시면 편하게 남겨 주세요. 답변은 익명으로 다뤄집니다.";
          await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: step2 });
          await conversationStore.addAssistantMessage(sessionId, step2, "AI", true);
          console.log(`[Webhook] NPS 점수 저장: ${sessionId} → "${scoreBucket}" (input="${firstLine}")`);
          return NextResponse.json({ status: "ok" });
        }
        // (2) 점수 응답 후 30분 이내 자유 텍스트 = 피드백 — 너무 짧거나 숫자만이면 skip
        if (npsRow.scoreBucket && !npsRow.feedbackText && npsRow.respondedAt) {
          const elapsedMin = (Date.now() - new Date(npsRow.respondedAt).getTime()) / 60000;
          const isTooShort = trimmedMsg.length < 5;
          const isJustDigits = /^[\d\s.,]+$/.test(trimmedMsg);
          if (elapsedMin < 30 && !isTooShort && !isJustDigits) {
            await npsStore.setFeedback(npsRow.id, trimmedMsg.slice(0, 1000));
            await sendPlainMessage({
              user_key: userKey,
              sender_key: senderKey,
              message: "소중한 의견 감사드립니다 🙏",
            });
            await conversationStore.addAssistantMessage(sessionId, "소중한 의견 감사드립니다 🙏", "AI", true);
            console.log(`[Webhook] NPS 피드백 저장: ${sessionId}`);
            return NextResponse.json({ status: "ok" });
          }
        }
      }
    }
  } catch (npsErr) {
    console.error("[Webhook] NPS 응답 처리 오류:", npsErr);
  }

  // ★ 즉시 200 OK 반환 → AI 처리는 백그라운드에서
  // 디바운스: 고객이 연속으로 메시지를 보내는 경우 3초 대기 후 합쳐서 처리
  const savedMessageId = await getLatestUserTextMessageId(sessionId);
  after(async () => {
    try {
      // 3초 대기 — 고객이 추가 메시지를 보낼 여유를 줌
      await new Promise(r => setTimeout(r, 3000));

      // 대기 후 최신 텍스트 메시지 확인 — 이미지 메시지는 무시 (이미지가 텍스트 처리를 스킵시키는 race condition 방지)
      const latestId = await getLatestUserTextMessageId(sessionId);
      if (latestId && savedMessageId && latestId !== savedMessageId) {
        console.log(`[Webhook/debounce] ${sessionId}: 더 새로운 텍스트 메시지 존재 → 스킵 (saved=${savedMessageId}, latest=${latestId})`);
        return; // 더 새로운 텍스트 메시지의 핸들러가 처리할 것
      }

      // 최근 연속 고객 메시지를 합침
      const mergedMessage = await mergeConsecutiveUserMessages(sessionId);
      console.log(`[Webhook/debounce] ${sessionId}: 합쳐진 메시지 처리: "${mergedMessage.substring(0, 100)}..."`);

      await processTextMessage(sessionId, userKey, senderKey, mergedMessage);
    } catch (err) {
      console.error("[Webhook/bg] 텍스트 처리 오류:", err);
      await conversationStore.updateStatus(sessionId, "needs_check");
    }
    // ★ 재연락 시: processTextMessage가 status를 덮어썼을 수 있으므로 "pending"으로 복원
    if (isRecontact) {
      try {
        const finalConv = await conversationStore.getById(sessionId);
        const finalStatus = finalConv?.status;
        if (finalStatus && finalStatus !== "pending" && finalStatus !== "needs_check") {
          await conversationStore.updateStatus(sessionId, "pending");
          console.log(`[Webhook] 재연락 status 보정: ${finalStatus} → pending (${sessionId})`);
        }
      } catch (guardErr) {
        console.error("[Webhook] 재연락 status 보정 오류:", guardErr);
      }
    }
  });

  return NextResponse.json({ status: "ok" });
}

/** 백그라운드에서 실행: Phase-aware AI 응답 생성 + 견적 매핑 + 모호 품목 버튼 */
async function processTextMessage(
  sessionId: string,
  userKey: string,
  senderKey: string,
  userMessage: string
) {
  const history = await getSessionHistory(userKey, sessionId);
  const conv = await conversationStore.getById(sessionId);
  const allMessages = conv?.messages ?? [];
  const originalPhase = conv?.currentPhase ?? Phase.PHASE_1_INITIAL;
  let currentPhase = originalPhase;
  const autoSentBy = getAutoSentBy(conv?.assignee);

  // ── ABC 타임 슬롯 버튼 응답 감지 (조기 return) ──
  if (conv) {
    const abcHandled = await handleAbcSlotButtonResponse(sessionId, userKey, senderKey, userMessage, conv);
    if (abcHandled) return;
  }

  // ── 사이드 드롭박스 requestedDate 자동 업데이트 ──
  // 규칙: 현재 고객 메시지에만 날짜가 있을 때 업데이트 (과거 메시지 재추출 X).
  //   고객이 최신 의도를 말하지 않으면 기존 값 유지 → 오래된 날짜가 덮어쓰지 않음.
  if (conv) {
    try {
      const { extractBookingDateTime } = await import("@/lib/utils/booking-datetime");
      const { date: extractedDate } = extractBookingDateTime(userMessage);
      const ci = conv.collectedInfo as unknown as Record<string, unknown>;
      const currentRequested = (ci?.requestedDate as string | undefined) ?? null;
      if (extractedDate && extractedDate !== currentRequested) {
        await conversationStore.updateCollectedInfo(sessionId, { requestedDate: extractedDate } as Partial<typeof conv.collectedInfo>);
      }
    } catch (err) {
      console.warn("[requestedDate] 자동 추출 실패:", err);
    }
  }

  // 워크플로우 설정 (템플릿 + Phase 토글)
  const { getWorkflowConfig: getWfConfig } = await import("@/lib/utils/workflow-config");
  const wfConfig = await getWfConfig();
  const phaseOptions = { skipNudge: wfConfig.skip_nudge, skipDoublecheck: wfConfig.skip_doublecheck };

  // ── Phase 1: 고정 템플릿 전송 (AI 호출 안 함) ──
  if (originalPhase === Phase.PHASE_1_INITIAL) {
    // "견적받기" 버튼 인입 → 카카오톡이 이미 템플릿을 보여주므로 템플릿 생략
    const isQuoteButton = userMessage.trim() === "견적받기";
    // 고객이 이미 템플릿을 작성해서 보낸 경우 감지
    // 1) 정확한 섹션 헤더 2개 이상 포함
    const templateSections = ["수거 희망 일시", "상세 주소", "버릴 품목", "작업 환경"];
    const filledSections = templateSections.filter((s) => userMessage.includes(s)).length;
    // 2) 번호 형식(1. 2. 3.)으로 주소+품목+날짜 키워드가 포함된 경우
    const hasNumberedFormat = /[1-4]\s*[.\)]/m.test(userMessage);
    // 주소: 시도+구/군/시, 동/읍/면/리+숫자, 로/길+숫자, 또는 N호/N층 (아파트 호수)
    const hasAddress = /[가-힣]+[시도]\s*[가-힣]+[구군시]/.test(userMessage)
      || /[가-힣]+[동읍면리]\s*\d/.test(userMessage)
      || /[가-힣]+(?:로|길)\s*\d/.test(userMessage)
      || /\d+\s*[호층]/.test(userMessage);
    const hasItems = /[가-힣]+(1개|2개|3개|\d+개|한개|두개)/.test(userMessage) || /침대|소파|책상|냉장고|세탁기|옷장|장롱|거울|수납|러닝머신|의자|행거|프레임/.test(userMessage);
    const hasDateInfo = /\d{1,2}[\/\.\-]\d{1,2}|오전|오후|내일|모레|토요일|일요일/.test(userMessage);
    const isRichFirstMessage = hasAddress && hasItems && hasDateInfo;
    // 3) 번호 항목 3개 이상 — 구조화된 응답 signal (정규식 매칭이 못 잡는 케이스 안전망)
    const numberedItemCount = (userMessage.match(/^\s*[1-9]\s*[.\)]/gm) ?? []).length;
    const hasMultipleNumbered = numberedItemCount >= 3;
    const isFilledTemplate = filledSections >= 2
      || (hasNumberedFormat && isRichFirstMessage)
      || isRichFirstMessage
      || (hasMultipleNumbered && (hasItems || hasAddress || hasDateInfo));

    if (isQuoteButton) {
      await updatePhaseWithStatus(sessionId, Phase.PHASE_2_COLLECT, "견적받기 버튼 인입 (템플릿 생략)", "auto");
      console.log(`[Webhook] Phase 전환: phase_1 → phase_2 (견적받기 버튼 — 템플릿 생략)`);
      return;
    }

    if (isFilledTemplate) {
      // 고객이 이미 정보를 작성 → 템플릿 생략, Phase 2로 진입하고 아래 AI 로직에서 처리.
      // 단, 전화 상담 안내는 별도 발송 — 템플릿을 생략해도 전화 옵션은 노출되어야 함.
      await updatePhaseWithStatus(sessionId, Phase.PHASE_2_COLLECT, "고객 작성 템플릿 감지 (템플릿 생략)", "auto");
      currentPhase = Phase.PHASE_2_COLLECT;
      console.log(`[Webhook] Phase 전환: phase_1 → phase_2 (고객 작성 템플릿 감지 — 템플릿 생략, AI 응답 진행)`);

      try {
        const { PHONE_CONSULT_NOTICE } = await import("@/lib/utils/workflow-config");
        await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: PHONE_CONSULT_NOTICE });
        await conversationStore.addAssistantMessage(sessionId, PHONE_CONSULT_NOTICE, autoSentBy);
      } catch (err) {
        console.error("[Webhook] phone consult notice send failed:", err);
      }
    } else {
    const phase1Message = await getPhase1Template();
    await conversationStore.updateDraft(sessionId, phase1Message);
    await updatePhaseWithStatus(sessionId, Phase.PHASE_2_COLLECT, "고객 첫 메시지 수신", "auto");
    currentPhase = Phase.PHASE_2_COLLECT;
    console.log(`[Webhook] Phase 전환: phase_1 → phase_2 (고객 첫 메시지 수신, 템플릿 발송)`);

    // 첫 메시지에서 품목 + 수집 정보(주소/층수/엘베/주차) 병렬 추출
    try {
      const [, extracted] = await Promise.all([
        autoMapQuoteItems(sessionId, allMessages),
        extractCollectedInfo(allMessages),
      ]);

      // 수집 정보 저장 (주소/층수/엘베/주차 등)
      if (extracted) {
        if (extracted.address === null) delete extracted.address;
        if (extracted.district === null) delete extracted.district;
        if (extracted.floor === null) delete extracted.floor;
        if (extracted.elevator === null) delete extracted.elevator;
        if (extracted.parking === null) delete extracted.parking;
        if (Object.keys(extracted).length > 0) {
          if (extracted.address && !extracted.district) {
            const resolved = await resolveDistrict(extracted.address, null);
            if (resolved) extracted.district = resolved;
          } else if (extracted.address && extracted.district) {
            const verified = await resolveDistrict(extracted.address, extracted.district);
            if (verified) extracted.district = verified;
          }
          await conversationStore.updateCollectedInfo(sessionId, extracted);
          console.log(`[Webhook] Phase 1 수집 정보 추출:`, JSON.stringify(extracted));
        }
      }

      // 병렬 완료 후 출장비 재계산 (district가 추출되었을 수 있으므로)
      try {
        const afterConv = await conversationStore.getById(sessionId);
        const afterDistrict = afterConv?.collectedInfo?.district;
        const afterQuote = afterConv?.quote;
        if (afterDistrict && afterQuote) {
          const correctTripFee = getTripFee(afterDistrict, 1);
          if (correctTripFee !== afterQuote.tripFee) {
            const newSubtotal = afterQuote.basePrice + (afterQuote.ladderFee ?? 0) + correctTripFee;
            const newVat = calcVat(newSubtotal);
            await conversationStore.updateQuote(sessionId, {
              ...afterQuote,
              tripFee: correctTripFee,
              workerCount: 1,
              vatAmount: newVat,
              totalPrice: ceilTo1000(newSubtotal + newVat),
            });
            console.log(`[Webhook] Phase1 출장비 재계산: ${afterQuote.tripFee} → ${correctTripFee} (${afterDistrict})`);
          }
        }
      } catch (tripErr) {
        console.error("[Webhook] Phase1 출장비 재계산 오류:", tripErr);
      }
    } catch (err) {
      console.error("[Webhook] Phase 1 추출 오류:", err);
    }

    // 추출 완료 후 Phase 4 전환 가능 여부 체크
    // 고객이 첫 메시지에 모든 정보(품목+주소+엘베+주차)를 보낸 경우
    // 수집 템플릿 대신 바로 견적 안내
    const p1Conv = await conversationStore.getById(sessionId);
    const p1Info = p1Conv?.collectedInfo;
    const p1HasQuote = (p1Conv?.quote?.items?.length ?? 0) > 0;
    const p1Messages = p1Conv?.messages ?? allMessages;
    const p1Transition = checkPhaseTransition(
      currentPhase, p1Info ?? { address: null, district: null, floor: null, elevator: null, parking: null, items: [], special_notes: [], photos: [] },
      p1HasQuote, userMessage, "text",
      p1Messages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      false, phaseOptions
    );

    if (p1Transition && p1Transition.nextPhase === Phase.PHASE_4_QUOTE) {
      // Phase 4로 전환 가능 → 수집 템플릿 생략, 견적 바로 전송
      await updatePhaseWithStatus(sessionId, Phase.PHASE_4_QUOTE, p1Transition.reason, "auto");
      console.log(`[Webhook] Phase 1 → Phase 4 직행: 첫 메시지에 모든 정보 포함 (${p1Transition.reason})`);

      const p1Quote = p1Conv?.quote;
      if (p1Quote && (p1Quote.items?.length ?? 0) > 0 && (p1Quote.totalPrice ?? 0) > 0) {
        const hasLadder = (p1Quote.ladderFee ?? 0) > 0;
        const priceLabel = hasLadder ? "(사다리차/부가세 포함)" : "(부가세 포함)";
        const p1QuoteTemplate = `고객님, 기다려주셔서 감사합니다.\n전달해 주신 내용에 따라 예상 견적 안내해 드립니다!\n\n견적: ${p1Quote.totalPrice.toLocaleString()}원 ${priceLabel}\n* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.\n\n수거를 희망하시면 예약 확정 도와드리겠습니다.\n추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;
        await conversationStore.updateDraft(sessionId, p1QuoteTemplate);

        const p1AutoMode = await getAutoMode();
        if (p1AutoMode) {
          await conversationStore.addAssistantMessage(sessionId, p1QuoteTemplate, autoSentBy);
          await saveSessionHistory(userKey, sessionId, userMessage, p1QuoteTemplate);
          try {
            await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: p1QuoteTemplate });
            await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
            await markQuoteSent(sessionId);
            console.log(`[Webhook] Phase1→4 견적 전송: ${sessionId} (${p1Quote.totalPrice.toLocaleString()}원)`);
          } catch (sendErr) {
            console.error("[Webhook] Phase1→4 견적 전송 실패:", sendErr);
          }
        }
        return;
      }
      // 견적 금액이 없으면 Phase 4지만 AI 응답으로 진행 (아래 공통 섹션)
      currentPhase = Phase.PHASE_4_QUOTE;
    } else {
      // Phase 4 전환 불가 — 주소가 있을 때만 AI 응답으로 진행, 품목만 있으면 고정 템플릿 발송
      const hasAddress = !!p1Info?.address;

      if (hasAddress) {
        // ★ 주소를 이미 제공 → 수집 템플릿 생략, AI 응답으로 진행
        // AI가 받은 정보를 인정하고 부족한 부분만 자연스럽게 질문
        await conversationStore.updateDraft(sessionId, ""); // 가이드 템플릿 draft 제거
        console.log(`[Webhook] Phase 1: 고객 주소 제공 (items=${p1HasQuote}) → 수집 템플릿 생략, AI 응답 진행`);
        // return 없이 아래 AI 응답 섹션으로 fall-through
      } else {
        // 의미 있는 정보 없음 → 기존대로 수집 템플릿 전송
        await conversationStore.addAssistantMessage(sessionId, phase1Message, autoSentBy);
        await saveSessionHistory(userKey, sessionId, userMessage, phase1Message);
        try {
          await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: phase1Message });
        } catch (err) {
          console.error("[Webhook] Phase 1 자동 전송 실패 (메시지는 DB에 저장됨):", err);
        }
        return;
      }
    }
    } // else (isFilledTemplate가 아닌 경우) 닫기
  }

  // ── Phase 2 이후: 정보 수집 + AI 응답 ──

  // 0. 버튼 응답 Fast Path (Phase 2/3에서만)
  let fastPathCompleted = false;
  let preTransitionPhase: string | null = null;
  const isPhaseForButtons = (
    currentPhase === Phase.PHASE_2_COLLECT ||
    currentPhase === Phase.PHASE_3_SPEC
  );
  const existingOutOfService = isOutOfServiceArea(conv?.collectedInfo?.address ?? null);

  if (isPhaseForButtons && !existingOutOfService) {
    const buttonDetection = detectButtonResponse(allMessages, userMessage);
    if (buttonDetection.isButton) {
      console.log(`[Webhook/fastpath] 버튼 응답 감지: "${userMessage}" (type: ${buttonDetection.type})`);

      // 기본정보 버튼(층수/엘베/주차)은 품목 변경 없음 → 매핑 스킵으로 즉시 응답
      if (buttonDetection.type !== "basic_info") {
        try {
          await autoMapQuoteItems(sessionId, allMessages);
        } catch (err) {
          console.error("[Webhook/fastpath] 견적 매핑 오류:", err);
        }
      }

      // fast path 출장비 재계산 (autoMapQuoteItems가 district 반영 못했을 수 있음)
      try {
        const fpTripConv = await conversationStore.getById(sessionId);
        const fpTripDistrict = fpTripConv?.collectedInfo?.district;
        const fpTripQuote = fpTripConv?.quote;
        if (fpTripDistrict && fpTripQuote) {
          const fpCorrectTripFee = getTripFee(fpTripDistrict, 1);
          if (fpCorrectTripFee !== fpTripQuote.tripFee) {
            const fpNewSubtotal = fpTripQuote.basePrice + (fpTripQuote.ladderFee ?? 0) + fpCorrectTripFee;
            const fpNewVat = calcVat(fpNewSubtotal);
            await conversationStore.updateQuote(sessionId, {
              ...fpTripQuote,
              tripFee: fpCorrectTripFee,
              workerCount: 1,
              vatAmount: fpNewVat,
              totalPrice: ceilTo1000(fpNewSubtotal + fpNewVat),
            });
            console.log(`[Webhook/fastpath] 출장비 재계산: ${fpTripQuote.tripFee} → ${fpCorrectTripFee} (${fpTripDistrict})`);
          }
        }
      } catch (tripErr) {
        console.error("[Webhook/fastpath] 출장비 재계산 오류:", tripErr);
      }

      // Phase transition 체크
      const fpConv = await conversationStore.getById(sessionId);
      const fpInfo = fpConv?.collectedInfo ?? conv?.collectedInfo ?? {
        address: null, district: null, floor: null, elevator: null, parking: null,
        items: [], special_notes: [], photos: [],
      };
      const fpHasQuote = (fpConv?.quote?.items?.length ?? 0) > 0;
      const fpMessages = fpConv?.messages ?? allMessages;

      const fpTransition = checkPhaseTransition(
        currentPhase, fpInfo, fpHasQuote, userMessage, "text",
        fpMessages.map((m) => ({ role: m.role, content: m.content })),
        false, phaseOptions
      );
      if (fpTransition) {
        await updatePhaseWithStatus(sessionId, fpTransition.nextPhase, fpTransition.reason, "auto");
        currentPhase = fpTransition.nextPhase;
        preTransitionPhase = fpTransition.nextPhase;
        console.log(`[Webhook/fastpath] Phase 전환: ${originalPhase} → ${currentPhase} (${fpTransition.reason})`);

        // ★ Fast path Phase 4 진입 시 즉시 견적 템플릿 처리
        if (fpTransition.nextPhase === Phase.PHASE_4_QUOTE) {
          const fp4Conv = await conversationStore.getById(sessionId);
          const fp4Quote = fp4Conv?.quote;
          if (fp4Quote && (fp4Quote.items?.length ?? 0) > 0 && (fp4Quote.totalPrice ?? 0) > 0) {
            const hasLadder = (fp4Quote.ladderFee ?? 0) > 0;
            const priceLabel = hasLadder ? "(사다리차/부가세 포함)" : "(부가세 포함)";
            const fpTemplate = `고객님, 기다려주셔서 감사합니다.\n전달해 주신 내용에 따라 예상 견적 안내해 드립니다!\n\n견적: ${fp4Quote.totalPrice.toLocaleString()}원 ${priceLabel}\n* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.\n\n수거를 희망하시면 예약 확정 도와드리겠습니다.\n추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;
            await conversationStore.updateDraft(sessionId, fpTemplate);
            const fpAutoMode = await getAutoMode();
            if (fpAutoMode) {
              await conversationStore.addAssistantMessage(sessionId, fpTemplate, autoSentBy);
              await saveSessionHistory(userKey, sessionId, userMessage, fpTemplate);
              try {
                await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: fpTemplate });
                await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
                await markQuoteSent(sessionId);
                console.log(`[Webhook/fastpath] Phase4 견적 전송: ${sessionId} (${fp4Quote.totalPrice.toLocaleString()}원)`);
              } catch (sendErr) {
                console.error("[Webhook/fastpath] Phase4 견적 전송 실패:", sendErr);
              }
            }
            return;
          }
        }
      }

      if (currentPhase === Phase.PHASE_2_COLLECT || currentPhase === Phase.PHASE_3_SPEC) {
        const basicInfoSent = await handleBasicInfoButtons(sessionId, userKey, senderKey, userMessage, autoSentBy);
        if (basicInfoSent) return;

        // ★ 기본정보 버튼 처리 후 Phase 전환 재체크
        // (handleBasicInfoButtons가 parking/elevator 등을 저장한 뒤, 모든 필수 항목이 충족되었을 수 있음)
        const fpConv2 = await conversationStore.getById(sessionId);
        const fpInfo2 = fpConv2?.collectedInfo ?? fpInfo;
        const fpHasQuote2 = (fpConv2?.quote?.items?.length ?? 0) > 0;
        const fpMessages2 = fpConv2?.messages ?? fpMessages;
        const fpTransition2 = checkPhaseTransition(
          currentPhase, fpInfo2, fpHasQuote2, userMessage, "text",
          fpMessages2.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
          false, phaseOptions
        );
        if (fpTransition2) {
          await updatePhaseWithStatus(sessionId, fpTransition2.nextPhase, fpTransition2.reason, "auto");
          currentPhase = fpTransition2.nextPhase;
          preTransitionPhase = fpTransition2.nextPhase;
          console.log(`[Webhook/fastpath] 기본정보 후 Phase 전환: ${originalPhase} → ${currentPhase} (${fpTransition2.reason})`);

          // ★ 기본정보 후 Phase 4 진입 시 즉시 견적 처리
          if (fpTransition2.nextPhase === Phase.PHASE_4_QUOTE) {
            const fp4Conv2 = await conversationStore.getById(sessionId);
            const fp4Quote2 = fp4Conv2?.quote;
            if (fp4Quote2 && (fp4Quote2.items?.length ?? 0) > 0 && (fp4Quote2.totalPrice ?? 0) > 0) {
              const hasLadder2 = (fp4Quote2.ladderFee ?? 0) > 0;
              const priceLabel2 = hasLadder2 ? "(사다리차/부가세 포함)" : "(부가세 포함)";
              const fpTemplate2 = `고객님, 기다려주셔서 감사합니다.\n전달해 주신 내용에 따라 예상 견적 안내해 드립니다!\n\n견적: ${fp4Quote2.totalPrice.toLocaleString()}원 ${priceLabel2}\n* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.\n\n수거를 희망하시면 예약 확정 도와드리겠습니다.\n추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;
              await conversationStore.updateDraft(sessionId, fpTemplate2);
              const fpAutoMode2 = await getAutoMode();
              if (fpAutoMode2) {
                await conversationStore.addAssistantMessage(sessionId, fpTemplate2, autoSentBy);
                await saveSessionHistory(userKey, sessionId, userMessage, fpTemplate2);
                try {
                  await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: fpTemplate2 });
                  await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
                  await markQuoteSent(sessionId);
                  console.log(`[Webhook/fastpath] 기본정보후 Phase4 견적 전송: ${sessionId}`);
                } catch (sendErr) {
                  console.error("[Webhook/fastpath] 기본정보후 Phase4 전송 실패:", sendErr);
                }
              }
              return;
            }
          }
        }
      }

      // 더 이상 보낼 버튼 없음 → 추출/매핑 스킵하고 AI 응답 직행
      fastPathCompleted = true;
      console.log(`[Webhook/fastpath] 버튼 없음 → AI 응답 생성으로 직행 (phase: ${currentPhase}, 추출/매핑 스킵)`);
    }
  }

  if (!fastPathCompleted) {
  // 재인입 경계: 이전 상담 메시지가 추출에 영향 주지 않도록 경계 이후만 사용
  const reentryConvCheck = await conversationStore.getById(sessionId);
  const reentryBoundary = (reentryConvCheck?.collectedInfo as unknown as Record<string, unknown>)?._reentryMsgIdx as number | undefined;
  const messagesForExtraction = reentryBoundary != null && reentryBoundary > 0
    ? allMessages.slice(reentryBoundary)
    : allMessages;

  // 1. 수집 정보 추출 + 견적 매핑 (병렬 실행)
  const infoExtractionTask = async () => {
    try {
      const extracted = await extractCollectedInfo(messagesForExtraction);

      // 이름 / 전화상담 의도 / 연락처 — AI 가 컨텍스트 보고 판단 (regex 오탐 보완).
      //   conv 가 아직 fetch 되지 않은 시점일 수 있어 별도 처리.
      const { customerName, customerPhone, wantsPhoneConsult } = extracted;
      if (customerName || customerPhone || wantsPhoneConsult !== undefined) {
        try {
          const convNow = await conversationStore.getById(sessionId);
          if (convNow) {
            if (customerName && typeof customerName === "string" && !convNow.name) {
              await conversationStore.updateName(sessionId, customerName);
              console.log(`[Webhook] AI 이름 추출: ${customerName}`);
            }
            if (customerPhone && typeof customerPhone === "string" && !convNow.phone) {
              await conversationStore.updatePhone(sessionId, customerPhone.replace(/\D/g, ""));
              console.log(`[Webhook] AI 연락처 추출: ${customerPhone}`);
            }
            if (wantsPhoneConsult === true) {
              await conversationStore.addTag(sessionId, "전화요청");
              console.log(`[Webhook] AI 전화상담 의도 감지 → 전화요청 tag`);
            }
          }
        } catch (e) {
          console.warn("[Webhook] AI 추출 부가 정보 반영 실패:", e);
        }
      }
      // 위 부가 필드는 collectedInfo update 에 포함시키지 않음 (스키마에 없음)
      delete (extracted as { customerName?: unknown }).customerName;
      delete (extracted as { customerPhone?: unknown }).customerPhone;
      delete (extracted as { wantsPhoneConsult?: unknown }).wantsPhoneConsult;

      if (extracted.address === null) delete extracted.address;
      if (extracted.district === null) delete extracted.district;
      if (extracted.floor === null) delete extracted.floor;
      if (extracted.elevator === null) delete extracted.elevator;
      if (extracted.parking === null) delete extracted.parking;
      if (Object.keys(extracted).length > 0) {
        if (extracted.address && !extracted.district) {
          const resolved = await resolveDistrict(extracted.address, null);
          if (resolved) {
            extracted.district = resolved;
            console.log(`[Webhook] 지역 자동 파악: ${extracted.address} → ${resolved}`);
          }
        } else if (extracted.address && extracted.district) {
          const verified = await resolveDistrict(extracted.address, extracted.district);
          if (verified) extracted.district = verified;
        }
        await conversationStore.updateCollectedInfo(sessionId, extracted);
        console.log(`[Webhook] 수집 정보 저장:`, JSON.stringify(extracted).slice(0, 200));
      }

      // address는 있지만 district가 아직 null인 경우 재시도
      const existingInfo = (await conversationStore.getById(sessionId))?.collectedInfo;
      if (existingInfo?.address && !existingInfo?.district) {
        console.log(`[Webhook] district 미확인 재시도: ${existingInfo.address}`);
        const retryResolved = await resolveDistrict(existingInfo.address, null);
        if (retryResolved) {
          await conversationStore.updateCollectedInfo(sessionId, { district: retryResolved });
          console.log(`[Webhook] district 재시도 성공: ${existingInfo.address} → ${retryResolved}`);
        }
      }
    } catch (err) {
      console.error("[Webhook] 수집 정보 추출 오류:", err);
    }
  };

  const quoteMapTask = async () => {
    try {
      await autoMapQuoteItems(sessionId, allMessages);
    } catch (err) {
      console.error("[Webhook] 견적 자동 매핑 오류:", err);
    }
  };

  // Phase 4 이후(견적 확정 후)에는 품목 재추출/견적 매핑 불필요
  // Phase 2, 3, 3-1에서만 실행 (이후 Phase에서 재추출 시 AI가 대화 맥락을 오해석하여 품목 변경 위험)
  const needsQuoteMap = (
    currentPhase === Phase.PHASE_2_COLLECT ||
    currentPhase === Phase.PHASE_3_SPEC ||
    currentPhase === Phase.PHASE_3_1_MODIFY
  );

  // 기존 주소 기준 서비스 지역 외 판단 (병렬 실행 가부 결정)
  if (existingOutOfService) {
    // 서비스 지역 외: 추출만 실행 (견적 매핑 불필요)
    await infoExtractionTask();
  } else if (!needsQuoteMap) {
    // Phase 4+: 정보 추출만 (견적 매핑 스킵)
    await infoExtractionTask();
  } else {
    // Phase 2/3/3-1: 병렬 — 수집 정보 추출 + 견적 매핑 동시 실행
    await Promise.allSettled([infoExtractionTask(), quoteMapTask()]);

    // 병렬 완료 후 출장비 재계산 (district가 확정되었을 수 있으므로)
    try {
      const afterConv = await conversationStore.getById(sessionId);
      const afterDistrict = afterConv?.collectedInfo?.district;
      const afterQuote = afterConv?.quote;
      if (afterDistrict && afterQuote) {
        const correctTripFee = getTripFee(afterDistrict, 1); // 출장비는 항상 1명 기준
        if (correctTripFee !== afterQuote.tripFee) {
          const newSubtotal = afterQuote.basePrice + (afterQuote.ladderFee ?? 0) + correctTripFee;
          const newVat = calcVat(newSubtotal);
          await conversationStore.updateQuote(sessionId, {
            ...afterQuote,
            tripFee: correctTripFee,
            vatAmount: newVat,
            totalPrice: ceilTo1000(newSubtotal + newVat),
          });
          console.log(`[Webhook] 출장비 재계산: ${afterQuote.tripFee} → ${correctTripFee} (${afterDistrict})`);
        }
      }
    } catch (err) {
      console.error("[Webhook] 출장비 재계산 오류:", err);
    }
  }

  // 1.5. 최신 데이터 조회 (getById 1회로 통합)
  const updatedConv = await conversationStore.getById(sessionId);
  const collectedInfo = updatedConv?.collectedInfo ?? conv?.collectedInfo ?? {
    address: null, district: null, floor: null, elevator: null, parking: null,
    items: [], special_notes: [], photos: [],
  };
  const outOfServiceArea = isOutOfServiceArea(collectedInfo?.address ?? null);
  if (outOfServiceArea) {
    console.log(`[Webhook] 서비스 지역 외 감지: ${collectedInfo?.address}`);
  }
  const hasQuote = (updatedConv?.quote?.items?.length ?? 0) > 0;

  const freshMessages = updatedConv?.messages ?? allMessages;

  // 3. Pre-transition: AI 호출 전 Phase 전환 체크
  // updatedConv.messages 사용 — allMessages는 Promise 이전 스냅샷이라 stale할 수 있음
  const hasBookingInfo = currentPhase === Phase.PHASE_6_BOOKING
    ? checkBookingInfoComplete(updatedConv ?? null, freshMessages)
    : false;

  const preTransition = checkPhaseTransition(
    currentPhase, collectedInfo, hasQuote, userMessage, "text",
    freshMessages.map((m) => ({ role: m.role, content: m.content })),
    hasBookingInfo, phaseOptions
  );

  if (preTransition) {
    await updatePhaseWithStatus(sessionId, preTransition.nextPhase, preTransition.reason, "auto");
    currentPhase = preTransition.nextPhase;
    preTransitionPhase = preTransition.nextPhase;
    console.log(`[Webhook] Phase 전환: ${originalPhase} → ${currentPhase} (${preTransition.reason})`);

    // ★ Phase 4 진입 시 즉시 견적 템플릿 draft 설정 (타임아웃 방지)
    if (preTransition.nextPhase === Phase.PHASE_4_QUOTE) {
      try {
        const p4Conv = await conversationStore.getById(sessionId);
        const p4Quote = p4Conv?.quote;
        if (p4Quote && (p4Quote.items?.length ?? 0) > 0 && (p4Quote.totalPrice ?? 0) > 0) {
          const hasLadder = (p4Quote.ladderFee ?? 0) > 0;
          const priceLabel = hasLadder ? "(사다리차/부가세 포함)" : "(부가세 포함)";
          const earlyTemplate = `고객님, 기다려주셔서 감사합니다.\n전달해 주신 내용에 따라 예상 견적 안내해 드립니다!\n\n견적: ${p4Quote.totalPrice.toLocaleString()}원 ${priceLabel}\n* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.\n\n수거를 희망하시면 예약 확정 도와드리겠습니다.\n추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;
          await conversationStore.updateDraft(sessionId, earlyTemplate);

          const isAutoModeEarly = await getAutoMode();
          if (isAutoModeEarly) {
            const latestMsgsCheck = p4Conv?.messages ?? [];
            const lastUserIdxCheck = [...latestMsgsCheck].reverse().findIndex((m) => m.role === "user" && m.content === userMessage);
            const hasExistingReplyCheck = lastUserIdxCheck >= 0 && lastUserIdxCheck > 0;
            if (!hasExistingReplyCheck) {
              await conversationStore.addAssistantMessage(sessionId, earlyTemplate, autoSentBy);
              await saveSessionHistory(userKey, sessionId, userMessage, earlyTemplate);
              try {
                await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: earlyTemplate });
                // ★ 전송 성공 후에만 status 변경
                await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
                await markQuoteSent(sessionId);
                console.log(`[Webhook] Phase4 즉시 견적 템플릿 전송: ${sessionId} (${p4Quote.totalPrice.toLocaleString()}원)`);
              } catch (sendErr) {
                console.error("[Webhook] Phase4 즉시 견적 전송 실패:", sendErr);
              }
            }
          }
          // Phase 4 처리 완료 플래그 (아래 공통 섹션에서 중복 처리 방지)
          return;
        }
      } catch (p4Err) {
        console.error("[Webhook] Phase4 즉시 처리 오류:", p4Err);
      }
    }

    // Phase 3-1 진입 시 품목 변경을 위해 autoMapQuoteItems 실행
    // (Phase 8에서는 quoteMapTask가 스킵되므로 여기서 실행)
    if (preTransition.nextPhase === Phase.PHASE_3_1_MODIFY) {
      try {
        const latestConv = await conversationStore.getById(sessionId);
        const latestMsgs = latestConv?.messages ?? freshMessages;
        await autoMapQuoteItems(sessionId, latestMsgs.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })));
        console.log(`[Webhook] Phase 3-1: 품목 변경 매핑 실행`);
      } catch (err) {
        console.error("[Webhook] Phase 3-1 품목 매핑 오류:", err);
      }
    }
    // 취소로 CLOSED 진입 시 cancelled 상태 설정
    if (preTransition.nextPhase === Phase.CLOSED && preTransition.reason.includes("취소")) {
      await conversationStore.updateStatus(sessionId, "cancelled");
    }
    // 재인입(Phase 5/CLOSED → Phase 2): 주소/환경정보 보존, 재인입 메시지 경계 저장
    // ⚠️ 견적 자동 초기화 제거 — 관리자가 견적 편집기에서 수동 초기화
    if (preTransition.nextPhase === Phase.PHASE_2_COLLECT &&
        (originalPhase === Phase.CLOSED || originalPhase === Phase.PHASE_5_NUDGE)) {
      const reentryConv = await conversationStore.getById(sessionId);
      const prevQuote = reentryConv?.quote;
      const prevInfo = reentryConv?.collectedInfo;
      const prevQuoteSummary = prevQuote && prevQuote.items?.length > 0
        ? {
            items: prevQuote.items.map((i: { name: string; quantity: number }) => `${i.name} x${i.quantity}`),
            totalPrice: prevQuote.totalPrice,
          }
        : null;
      const msgCount = reentryConv?.messages?.length ?? 0;
      const reentryIdx = Math.max(0, msgCount - 1);
      await conversationStore.updateCollectedInfo(sessionId, {
        items: [],
        special_notes: [],
        _reentryMsgIdx: reentryIdx,
        _prevQuoteSummary: prevQuoteSummary,
        _prevAddress: prevInfo?.address ?? null,
      } as unknown as import("@/lib/ai/phases").CollectedInfo);
      console.log(`[Webhook] 재인입: 주소 보존(${prevInfo?.address ?? "없음"}), 견적 보존 (수동 초기화 대기), 메시지 경계=${reentryIdx} (${originalPhase} → phase_2)`);
    }
  }

  // 4.5. 기본정보 버튼 처리 (Phase 2, 3에서만) — 버튼 전송 시 AI 응답 생략 — 서비스 지역 외이면 건너뜀
  if (!outOfServiceArea && (currentPhase === Phase.PHASE_2_COLLECT || currentPhase === Phase.PHASE_3_SPEC)) {
    const basicInfoSent = await handleBasicInfoButtons(sessionId, userKey, senderKey, userMessage, autoSentBy);
    if (basicInfoSent) {
      return;
    }
  }
  } // end if (!fastPathCompleted)

  // ★ 공통: AI 응답 생성에 필요한 최신 데이터 조회
  const updatedConv = await conversationStore.getById(sessionId);
  const collectedInfo = updatedConv?.collectedInfo ?? conv?.collectedInfo ?? {
    address: null, district: null, floor: null, elevator: null, parking: null,
    items: [], special_notes: [], photos: [],
  };
  const outOfServiceArea = isOutOfServiceArea(updatedConv?.collectedInfo?.address ?? null);

  // ★ Phase 4 고정 견적 템플릿 (AI 호출 없이 직접 전송)
  const justEnteredPhase4 = currentPhase === Phase.PHASE_4_QUOTE && originalPhase !== Phase.PHASE_4_QUOTE;
  const hasValidQuote = (updatedConv?.quote?.items?.length ?? 0) > 0 && (updatedConv?.quote?.totalPrice ?? 0) > 0;

  if (justEnteredPhase4 && hasValidQuote) {
    const quote = updatedConv!.quote!;
    const hasLadder = (quote.ladderFee ?? 0) > 0;
    const priceLabel = hasLadder ? "(사다리차/부가세 포함)" : "(부가세 포함)";
    const quoteTemplate = `고객님, 기다려주셔서 감사합니다.\n전달해 주신 내용에 따라 예상 견적 안내해 드립니다!\n\n견적: ${quote.totalPrice.toLocaleString()}원 ${priceLabel}\n* 내용물이 비워지지 않으면 추가 비용이 발생할 수 있으며, 함께 수거가 필요한 품목이 있으시면 말씀 부탁드립니다.\n\n수거를 희망하시면 예약 확정 도와드리겠습니다.\n추가로 궁금하신 점이 있으시다면 언제든지 말씀 주세요 : )`;

    await conversationStore.updateDraft(sessionId, quoteTemplate);

    const isAutoMode = await getAutoMode();
    if (isAutoMode) {
      const latestConv = await conversationStore.getById(sessionId);
      const latestMessages = latestConv?.messages ?? [];
      const lastUserIdx = [...latestMessages].reverse().findIndex((m) => m.role === "user" && m.content === userMessage);
      const hasExistingReply = lastUserIdx >= 0 && lastUserIdx > 0;

      if (!hasExistingReply) {
        // ★ 메시지 저장을 먼저 수행 (send 실패와 무관하게 대화 히스토리 보존)
        await conversationStore.addAssistantMessage(sessionId, quoteTemplate, autoSentBy);
        await saveSessionHistory(userKey, sessionId, userMessage, quoteTemplate);
        // ★ 견적 실제 발송 성공 후에만 status → quote_sent_nudge
        try {
          await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: quoteTemplate });
          await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
          await markQuoteSent(sessionId);
          console.log(`[Webhook] 견적 고정 템플릿 전송: ${sessionId} (${quote.totalPrice.toLocaleString()}원)`);
        } catch (err) {
          console.error("[Webhook] 견적 템플릿 전송 실패 (메시지는 DB에 저장됨):", err);
        }
      }
    }

    // ★ 같은 메시지에 예약 의사가 있으면 Phase 추가 진행 (Phase 4→6→7)
    const bookingKw = ["예약", "접수", "신청", "진행할게", "진행해주", "예약할게", "예약해주"];
    const hasBookingIntentInMsg = bookingKw.some(kw => userMessage.includes(kw));
    const hasPersonalInfoInMsg = /\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/.test(userMessage);
    if (hasBookingIntentInMsg || hasPersonalInfoInMsg) {
      await updatePhaseWithStatus(sessionId, Phase.PHASE_6_BOOKING, "고객 예약 의사 (견적 안내와 동시)", "auto");
      console.log(`[Webhook] Phase 4 + 예약의사 동시 감지 → phase_6`);
      // 예약 정보 완성 여부 확인 → Phase 7
      const bConv = await conversationStore.getById(sessionId);
      if (checkBookingInfoComplete(bConv ?? null, bConv?.messages ?? [])) {
        await updatePhaseWithStatus(sessionId, Phase.PHASE_7_CONFIRM, "예약 정보 완성", "auto");
        console.log(`[Webhook] Phase 6 → phase_7 (예약 정보 완성)`);
      }
    }

    return;
  }

  // ★ Phase 8 고정 예약확정 템플릿 (Phase 7→8 전환 시 AI 호출 없이 직접 전송)
  const justEnteredPhase8 = currentPhase === Phase.PHASE_8_POST &&
    (originalPhase === Phase.PHASE_7_CONFIRM || preTransitionPhase === Phase.PHASE_7_CONFIRM);

  if (justEnteredPhase8) {
    const bookingConfirmTemplate = `말씀해 주신 날짜와 주소로 수거 예약 완료 되었습니다!\n\n{{결제정보}}\n\n혹시 수거 관련하여 변동 사항이 있으신 경우, 수거 24시간 전까지만 말씀해 주세요.\n깔끔한 수거로 찾아뵙겠습니다!\n\n감사합니다 : )`;

    // ★ 자동/수동 모두: draft만 설정 + 관리자 확인 필요 상태로 전환
    // 관리자가 예약 정보 확인/수정 후 전송 버튼을 눌러야 예약 생성 + 메시지 발송
    await conversationStore.updateDraft(sessionId, bookingConfirmTemplate);
    await conversationStore.updateStatus(sessionId, "needs_check");

    // ★ 예약 확정 시 상담 메모 자동 요약
    const bookedConv = await conversationStore.getById(sessionId);
    if (bookedConv && bookedConv.messages.length >= 2) {
      generateMemoSummary(bookedConv.messages.map((m) => ({ role: m.role, content: m.content })))
        .then((summary) => { if (summary) conversationStore.updateMemo(sessionId, summary); })
        .catch((err) => console.error("[Webhook] 메모 요약 오류:", err));
    }

    console.log(`[Webhook] 예약확정 대기 (관리자 확인 필요): ${sessionId}`);
    return;
  }

  // 5. 견적 컨텍스트 구성 + 자동모드 확인
  const quoteContext = buildQuoteContext(updatedConv?.quote ?? null);
  const isAutoMode = await getAutoMode();

  // 5-1. Phase 8/CLOSED에서 인사/감사 메시지 → AI 초안 생략 + unread 리셋
  const FAREWELL_KEYWORDS = [
    "감사", "고맙", "수고", "좋은 하루", "좋은하루", "안녕히",
    "네 알겠", "넵 알겠", "네 감사", "넵 감사", "네!", "넵!",
    "잘 부탁", "수고하세요", "고마워", "땡큐", "ㄱㅅ", "ㅇㅋ",
  ];
  const FAREWELL_ONLY_PATTERN = /^[\s\n]*(?:네|넵|넹|ㅇㅇ|ㅋ|ㅎ|감사합니다|감사해요|고맙습니다|수고하세요|좋은 ?하루|알겠습니다|알겠어요|오케이|ok|고마워요|네!|넵!|ㅇㅋ)[.!~♡ㅎㅋ\s]*$/i;
  if (
    (currentPhase === Phase.PHASE_8_POST || currentPhase === Phase.CLOSED) &&
    (FAREWELL_KEYWORDS.some((kw) => userMessage.includes(kw)) || FAREWELL_ONLY_PATTERN.test(userMessage))
  ) {
    // unread 리셋 (인사 메시지는 확인 불필요)
    await conversationStore.markRead(sessionId);
    console.log(`[Webhook] Phase 8/CLOSED 인사 메시지 → AI 초안 생략, unread 리셋: ${sessionId}`);
    return;
  }

  // 6. Phase-aware AI 응답 생성 (intent 분류 통합 — Haiku 1회 절감)
  let intent: "AUTO_REPLY" | "NEED_HUMAN" | "CANCEL" = "AUTO_REPLY";
  let aiDraft: string | null = null;
  try {
    const aiResult = await generateAIResponse(
      userMessage, history, undefined, quoteContext,
      currentPhase, collectedInfo, isAutoMode, outOfServiceArea,
      wfConfig as unknown as Record<string, unknown>
    );
    intent = aiResult.intent;
    aiDraft = extractMessage(aiResult.response);
  } catch {
    console.error("[Webhook] generateAIResponse 실패");
  }

  const needsHuman = intent === "NEED_HUMAN";

  // 7. AI 초안 업데이트
  if (aiDraft) {
    await conversationStore.updateDraft(sessionId, aiDraft);
  }

  // 8. 의도별 상태 처리
  // ★ AI intent가 CANCEL을 놓칠 수 있으므로 키워드 기반 폴백 추가
  const NEGATIVE_KEYWORDS = /비싸|비쌉|비쌀|안할[게래겠]|안 ?할[게래겠]|됐습니다|안 ?해도|다른 ?곳|알아볼|안하겠|거절|필요 ?없|관둘|그만|포기|안할래/;
  if (intent === "AUTO_REPLY" && NEGATIVE_KEYWORDS.test(userMessage)) {
    const convForCheck = await conversationStore.getById(sessionId);
    const hasSentQuote = !!convForCheck?.quote?.sentAt;
    if (hasSentQuote) {
      intent = "CANCEL";
      console.log(`[Webhook] 키워드 기반 CANCEL 폴백: "${userMessage}" → quote_sent_no_nudge`);
    }
  }

  if (intent === "CANCEL") {
    // 견적 전송 후 어떤 Phase에 있든 부정적 고객은 넛지 제외
    const convForCancel = await conversationStore.getById(sessionId);
    if (convForCancel?.status === "quote_sent_nudge") {
      await conversationStore.updateStatus(sessionId, "quote_sent_no_nudge");
    }
  } else if (needsHuman) {
    await conversationStore.updateStatus(sessionId, "needs_check");
  }

  if (!aiDraft) {
    await conversationStore.updateStatus(sessionId, "needs_check");
  }

  // 9. Post-transition loop: AI 응답 후 다단계 Phase 전환 (Phase 4→6→7→8 등)
  const postConv = await conversationStore.getById(sessionId);
  let loopPhase = postConv?.currentPhase ?? currentPhase;
  const postCollectedInfo = postConv?.collectedInfo ?? collectedInfo;
  const postHasQuote = (postConv?.quote?.items?.length ?? 0) > 0;
  const postMessages = (postConv?.messages ?? allMessages).map((m) => ({ role: m.role, content: m.content }));

  for (let hop = 0; hop < 4; hop++) {
    const loopBookingInfo = loopPhase === Phase.PHASE_6_BOOKING
      ? checkBookingInfoComplete(postConv ?? null, postConv?.messages ?? allMessages)
      : false;

    const loopTransition = checkPhaseTransition(
      loopPhase, postCollectedInfo, postHasQuote, userMessage, "text",
      postMessages, loopBookingInfo, phaseOptions
    );

    if (!loopTransition || loopTransition.nextPhase === preTransitionPhase) break;
    await updatePhaseWithStatus(sessionId, loopTransition.nextPhase, loopTransition.reason, "auto");
    console.log(`[Webhook] Post-transition hop ${hop + 1}: ${loopPhase} → ${loopTransition.nextPhase} (${loopTransition.reason})`);

    // ★ Phase 8 진입 시: 어떤 경로든 관리자 확인 대기 (자동 예약 생성 안 함)
    if (loopTransition.nextPhase === Phase.PHASE_8_POST && loopPhase !== Phase.PHASE_3_1_MODIFY) {
      const bookingConfirmTpl = `말씀해 주신 날짜와 주소로 수거 예약 완료 되었습니다!\n\n{{결제정보}}\n\n혹시 수거 관련하여 변동 사항이 있으신 경우, 수거 24시간 전까지만 말씀해 주세요.\n깔끔한 수거로 찾아뵙겠습니다!\n\n감사합니다 : )`;
      aiDraft = null; // 자동 전송 방지 — 관리자가 확인 후 전송
      await conversationStore.updateDraft(sessionId, bookingConfirmTpl);
      await conversationStore.updateStatus(sessionId, "needs_check");
      // ★ 예약 확정 시 상담 메모 자동 요약
      const loopBookedConv = await conversationStore.getById(sessionId);
      if (loopBookedConv && loopBookedConv.messages.length >= 2) {
        generateMemoSummary(loopBookedConv.messages.map((m) => ({ role: m.role, content: m.content })))
          .then((summary) => { if (summary) conversationStore.updateMemo(sessionId, summary); })
          .catch((err) => console.error("[Webhook] 메모 요약 오류:", err));
      }
      console.log(`[Webhook] Post-loop: 예약확정 대기 (관리자 확인 필요) (${loopPhase}→8)`);
    }
    // 취소로 CLOSED 진입 시 cancelled 상태 설정
    if (loopTransition.nextPhase === Phase.CLOSED && loopTransition.reason.includes("취소")) {
      await conversationStore.updateStatus(sessionId, "cancelled");
    }
    // 재인입(CLOSED/Phase 5 → Phase 2): 견적 보존 (관리자 수동 초기화)
    if (loopTransition.nextPhase === Phase.PHASE_2_COLLECT &&
        (loopPhase === Phase.CLOSED || loopPhase === Phase.PHASE_5_NUDGE)) {
      console.log(`[Webhook] 재인입: 견적 보존 (수동 초기화 대기) (${loopPhase} → phase_2)`);
    }

    loopPhase = loopTransition.nextPhase;
  }

  // 10. 자동상담 모드 (DB 설정 기반) — 완전 자동: needsHuman 무관하게 모두 전송
  if (isAutoMode && aiDraft) {
    // 중복 전송 방지: 현재 user 메시지 이후에 이미 assistant 메시지가 있으면 스킵
    // (다른 processTextMessage 인스턴스가 이미 응답한 경우)
    // postConv 재사용 (추가 getById 생략)
    const latestMessages = postConv?.messages ?? [];
    const lastUserIdx = [...latestMessages].reverse().findIndex((m) => m.role === "user" && m.content === userMessage);
    const hasExistingReply = lastUserIdx >= 0 && lastUserIdx > 0; // user 뒤에 assistant가 있음

    if (hasExistingReply) {
      console.log(`[Webhook] 자동상담 중복 전송 방지: ${sessionId}`);
    } else {
      // ★ 메시지 저장을 먼저 수행 (send 실패와 무관하게 대화 히스토리 보존)
      await conversationStore.addAssistantMessage(sessionId, aiDraft, autoSentBy);
      await saveSessionHistory(userKey, sessionId, userMessage, aiDraft);
      try {
        await sendPlainMessage({ user_key: userKey, sender_key: senderKey, message: aiDraft });
        console.log(`[Webhook] 자동상담 전송: ${sessionId} (intent: ${intent})`);
      } catch (err) {
        console.error("[Webhook] 자동상담 전송 실패 (메시지는 DB에 저장됨):", err);
      }
    }
  }

}


