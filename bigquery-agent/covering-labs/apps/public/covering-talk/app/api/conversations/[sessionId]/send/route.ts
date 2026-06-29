import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { sendSplitMessage } from "@/lib/happytalk/send-message";
import { sendImageMessage } from "@/lib/happytalk/client";
import { saveSessionHistory } from "@/lib/session/store";
import { extractBookingDateTime, formatTimeSlotKor } from "@/lib/utils/booking-datetime";
import { Phase } from "@/lib/ai/phases";
import { getCurrentUser } from "@/lib/auth/session";
import { orderStore } from "@/lib/store/orders";
import { sendToCovering } from "@/lib/covering/client";
import { supabase } from "@/lib/supabase/client";
import { auditStore } from "@/lib/store/audit-logs";
import { getPrepaymentEnabled } from "@/lib/store/app-settings";
import { issuePrepaymentLink } from "@/lib/payments/issue-prepayment-link";

const BOOKING_CONFIRM_SIGNATURE = "날짜와 주소로 수거 예약 완료 되었습니다";
const PREPAYMENT_PLACEHOLDER = "{{결제정보}}";

// 예약확정 메시지의 {{결제정보}} placeholder 를 결제 금액·링크 블록으로 치환.
//   block 비어있으면 placeholder 와 그 주변 공백 줄을 제거 (feature flag OFF / 발급 실패).
//   AI 가 placeholder 를 빠뜨린 경우 fallback: "감사합니다" 직전 또는 메시지 끝에 block 부착.
function substitutePrepaymentBlock(text: string, block: string): string {
  if (text.includes(PREPAYMENT_PLACEHOLDER)) {
    if (block) return text.replace(PREPAYMENT_PLACEHOLDER, block);
    // 빈 치환: placeholder 와 인접 빈 줄을 함께 제거
    return text.replace(/\n*\{\{결제정보\}\}\n*/, "\n\n");
  }
  if (!block) return text;
  // placeholder 누락 — "감사합니다" 직전 또는 끝에 부착
  const closingIdx = text.lastIndexOf("감사합니다");
  if (closingIdx >= 0) {
    return text.slice(0, closingIdx).trimEnd() + "\n\n" + block + "\n\n" + text.slice(closingIdx);
  }
  return text.trimEnd() + "\n\n" + block;
}

// [CS-EXT-011] 고객에게 메시지 발송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const conv = await conversationStore.getById(sessionId);

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const body = await request.json();
  const message: string = body.message;

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const editedBeforeSend = message.trim() !== conv.aiDraft?.trim();

  if (!conv.userKey || !conv.senderKey) {
    console.error("[send] userKey 또는 senderKey 누락:", { userKey: conv.userKey, senderKey: conv.senderKey, sessionId });
    return NextResponse.json({ error: `발송 키 누락 (userKey: ${conv.userKey ? "있음" : "없음"}, senderKey: ${conv.senderKey ? "있음" : "없음"})` }, { status: 400 });
  }

  // §6.1 — 예약확정 메시지에 결제링크 inline 임베드.
  //   sendSplitMessage 호출 전 처리되어야 메시지에 결제 정보가 포함된 상태로 발송됨.
  //   feature flag(prepayment_enabled) OFF 면 placeholder 제거만.
  //   ON + 발급 실패 시: 결제 정보 없는 메시지가 고객에게 가지 않도록 500 반환 → 사용자 재시도 유도.
  const isBookingMessage = message.includes(BOOKING_CONFIRM_SIGNATURE);
  let messageToSend = message;
  let linkFailReason: string | null = null;
  if (isBookingMessage) {
    try {
      const prepaymentEnabled = await getPrepaymentEnabled();
      if (prepaymentEnabled) {
        const prep = await prepareBookingOrderForPrepayment(sessionId, conv);
        if (!prep) {
          linkFailReason = "주문 생성 실패";
        } else {
          // 이미 발송된 링크가 있으면 재사용, 없으면 신규 발급
          const lastPay = prep.paymentIds?.[prep.paymentIds.length - 1];
          let payShortUrl: string | null = null;
          let amount = prep.totalPrice;
          if (lastPay?.reqId) {
            const { nicepayPayUrl } = await import("@/lib/nicepay/client");
            payShortUrl = nicepayPayUrl(lastPay.reqId);
          } else {
            const linkResult = await issuePrepaymentLink(prep, { sendNotification: false });
            if (linkResult.success && linkResult.payShortUrl) {
              payShortUrl = linkResult.payShortUrl;
              amount = linkResult.amount ?? amount;
            } else {
              linkFailReason = linkResult.reason || "결제 링크 발급 실패";
            }
          }
          if (payShortUrl && amount > 0) {
            const block = [
              `결제 금액: ${amount.toLocaleString("ko-KR")}원`,
              `결제 링크: ${payShortUrl}`,
              ``,
              `방문 12시간 전까지 결제가 완료되지 않으면 예약이 자동 취소되니, 꼭 시간 내 결제 부탁드려요 :)`,
            ].join("\n");
            messageToSend = substitutePrepaymentBlock(message, block);
          } else if (!linkFailReason && payShortUrl) {
            // payShortUrl 있는데 amount<=0 (totalPrice 0 인 케이스) — 발생 가능성 낮음.
            linkFailReason = "결제 금액 0원";
          }
        }
      } else {
        // feature flag OFF — placeholder 만 제거하고 OLD 흐름과 동일하게 전송 허용.
        messageToSend = substitutePrepaymentBlock(message, "");
      }
    } catch (err) {
      console.error("[send] 선결제 inline 처리 실패:", err);
      linkFailReason = err instanceof Error ? err.message : String(err);
    }
  }

  // 예약확정 메시지인데 결제 링크 발급 실패 시 → 메시지 발송 차단 (결제 정보 없는 메시지가 고객에게 가지 않게)
  //   사용자에게 500 반환 → 재시도 안내. 주문은 이미 생성됐으니 retry 시 helper 가 재사용 후 link 재발급 시도.
  if (linkFailReason) {
    return NextResponse.json(
      {
        error: `선결제 링크 발급 실패: ${linkFailReason}. 메시지가 발송되지 않았습니다. 잠시 후 다시 시도해주세요.`,
        retry: true,
      },
      { status: 500 },
    );
  }

  try {
    await sendSplitMessage({
      user_key: conv.userKey,
      sender_key: conv.senderKey,
      message: messageToSend,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // 고객이 채팅방을 나간 경우 (세션 만료) → 자동 상담종료 처리
    if (errMsg.includes("InvalidSessionException") || errMsg.includes("-502")) {
      console.log("[send] 세션 만료 → 상담종료 처리:", sessionId);
      await conversationStore.updateStatus(sessionId, "completed");
      await conversationStore.updatePhase(sessionId, Phase.CLOSED, "고객 세션 만료", "auto");
      await conversationStore.addAssistantMessage(sessionId, "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.", "시스템", false);
      return NextResponse.json({
        status: "session_expired",
        message: "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.",
      });
    }

    console.error("[send] 해피톡 발송 실패:", errMsg, err);
    return NextResponse.json({ error: `메시지 발송 실패: ${errMsg}` }, { status: 500 });
  }

  // ─────────────────────────────────────────────
  // 이 시점부터는 해피톡 발송이 이미 성공한 상태.
  //   즉시 필요한 작업 (chat log 기록, 담당 배정) 만 sync. 나머지(이미지·order·covering·
  //   audit·세션 히스토리) 는 after() 로 background — 모달이 즉시 응답받도록.
  //   실패는 로깅만, 클라이언트는 이미 200 받음.
  // ─────────────────────────────────────────────
  // 로그인 상담사 이름 사용
  const currentUser = await getCurrentUser();
  const senderName = currentUser?.name ?? "상담사";

  // 메시지 추가 — 실제 발송된(placeholder 치환 후) 내용을 기록 (UI 즉시 반영용 sync)
  try {
    await conversationStore.addAssistantMessage(
      sessionId,
      messageToSend,
      senderName,
      editedBeforeSend,
      undefined,
      undefined,
    );
    if (!conv.assignee && currentUser) {
      await conversationStore.updateAssignee(sessionId, currentUser.name);
    }
  } catch (e) {
    console.error("[send] sync 후처리 실패 (계속 진행):", e);
  }

  // 견적/야간수거/오인입 status 전환은 sync — 가벼운 DB write 하나라 응답 차원에 포함시켜
  //   사이드패널 status pill 이 즉시 갱신되도록 (after() 안에 두면 polling 5s 후 보임).
  try {
    const hasQuotePriceInMessage = /\d{1,3}(,\d{3})*\s*원/.test(message) || /견적\s*[:：]/.test(message);
    if (hasQuotePriceInMessage) {
      if (
        (conv.status === "pending" || conv.status === "needs_check") &&
        (conv.currentPhase === Phase.PHASE_4_QUOTE || conv.currentPhase === Phase.PHASE_5_NUDGE) &&
        (conv.quote?.items?.length ?? 0) > 0
      ) {
        await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
        if (conv.quote && !conv.quote.sentAt) {
          await conversationStore.updateQuote(sessionId, { ...conv.quote, sentAt: Date.now() });
        }
      }
    }
    const isNightPickupMsg = /커버링\s*(앱|어플|어플리케이션)/.test(message)
      && /80L|220L|봉투\s*구매|생활쓰레기|대형폐기물/.test(message);
    if (isNightPickupMsg) {
      await conversationStore.updateStatus(sessionId, "night_pickup");
    }
    const isWrongInboundMsg = /커버링\s*(서비스|앱|어플).*이용.*문의/.test(message)
      || (/1:1\s*문의/.test(message) && /방문수거.*다르게|기존\s*커버링\s*수거/.test(message));
    if (isWrongInboundMsg) {
      await conversationStore.updateStatus(sessionId, "wrong_inbound");
    }
  } catch (statusErr) {
    console.error("[send] status 즉시 전환 실패 (after 블록에서 재시도됨):", statusErr);
  }

  after(async () => {
  try {

  // 견적 메시지 감지 → sentAt 자동 세팅 (상담사가 직접 견적을 타이핑해서 보낸 경우)
  const QUOTE_SIGNATURES = ["견적:", "부가세 포함"];
  const isQuoteMessage = QUOTE_SIGNATURES.every((sig) => message.includes(sig));
  if (isQuoteMessage && conv.quote && !conv.quote.sentAt) {
    await conversationStore.updateQuote(sessionId, { ...conv.quote, sentAt: Date.now() });
    console.log(`[send] 견적 발송 감지 → sentAt 자동 세팅: ${sessionId}`);
  }

  // 예약 확정 메시지 감지 → 상태를 "booked"로 변경 + 예약 정보 추출
  // 고정 예약확정 템플릿의 핵심 문구로 정확히 판별 — 느슨한 키워드 매칭은 견적 안내를 오인함
  // Phase 제한 없음: 상담사가 어떤 Phase에서든 수동으로 #예약확정 가능 (확인 모달이 guardrail)
  const BOOKING_CONFIRM_SIGNATURE = "날짜와 주소로 수거 예약 완료 되었습니다";
  const isBookingMessage = message.includes(BOOKING_CONFIRM_SIGNATURE);

  if (isBookingMessage) {
    // 방문수거 가이드 이미지 자동 전송
    try {
      const BOOKING_GUIDE_IMAGE_URL =
        "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/guide/booking_guide.png";
      const API_HOST = process.env.HAPPYTALK_API_HOST;
      const imgRes = await fetch(BOOKING_GUIDE_IMAGE_URL);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        const file = new File([blob], "booking_guide.png", { type: "image/png" });
        const htFormData = new FormData();
        htFormData.append("sender_key", conv.senderKey);
        htFormData.append("image", file);
        const uploadRes = await fetch(
          `${API_HOST}/kakaoWebhook/v3/bzc/image/upload`,
          {
            method: "POST",
            headers: {
              "HT-Client-Id": process.env.HT_CLIENT_ID!,
              "HT-Client-Secret": process.env.HT_CLIENT_SECRET!,
            },
            body: htFormData,
          }
        );
        const uploadResult = await uploadRes.json();
        if (uploadResult.code === "0000" && uploadResult.image) {
          await sendImageMessage({
            user_key: conv.userKey,
            sender_key: conv.senderKey,
            imageUrl: uploadResult.image,
          });
          await conversationStore.addAssistantMessage(sessionId, "[방문 전 안내사항]", senderName, false, "image", BOOKING_GUIDE_IMAGE_URL);
          console.log(`[send] 방문수거 가이드 이미지 자동 전송: ${sessionId}`);
        }
      }
    } catch (guideErr) {
      console.error("[send] 방문수거 가이드 이미지 전송 실패:", guideErr);
    }

    // status 업데이트 (이미 booked여도 idempotent)
    if (conv.status !== "booked" && conv.status !== "completed") {
      await conversationStore.updateStatus(sessionId, "booked");
    }

    // Phase 7→8 자동 전환 (예약 확정 메시지 전송 시)
    // 어떤 Phase에서든 예약 확정 시 Phase 8로 전환
    if (conv.currentPhase !== Phase.PHASE_8_POST) {
      await conversationStore.updatePhase(sessionId, Phase.PHASE_8_POST, "예약 확정 메시지 전송", "auto");
      console.log(`[send] Phase 전환: ${conv.currentPhase} → phase_8 (예약 확정 메시지 전송)`);
    }

    // 활성 주문이 이미 있으면 스킵 — orders 테이블이 단일 진본
    const existingOrderForSend = await orderStore.getBySessionId(sessionId);
    const hasActiveOrderForSend = existingOrderForSend
      && (existingOrderForSend.status === "confirmed"
        || existingOrderForSend.status === "payment_requested"
        || existingOrderForSend.status === "prepaid");

    if (hasActiveOrderForSend && existingOrderForSend) {
      console.log(`[send] orders 이미 존재 (활성): ${sessionId}`);
      // 기존 order가 있지만 커버링 미발송인 경우 발송
      // Order에는 adminMemo가 없으므로 memo 필드에 "[커버링: <id>]" 프리픽스로 보존
      if (!existingOrderForSend.memo?.includes("[커버링:")) {
        try {
          const { data: photoMsgs } = await supabase
            .from("messages").select("image_url")
            .eq("session_id", sessionId)
            .not("image_url", "is", null)
            .order("created_at", { ascending: true });
          const photos = (photoMsgs ?? []).map((m) => m.image_url as string).filter(Boolean);
          const orderForCovering = photos.length > 0
            ? { ...existingOrderForSend, photos }
            : existingOrderForSend;

          const coveringResult = await sendToCovering(orderForCovering);
          if (coveringResult) {
            const newMemo = existingOrderForSend.memo
              ? `${existingOrderForSend.memo} [커버링: ${coveringResult.id}]`
              : `[커버링: ${coveringResult.id}]`;
            await orderStore.update(existingOrderForSend.id, { memo: newMemo });
            console.log(`[send] 기존 order 커버링 발송: ${sessionId} → ${coveringResult.id}`);
          }
        } catch (coveringErr) {
          console.error("[send] 기존 order 커버링 발송 오류:", coveringErr);
        }
      }
    } else {
      const quoteItems = conv.quote?.items?.map((item) => ({
        category: item.category,
        name: item.name,
        displayName: `${item.category} - ${item.name}`,
        price: item.unitPrice,
        quantity: item.quantity,
        loadingCube: item.volumeM3,
      })) || [];
      const totalLoadingCube = quoteItems.reduce((sum, i) => sum + (i.loadingCube || 0) * i.quantity, 0);

      // 대화에서 날짜/시간 추출 — 뒤에서부터 순회하여 가장 마지막에 언급된 날짜/시간 사용
      // (대화 중 일정 변경이 있을 경우 최종 일정이 반영되도록)
      // range(timeEnd 있음) 우선 — 마지막 메시지에 단일 시각만 있고 그 위에 range가 있으면 range 채택.
      // ABC 시간안내 자동 메시지(`수거 가능한 시간대입니다` / `접수해드렸습니다`)는 운영시간을
      //   range 형태로 적어 보내므로 잘못 잡히지 않도록 스킵 (MessageInput.tsx 와 동일 패턴).
      let extractedDate = "";
      let extractedTime = "";
      let extractedTimeEnd = "";
      let singleTimeFallback = "";
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        const msg = conv.messages[i];
        const content = msg.content;
        if (/수거 가능한 시간대입니다/.test(content)) continue;
        if (/접수해드렸습니다 :\) 담당자가 최종 확인/.test(content)) continue;
        const extracted = extractBookingDateTime(content);
        if (!extractedDate && extracted.date) extractedDate = extracted.date;
        if (!extractedTimeEnd && extracted.timeEnd) {
          extractedTime = extracted.time;
          extractedTimeEnd = extracted.timeEnd;
        } else if (!singleTimeFallback && extracted.time) {
          singleTimeFallback = extracted.time;
        }
        if (extractedDate && extractedTimeEnd) break;
      }
      if (!extractedTime) extractedTime = singleTimeFallback;
      // 텍스트에서 못 뽑았으면 collectedInfo / booking 으로 폴백 — ABC 시간안내 버튼만 클릭한 케이스 방어.
      // (메시지에 날짜 텍스트가 없어도 AI 가 추출했거나 고객이 버튼으로 선택한 값이 collectedInfo 에 들어있음)
      if (!extractedDate || extractedDate === "미정") {
        const ci = conv.collectedInfo as { requestedDate?: string | null; selectedDate?: string | null } | null;
        const fallback = ci?.requestedDate || ci?.selectedDate || conv.booking?.preferredDate || "";
        if (fallback) extractedDate = fallback;
      }

      // 시간 범위가 있으면 "14:00~16:00" 형식으로 결합 후 한국어("오후 2:00~오후 4:00") 로 변환.
      // 운영 화면은 한국어 자연어 형식이라 24시간 그대로 저장하면 운영자 화면이 갑자기 바뀜.
      const timeSlotRaw = extractedTime && extractedTime !== "미정"
        ? (extractedTimeEnd ? `${extractedTime}~${extractedTimeEnd}` : extractedTime)
        : (conv.booking?.preferredTime || "");
      const timeSlotStr = formatTimeSlotKor(timeSlotRaw);

      // orders 테이블 자동 생성
      let createdOrderId: string | null = null;
      try {
        const orderItems = quoteItems.map((item) => ({
          ...item,
          volume: item.loadingCube || 0,
        }));
        const createdOrder = await orderStore.create({
          sessionId,
          status: "confirmed",
          customerName: conv.name || "",
          phone: conv.phone || "",
          address: conv.collectedInfo?.address || "",
          date: extractedDate !== "미정" ? extractedDate : "",
          timeSlot: timeSlotStr,
          floor: conv.collectedInfo?.floor ?? null,
          hasElevator: conv.collectedInfo?.elevator ?? false,
          hasParking: conv.collectedInfo?.parking ?? false,
          hasGroundAccess: true,
          needLadder: false,
          ladderFee: conv.quote?.ladderFee || 0,
          crewSize: conv.quote?.workerCount || 1,
          items: orderItems,
          totalVolume: Math.round(totalLoadingCube * 1000) / 1000,
          totalPrice: conv.quote?.totalPrice || 0,
          // 1단계 강화 — collected_info.special_notes 가 있으면 그대로 memo 로 사용 (LLM 보정 단계 제거)
          memo: (conv.collectedInfo?.special_notes ?? []).join(", "),
          photos: [],
        });
        console.log(`[send] orders 테이블 저장 완료: ${sessionId}`);
        if (createdOrder) {
          createdOrderId = createdOrder.id;
          // 빈 필드 감지 — C안(LLM 보정 제거) 후 운영자가 즉시 인지하도록 audit + console.warn 양쪽에 표시
          const missing: string[] = [];
          if (!conv.name) missing.push("성함");
          if (!conv.phone) missing.push("연락처");
          if (!conv.collectedInfo?.address) missing.push("주소");
          if (!extractedDate || extractedDate === "미정") missing.push("날짜");
          if (!timeSlotStr) missing.push("시간대");
          if (!(conv.quote?.totalPrice)) missing.push("견적금액");
          const warnTag = missing.length > 0 ? ` [⚠ 누락: ${missing.join("/")}]` : "";
          if (missing.length > 0) {
            console.warn(`[send] orders 자동생성 빈 필드 ${sessionId}:`, missing.join(", "));
          }
          await auditStore.log({
            entityType: "order", entityId: createdOrder.id, action: "create",
            changes: { created: { old: null, new: { orderNumber: createdOrder.orderNumber, customerName: conv.name, date: extractedDate } } },
            description: `주문 생성 (자동 - 예약확정 메시지): ${conv.name || ""} ${extractedDate || ""}${warnTag}`,
            userId: 0, userName: "AI(예약확정)",
          });
        }
      } catch (ordersErr) {
        console.error("[send] orders 테이블 저장 오류:", ordersErr);
      }

      // conversations.booking 필드도 업데이트 (dashboard 전환 카운트용)
      try {
        await conversationStore.updateBooking(sessionId, {
          customerName: conv.name || "",
          phone: conv.phone || "",
          address: conv.collectedInfo?.address || "",
          floor: conv.collectedInfo?.floor || 0,
          hasElevator: conv.collectedInfo?.elevator ?? false,
          hasParking: conv.collectedInfo?.parking ?? false,
          ladderNeeded: false,
          // 빈 하드코딩 회귀 방지 — 실제 추출/폴백된 값으로 보존 (없으면 기존 booking 값 유지)
          preferredDate: extractedDate || conv.booking?.preferredDate || "",
          preferredTime: timeSlotStr || conv.booking?.preferredTime || "",
          confirmedAt: Date.now(),
          reminderSentAt: null,
          specialNotes: (conv.collectedInfo?.special_notes ?? []).join(", "),
        });
      } catch { /* conversations.booking 업데이트 실패해도 계속 진행 */ }

      // Covering DB에 자동 발송 (방금 생성된 order 기반)
      try {
        const newOrder = createdOrderId
          ? await orderStore.getById(createdOrderId)
          : await orderStore.getBySessionId(sessionId);
        if (newOrder) {
          const { data: photoMsgs } = await supabase
            .from("messages").select("image_url")
            .eq("session_id", sessionId)
            .not("image_url", "is", null)
            .order("created_at", { ascending: true });
          const photos = (photoMsgs ?? []).map((m) => m.image_url as string).filter(Boolean);

          // orders 테이블에 사진 저장
          if (photos.length > 0) {
            try {
              await orderStore.update(newOrder.id, { photos });
              newOrder.photos = photos;
              console.log(`[send] orders 사진 ${photos.length}장 저장: ${sessionId}`);
            } catch { /* 사진 저장 실패해도 계속 진행 */ }
          }

          const coveringResult = await sendToCovering(newOrder);
          if (coveringResult) {
            // Order에는 adminMemo가 없으므로 memo 필드에 covering ID를 보존
            const memoWithCovering = newOrder.memo
              ? `${newOrder.memo} [커버링: ${coveringResult.id}]`
              : `[커버링: ${coveringResult.id}]`;
            await orderStore.update(newOrder.id, { memo: memoWithCovering });
            console.log(`[send] Covering 자동 발송: ${sessionId} → ${coveringResult.id}`);
          }
        }
      } catch (coveringErr) {
        console.error("[send] Covering 자동 발송 오류:", coveringErr);
      }
    } // end else (hasActiveOrderForSend)

    // 유입 채널 4-버튼 설문 (orders.channel) 은 referrer 자동 추적 도입 후 제거됨 (2026-05-06).
    // conversations.referrer (해피톡 reference webhook) 가 새 단일 진본.

    // [C안 적용] 기존엔 발송 후 백그라운드에서 LLM(extractBookingInfo) 으로 예약 정보 재추출 →
    //   conversation.booking + orders 를 다시 update 했음. 이 흐름이 강소현 사례처럼
    //   LLM 이 일부 필드를 빈 값으로 반환할 때 정상 데이터를 덮어쓰는 회귀 발생.
    //   1단계(orderStore.create + updateBooking) 가 conv.quote / collected_info / extractBookingDateTime
    //   으로 충분한 정보를 채우므로 LLM 보정 단계 전체를 제거하고 1단계만 유지한다.
  }
  // ── 상담사 메시지 기반 Phase 자동 추적 ──
  // 상담사가 수동으로 대화를 진행할 때 Phase가 맥락을 따라가도록 함
  else {
    const phase = conv.currentPhase as Phase;

    // 성함/연락처 요청 → Phase 6 (예약 접수)
    const askingBookingInfo = /성함|연락처|전화번호|핸드폰|휴대폰|이름.*알려|연락.*남겨/.test(message);
    if (askingBookingInfo && [Phase.PHASE_4_QUOTE, Phase.PHASE_5_NUDGE, Phase.PHASE_2_COLLECT].includes(phase)) {
      await conversationStore.updatePhase(sessionId, Phase.PHASE_6_BOOKING, "상담사 예약 정보 요청", "agent");
      console.log(`[send] Phase 전환: ${phase} → phase_6 (상담사 예약 정보 요청)`);
    }

    // 견적 안내 메시지 → Phase 4 (견적 안내)
    const quoteMsgPattern = /견적.*안내|예상.*견적|견적.*드립니다|견적.*원|만\s*원|천\s*원/.test(message);
    if (quoteMsgPattern && [Phase.PHASE_2_COLLECT, Phase.PHASE_3_SPEC].includes(phase)) {
      await conversationStore.updatePhase(sessionId, Phase.PHASE_4_QUOTE, "상담사 견적 안내", "agent");
      console.log(`[send] Phase 전환: ${phase} → phase_4 (상담사 견적 안내)`);
    }

    // 일정 안내/확인 메시지 → Phase 7 (예약 확정 대기)
    const scheduleConfirmPattern = /예약.*확인|정보.*확인|아래.*확인|맞으시면|더블\s*체크/.test(message);
    if (scheduleConfirmPattern && phase === Phase.PHASE_6_BOOKING) {
      await conversationStore.updatePhase(sessionId, Phase.PHASE_7_CONFIRM, "상담사 예약 정보 확인", "agent");
      console.log(`[send] Phase 전환: ${phase} → phase_7 (상담사 예약 정보 확인)`);
    }

    // 방문 일정 안내 (시간 포함) → Phase 7
    const timeAnnouncementPattern = /(?:오전|오후)\s*\d{1,2}\s*[시:].*(?:방문|도착|가능|예정)|(?:방문|도착|가능|예정).*(?:오전|오후)\s*\d{1,2}\s*[시:]/.test(message);
    if (timeAnnouncementPattern && [Phase.PHASE_6_BOOKING, Phase.PHASE_4_QUOTE].includes(phase)) {
      if (phase === Phase.PHASE_4_QUOTE) {
        await conversationStore.updatePhase(sessionId, Phase.PHASE_6_BOOKING, "상담사 일정 안내 (견적→예약)", "agent");
      }
      // Phase 6에서 시간 안내하면 Phase 7으로
      if (phase === Phase.PHASE_6_BOOKING) {
        await conversationStore.updatePhase(sessionId, Phase.PHASE_7_CONFIRM, "상담사 일정 안내", "agent");
        console.log(`[send] Phase 전환: ${phase} → phase_7 (상담사 일정 안내)`);
      }
    }
  }

  // 견적 메시지 발송 시 상태를 견적완료(넛지예정)로 변경
  // ★ 실제 견적 금액이 포함된 메시지인지 확인 (단순 안내 메시지 전송 시 오전환 방지)
  // ★ conv.currentPhase는 함수 시작 시점 스냅샷이므로, 위에서 phase 전환이 일어난 경우를 반영하기 위해 DB를 다시 읽음
  const hasQuotePriceInMessage = /\d{1,3}(,\d{3})*\s*원/.test(message) || /견적\s*[:：]/.test(message);
  if (hasQuotePriceInMessage) {
    const freshConv = await conversationStore.getById(sessionId);
    const freshPhase = freshConv?.currentPhase as Phase;
    const freshStatus = freshConv?.status ?? "pending";
    if (
      (freshStatus === "pending" || freshStatus === "needs_check") &&
      (freshPhase === Phase.PHASE_4_QUOTE || freshPhase === Phase.PHASE_5_NUDGE) &&
      (freshConv?.quote?.items?.length ?? 0) > 0
    ) {
      await conversationStore.updateStatus(sessionId, "quote_sent_nudge");
      // 견적 전송 시각 기록
      if (freshConv?.quote && !freshConv.quote.sentAt) {
        await conversationStore.updateQuote(sessionId, { ...freshConv.quote, sentAt: Date.now() });
      }
    }
  }

  // 야간수거 안내 메시지 감지 → night_pickup 상태로 변경
  const isNightPickupMsg = /커버링\s*(앱|어플|어플리케이션)/.test(message)
    && /80L|220L|봉투\s*구매|생활쓰레기|대형폐기물/.test(message);
  if (isNightPickupMsg) {
    await conversationStore.updateStatus(sessionId, "night_pickup");
    console.log(`[send] 야간수거 안내 감지 → night_pickup: ${sessionId}`);
  }

  // 오인입 안내 메시지 감지 → wrong_inbound 상태로 변경
  const isWrongInboundMsg = /커버링\s*(서비스|앱|어플).*이용.*문의/.test(message)
    || (/1:1\s*문의/.test(message) && /방문수거.*다르게|기존\s*커버링\s*수거/.test(message));
  if (isWrongInboundMsg) {
    await conversationStore.updateStatus(sessionId, "wrong_inbound");
    console.log(`[send] 오인입 안내 감지 → wrong_inbound: ${sessionId}`);
  }

  // 발송 메시지에서 고객명/연락처 자동 추출 (예약확정 메시지 등)
  if (!conv.name || !conv.phone) {
    // 전화번호 패턴 추출 (가짜 번호 차단)
    const phoneMatch = message.match(/01[016789]-?\d{3,4}-?\d{4}/);
    if (phoneMatch && !conv.phone) {
      const cleanPhone = phoneMatch[0].replace(/-/g, "");
      const suffix = cleanPhone.slice(3);
      const isFake = /^(\d)\1{6,}$/.test(suffix);
      if (!isFake) {
        await conversationStore.updatePhone(sessionId, cleanPhone);
      }
    }
    // 이름 패턴 추출 (예: "홍길동 고객님", "홍길동님", "성함: 홍길동")
    const nameMatch = message.match(/(?:성함\s*[:\s]\s*|고객명\s*[:\s]\s*)([가-힣]{2,4})/);
    if (nameMatch && !conv.name) {
      await conversationStore.updateName(sessionId, nameMatch[1]);
    }
  }

  // 세션 히스토리 저장
  const userMessage = conv.messages.filter((m: { role: string }) => m.role === "user").at(-1)?.content ?? "";
  await saveSessionHistory(conv.userKey, sessionId, userMessage, message);

  } catch (err) {
    // 발송은 이미 성공 — 후처리 실패는 로깅만. 클라이언트는 이미 200 받았음.
    console.error("[send] post-send bookkeeping 실패 (메시지는 발송됨):", err);
  }
  });
  return NextResponse.json({ status: "ok" });
}

// §6.1 inline 선결제 — 예약확정 메시지 sendSplitMessage 직전에 호출.
//   기존 활성 주문(confirmed/payment_requested/prepaid) 이 있으면 그대로 반환,
//   없으면 conv 의 quote/collectedInfo/messages 에서 추출해 주문 생성 후 반환.
//   호출 측은 반환된 order 로 issuePrepaymentLink 호출 → URL 을 message 에 임베드.
//   주문 생성 시 audit log 만 기록. updateBooking / Covering 동기화는 후속 booking handling
//   블록에서 처리 (활성 주문 가드로 중복 방지).
async function prepareBookingOrderForPrepayment(
  sessionId: string,
  conv: NonNullable<Awaited<ReturnType<typeof conversationStore.getById>>>,
) {
  // 날짜·시간 먼저 추출 — 다중예약 판별에 필요 (같은 세션이라도 날짜 다르면 별도 주문)
  let extractedDate = "";
  let extractedTime = "";
  let extractedTimeEnd = "";
  let singleTimeFallback = "";
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const content = conv.messages[i].content;
    if (/수거 가능한 시간대입니다/.test(content)) continue;
    if (/접수해드렸습니다 :\) 담당자가 최종 확인/.test(content)) continue;
    const extracted = extractBookingDateTime(content);
    if (!extractedDate && extracted.date) extractedDate = extracted.date;
    if (!extractedTimeEnd && extracted.timeEnd) {
      extractedTime = extracted.time;
      extractedTimeEnd = extracted.timeEnd;
    } else if (!singleTimeFallback && extracted.time) {
      singleTimeFallback = extracted.time;
    }
    if (extractedDate && extractedTimeEnd) break;
  }

  // 기존 active 주문 확인 — 날짜가 같으면 재사용(중복 송신 idempotent),
  //   다르면 다중예약 → 신규 주문 생성
  const existing = await orderStore.getBySessionId(sessionId);
  const isActive = existing && ["confirmed", "payment_requested", "prepaid"].includes(existing.status);
  if (isActive && existing) {
    const sameDate = extractedDate && extractedDate === existing.date;
    if (sameDate) return existing;
    // else: fall through → 신규 주문 생성 (다중예약)
    console.log(`[prepareBooking] 다중예약 감지 — 기존 ${existing.date} 유지 + 신규 ${extractedDate} 주문 생성`);
  }
  if (!extractedTime) extractedTime = singleTimeFallback;
  if (!extractedDate || extractedDate === "미정") {
    const ci = conv.collectedInfo as { requestedDate?: string | null; selectedDate?: string | null } | null;
    const fallback = ci?.requestedDate || ci?.selectedDate || conv.booking?.preferredDate || "";
    if (fallback) extractedDate = fallback;
  }
  const timeSlotRaw = extractedTime && extractedTime !== "미정"
    ? (extractedTimeEnd ? `${extractedTime}~${extractedTimeEnd}` : extractedTime)
    : (conv.booking?.preferredTime || "");
  const timeSlotStr = formatTimeSlotKor(timeSlotRaw);

  const quoteItems = conv.quote?.items?.map((item) => ({
    category: item.category,
    name: item.name,
    displayName: `${item.category} - ${item.name}`,
    price: item.unitPrice,
    quantity: item.quantity,
    loadingCube: item.volumeM3,
  })) || [];
  const totalLoadingCube = quoteItems.reduce((sum, i) => sum + (i.loadingCube || 0) * i.quantity, 0);
  const orderItems = quoteItems.map((item) => ({ ...item, volume: item.loadingCube || 0 }));

  const createdOrder = await orderStore.create({
    sessionId,
    status: "confirmed",
    customerName: conv.name || "",
    phone: conv.phone || "",
    address: conv.collectedInfo?.address || "",
    date: extractedDate !== "미정" ? extractedDate : "",
    timeSlot: timeSlotStr,
    floor: conv.collectedInfo?.floor ?? null,
    hasElevator: conv.collectedInfo?.elevator ?? false,
    hasParking: conv.collectedInfo?.parking ?? false,
    hasGroundAccess: true,
    needLadder: false,
    ladderFee: conv.quote?.ladderFee || 0,
    crewSize: conv.quote?.workerCount || 1,
    items: orderItems,
    totalVolume: Math.round(totalLoadingCube * 1000) / 1000,
    totalPrice: conv.quote?.totalPrice || 0,
    memo: (conv.collectedInfo?.special_notes ?? []).join(", "),
    photos: [],
  });
  if (createdOrder) {
    await auditStore.log({
      entityType: "order", entityId: createdOrder.id, action: "create",
      changes: { created: { old: null, new: { orderNumber: createdOrder.orderNumber, customerName: conv.name, date: extractedDate } } },
      description: `주문 생성 (자동 - 예약확정 메시지 inline 선결제): ${conv.name || ""} ${extractedDate || ""}`,
      userId: 0, userName: "AI(예약확정)",
    });
    // 대시보드 전환 카운트용 conversations.booking 동기화 — 후속 else 블록의 updateBooking 과 동일.
    try {
      await conversationStore.updateBooking(sessionId, {
        customerName: conv.name || "",
        phone: conv.phone || "",
        address: conv.collectedInfo?.address || "",
        floor: conv.collectedInfo?.floor || 0,
        hasElevator: conv.collectedInfo?.elevator ?? false,
        hasParking: conv.collectedInfo?.parking ?? false,
        ladderNeeded: false,
        preferredDate: extractedDate || conv.booking?.preferredDate || "",
        preferredTime: timeSlotStr || conv.booking?.preferredTime || "",
        confirmedAt: Date.now(),
        reminderSentAt: null,
        specialNotes: (conv.collectedInfo?.special_notes ?? []).join(", "),
      });
    } catch { /* conversations.booking 업데이트 실패해도 계속 진행 */ }
  }
  return createdOrder;
}
