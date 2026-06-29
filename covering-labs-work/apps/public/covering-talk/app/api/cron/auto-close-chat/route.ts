import { NextResponse } from "next/server";
import {
  listAllUserChats,
  getMessages,
  sendMessage,
  closeChat,
  getUserChat,
  updateChatTags,
  snoozeChat,
  assignChat,
  listManagers,
  openChat,
} from "@/lib/channeltalk/client";
import { autoTagChat } from "@/lib/channeltalk/auto-tag";
import { supabase, supabaseAdmin } from "@/lib/supabase/client";
import type { ChannelTalkUserChat, ChannelTalkMessage } from "@/lib/channeltalk/types";

export const maxDuration = 60;

// [CS-CRON-001] 채널톡 자동 종료 + 자동 배차 + backoffice_requests GC — 2분마다 (Vercel cron)

// ─── 상수: 자동종료 ───

const WARNING_TEXT = "*별도의 회신이 없을 경우, 상담이 종료됩니다.";

// 상담사마다 마무리인사가 다르므로 여러 패턴 매칭
const CLOSING_GREETING_PATTERNS = [
  /남은 하루도 평안하고 행복하게 보내시기 바라며/,
  /추가 문의 사항이 없으시다면 이번 상담은 종료하겠습니다/,
  /추가 문의가 있으시다면 언제든지 문의 주시기 바랍니다/,
  /오늘도 행복한 하루 되세요/,
  /추후에 궁금한 사항이 있으시다면/,
];

function isClosingGreeting(text: string): boolean {
  return CLOSING_GREETING_PATTERNS.some((p) => p.test(text));
}

const ONE_HOUR = 60 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;

// ─── 상수: 자동배차 ───

const VEHICLE_PATTERN = /차량?\s*번호|차번호?|차량\s*등록|배차\s*번호?|몇\s*번\s*차|무슨\s*차|수거\s*차량?|방문\s*차량?|차량?\s*알려|차량?\s*확인|차\s*몇\s*번|번호판|차량\s*조회|차\s*뭐\s*타|어떤\s*차|기사.*(성함|연락처|번호)|차량\s*번호\s*요청|주차\s*번호|주차\s*안내/;
const NON_VEHICLE_WF = /출입|미수거|수거.*문제|결제|구독|배송|봉투|쿠폰|앱|오류|탈퇴|환불|취소|주문.*변경|해지/;
const COMPLAINT_CONTEXT = /했는데|했거든|했지만|했음에도|했어도|안[ ]?[돼되]|못[ ]?[했해]|왜|문제|실패|누락|안 ?와|안 ?옴|미수거|출입/;
const VEHICLE_REQUEST = /차량?\s*번호.*(?:알|알려|확인|부탁|줘|주세요|가능|필요)|(?:알|알려|확인).*차량?\s*번호|방문\s*차량.*(?:등록|필요|알)|기사.*(?:성함|연락처|번호).*(?:알|확인|부탁|줘|주세요)/;
// 기사 성함/연락처 요청 패턴 → 차량등록2
const DRIVER_INFO_PATTERN = /기사\s*님?\s*(성함|이름|연락처|번호|전화)|성함.*연락처|연락처.*성함|기사.*누구|기사.*알려|기사.*확인|운전\s*기사/;

// 차량 번호판 패턴 (예: "서울 84 자 1787", "12가3456", "123가4567")
const PLATE_PATTERN = /(?:[가-힣]{2}\s?\d{2,3}\s?[가-힣]\s?\d{4}|\d{2,3}\s?[가-힣]\s?\d{4})/;

// 라이언 매니저 ID 캐시
let lionManagerId: string | null = null;
let lionCacheAt = 0;

async function getLionManagerId(): Promise<string | null> {
  if (lionManagerId && Date.now() - lionCacheAt < 30 * 60 * 1000) return lionManagerId;
  const managers = await listManagers();
  const lion = managers.find((m) => m.name === "라이언");
  if (lion) {
    lionManagerId = lion.id;
    lionCacheAt = Date.now();
  }
  return lion?.id ?? null;
}

// ─── 헬퍼 ───

function looksLikePhone(name: string): boolean {
  const cleaned = name.replace(/[\s\-()]/g, "");
  return /^\+?\d{9,}$/.test(cleaned);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

/** 메시지 조회 → 자동 태그 → 상담 종료 */
async function autoCloseChat(chatId: string, reason: string) {
  try {
    const msgData = await withRetry(() => getMessages(chatId, { sortOrder: "asc", limit: 100 }));
    const messages = (msgData.messages ?? []).map((m) => ({
      role: m.personType === "user" ? "user" : "manager",
      content: m.plainText ?? "",
    }));

    const chatData = await getUserChat(chatId);
    const existingTags: string[] = chatData.userChat?.tags ?? [];

    const tags = await autoTagChat(chatId, messages, existingTags);
    await withRetry(() => closeChat(chatId));

    console.log(`[auto-close] ${chatId}: closed (${reason}), tags=${JSON.stringify(tags)}`);
    return { chatId, action: "closed", reason, tags };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-close] ${chatId}: error (${reason}):`, msg);
    return { chatId, action: "error", reason, error: msg };
  }
}

// 자동배차 메시지 패턴 (중복 발송 방지용)
const VEHICLE_AUTO_MSG_PATTERNS = [
  /방문 드리는 차량의 경우/,
  /아직 배차가 진행되기 전으로 확인됩니다/,
];

/** 차량등록 자동 처리 (메시지 발송 + 태그 + 배정 + 보류) */
async function autoVehicleProcess(chatId: string, tags: string[], chatMessages: ChannelTalkMessage[], vehicleTag = "차량등록") {
  const results: Record<string, string> = {};
  try {
    // 중복 발송 체크: 이미 자동배차 메시지를 보낸 적 있으면 스킵
    const alreadySent = chatMessages.some(
      (m) => (m.personType === "bot" || m.personType === "manager") &&
        VEHICLE_AUTO_MSG_PATTERNS.some((p) => p.test(m.plainText ?? ""))
    );
    if (alreadySent) {
      console.log(`[auto-vehicle] ${chatId}: already sent, skip`);
      return { chatId, action: "vehicle_skipped", reason: "already_sent" };
    }

    // KST 현재 시간 계산
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const kstHour = kst.getUTCHours();
    const kstMin = kst.getUTCMinutes();
    const isAfter2130 = kstHour > 21 || (kstHour === 21 && kstMin >= 30);

    // 1. 답변 전송 — 21:30 이후에는 다른 메시지
    const vehicleMessage = isAfter2130
      ? "안녕하세요, 커버링 입니다.\n\n아직 배차가 진행되기 전으로 확인됩니다.\n배차 진행 후 해당 채팅방을 통해 전달드리겠습니다!"
      : "안녕하세요, 커버링 입니다.\n\n방문 드리는 차량의 경우,\n밤 9시 30분 이후 배차가 진행된 후 확인이 가능하여\n배차 완료된 후에 해당 채팅을 통해 순차적으로 차량 번호 전달 드릴 수 있도록 하겠습니다.";
    await sendMessage(chatId, vehicleMessage, { botName: "커버링" });
    results.message = isAfter2130 ? "sent_after_dispatch" : "sent";

    // 2~4 병렬: 태그 + 배정 + 보류
    const tagPromise = (async () => {
      try {
        if (!tags.includes(vehicleTag)) {
          // 기존에 다른 차량등록 태그가 있으면 교체
          const filtered = tags.filter((t) => t !== "차량등록" && t !== "차량등록2");
          // 비멱등 쓰기 — 재시도 시 응답 유실분 중복 적용 방지를 위해 단일 호출
          await updateChatTags(chatId, [...filtered, vehicleTag]);
        }
        return "ok";
      } catch { return "failed"; }
    })();

    const assignPromise = (async () => {
      try {
        const id = await getLionManagerId();
        if (id) { await assignChat(chatId, id); return "라이언"; }
        return "not_found";
      } catch { return "failed"; }
    })();

    const snoozePromise = (async () => {
      if (kstHour >= 21) return "skip_after_21"; // 21시 이후는 보류하지 않음
      try {
        // 21시 이전 → 오늘 밤 9시 KST로 보류
        const target = new Date(kst.getTime());
        target.setUTCHours(21, 0, 0, 0);
        const reopenedAt = target.getTime() - 9 * 60 * 60 * 1000; // KST → UTC
        await snoozeChat(chatId, { reopenedAt });
        return "ok";
      } catch { return "failed"; }
    })();

    const [tagR, assignR, snoozeR] = await Promise.all([tagPromise, assignPromise, snoozePromise]);
    results.tag = tagR;
    results.assign = assignR;
    results.snooze = snoozeR;

    console.log(`[auto-vehicle] ${chatId}: processed`, results);
    return { chatId, action: "vehicle_processed", results };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[auto-vehicle] ${chatId}: error:`, msg);
    return { chatId, action: "vehicle_error", error: msg };
  }
}

/** 채팅 메시지에서 차량등록 의도 감지 — "차량등록" 또는 "차량등록2" 반환, 미감지 시 null */
function detectVehicleIntent(msgs: ChannelTalkMessage[], tags: string[]): string | null {
  // 실제 상담사가 이미 답변했으면 스킵 — personType === "manager" 이지만
  //   workflow/bot/private note 는 제외해 사람 상담사 답변만 식별.
  //   (이전 hasManagerReply 는 `|| true` 로 항상 true 반환되며 사용처 없는 데드코드 — 제거)
  const realManagerReply = msgs.some(
    (m) =>
      m.personType === "manager" &&
      !m.log &&
      !m.workflow &&
      !(m.options ?? []).includes("private")
  );
  if (realManagerReply) return null;

  // 워크플로우에서 다른 카테고리 선택
  const wfButtons = msgs.filter((m) => m.workflow?.buttonBotMessage);
  if (wfButtons.some((m) => NON_VEHICLE_WF.test(m.plainText || ""))) return null;

  // 차량등록 의도 확인
  const hasVehicleWf = wfButtons.some((m) => VEHICLE_PATTERN.test(m.plainText || ""));
  const hasVehicleTag = tags.includes("차량등록") || tags.includes("차량등록2");
  const userTextMsgs = msgs.filter((m) => m.personType === "user" && !m.workflow?.buttonBotMessage);
  const hasVehicleText = userTextMsgs.some((m) => {
    const txt = m.plainText || "";
    if (!VEHICLE_PATTERN.test(txt)) return false;
    if (VEHICLE_REQUEST.test(txt)) return true;
    if (COMPLAINT_CONTEXT.test(txt)) return false;
    return true;
  });

  const isVehicle = hasVehicleWf || hasVehicleTag || hasVehicleText;
  if (!isVehicle) return null;

  // 기사 성함/연락처 요청이 포함되면 "차량등록2"
  const allUserText = userTextMsgs.map((m) => m.plainText ?? "").join(" ");
  if (DRIVER_INFO_PATTERN.test(allUserText)) return "차량등록2";
  if (tags.includes("차량등록2")) return "차량등록2";

  return "차량등록";
}

// ─── 크론 엔드포인트 ───
// [CS-ETC-026] 채널톡 자동 상담종료 + 자동배차 크론 (2분 주기)

export async function GET(): Promise<NextResponse> {
  try {
    // backoffice_requests 큐 GC — 5분+ stale row 정리 (채널톡 도메인 부수 효과)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabaseAdmin?.from("backoffice_requests").delete().lt("created_at", fiveMinAgo);

    // 1. 설정 확인
    const { data: settings } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["channeltalk_auto_close", "channeltalk_auto_vehicle"]);

    const settingMap = new Map((settings ?? []).map((s) => [s.key, s.value]));
    const autoCloseEnabled = settingMap.get("channeltalk_auto_close") === "true";
    const autoVehicleEnabled = settingMap.get("channeltalk_auto_vehicle") === "true";

    if (!autoCloseEnabled && !autoVehicleEnabled) {
      return NextResponse.json({ skipped: true, reason: "both disabled" });
    }

    // 2. 진행중(opened) 대화 목록 조회
    const data = await listAllUserChats({ state: "opened" });

    // userId → 이름 매핑
    const userNameMap = new Map<string, string>();
    for (const u of data.users ?? []) {
      userNameMap.set(u.id, u.name ?? "");
    }

    // chatId별 최신 메시지 매핑 (내부대화 제외)
    const lastMsgMap = new Map<
      string,
      { plainText: string; createdAt: number; personType: string; personId: string }
    >();
    for (const msg of data.messages ?? []) {
      // 내부대화(private note) + 시스템 로그 메시지는 자동종료 판단에서 제외
      const opts = msg.options ?? [];
      if (opts.includes("private") || opts.includes("silentToUser")) continue;
      if (msg.log) continue; // 배정/종료/스누즈 등 시스템 로그 제외
      if (msg.workflow && !msg.plainText?.trim()) continue; // 빈 워크플로우 메시지 제외

      const existing = lastMsgMap.get(msg.chatId);
      if (!existing || msg.createdAt > existing.createdAt) {
        lastMsgMap.set(msg.chatId, {
          plainText: msg.plainText ?? "",
          createdAt: msg.createdAt,
          personType: msg.personType,
          personId: msg.personId,
        });
      }
    }

    // "커버링" 시스템 봇 personId 조회 — 이 봇으로 보낸 메시지는 시스템 자동 메시지
    // 테디 등 상담사는 다른 botName(=다른 personId)으로 전송하므로 구별 가능
    let systemBotId: string | null = null;
    try {
      const sampleChat = (data.userChats ?? [])[0];
      if (sampleChat) {
        const msgData = await getMessages(sampleChat.id, { sortOrder: "desc", limit: 5 });
        const bots = (msgData as unknown as { bots?: { id: string; name: string }[] }).bots ?? [];
        const coveringBot = bots.find(b => b.name === "커버링");
        if (coveringBot) systemBotId = coveringBot.id;
      }
    } catch {}
    console.log(`[auto-close] systemBotId: ${systemBotId}`);

    const now = Date.now();
    const results: Array<Record<string, unknown>> = [];

    for (const chat of data.userChats ?? []) {
      const lastMsg = lastMsgMap.get(chat.id);
      if (!lastMsg) continue;

      const userName = userNameMap.get(chat.userId) || chat.name || "";
      const elapsed = now - lastMsg.createdAt;
      const text = (lastMsg.plainText ?? "").trim();
      const chatTags = chat.tags ?? [];

      // ═══ 자동배차: 미배정 + 차량 키워드 ═══
      // 운영 시간: 오전 10시 ~ 오후 10시 30분 (KST) — 이외 시간은 자동배차 중지
      const kstNow = new Date(now + 9 * 60 * 60 * 1000);
      const kstH = kstNow.getUTCHours();
      const kstM = kstNow.getUTCMinutes();
      const vehicleTimeOk = kstH >= 10 && (kstH < 22 || (kstH === 22 && kstM < 30));

      // 자동배차: 미배정 또는 차량등록 태그가 있는데 안내 메시지 미발송 건
      const hasVehicleTag = chatTags.includes("차량등록") || chatTags.includes("차량등록2");
      if (autoVehicleEnabled && vehicleTimeOk && (!chat.assigneeId || hasVehicleTag) && lastMsg.personType !== "manager") {
        if (!hasVehicleTag) {
          // 미배정 + 차량등록 태그 없음 → 키워드 감지 후 자동배차
          const chatMessages = (data.messages ?? []).filter((m) => m.chatId === chat.id);
          const hasVehicleKeyword =
            VEHICLE_PATTERN.test(text) ||
            chatMessages.some(
              (m) => m.personType === "user" && VEHICLE_PATTERN.test(m.plainText ?? "")
            );
          if (hasVehicleKeyword) {
            try {
              const msgData = await getMessages(chat.id, { sortOrder: "asc", limit: 100 });
              const detectedTag = detectVehicleIntent(msgData.messages ?? [], chatTags);
              if (detectedTag) {
                const r = await autoVehicleProcess(chat.id, chatTags, msgData.messages ?? [], detectedTag);
                results.push(r);
                // 자동배차 메시지가 실제로 발송/처리된 경우만 continue. already_sent 면
                //   자동종료 로직으로 fall-through (그렇지 않으면 한 번 안내 나간 차량등록
                //   chat 가 영원히 자동종료되지 않음).
                if (r.action !== "vehicle_skipped") continue;
              }
            } catch (err) {
              console.error(`[auto-vehicle] ${chat.id}: check error:`, err);
            }
          }
        } else {
          // 차량등록 태그가 이미 있는데 안내 메시지가 안 나간 경우 → 메시지만 발송
          try {
            const msgData = await getMessages(chat.id, { sortOrder: "asc", limit: 100 });
            const tag = chatTags.find((t) => t.startsWith("차량등록")) ?? "차량등록";
            const r = await autoVehicleProcess(chat.id, chatTags, msgData.messages ?? [], tag);
            results.push(r);
            // 위와 동일 — already_sent 는 자동종료 path 로 흘러야 함.
            if (r.action !== "vehicle_skipped") continue;
          } catch (err) {
            console.error(`[auto-vehicle] ${chat.id}: tagged but no msg, error:`, err);
          }
        }
      }

      // ═══ 자동종료: 배정됨 + 전화번호 고객 + 매니저 마지막 ═══
      // 운영 시간 외(22:30~10:00 KST)에는 자동종료도 중단
      if (!vehicleTimeOk) continue;
      if (!autoCloseEnabled) continue;
      if (!chat.assigneeId) continue;
      if (userName && !looksLikePhone(userName)) continue;
      if (lastMsg.personType === "user") continue;
      if (chatTags.includes("확인중")) continue; // "확인중" 태그 → 자동종료 스킵

      // 차량등록 채팅: 번호판이 아직 전달되지 않았으면 자동종료 스킵
      if (chatTags.includes("차량등록") || chatTags.includes("차량등록2")) {
        const chatMessages = (data.messages ?? []).filter((m) => m.chatId === chat.id);
        const hasPlateDelivered = chatMessages.some(
          (m) => (m.personType === "manager" || m.personType === "bot") &&
            !m.log && PLATE_PATTERN.test(m.plainText ?? "")
        );
        if (!hasPlateDelivered) {
          // 차량번호 미전달 → 자동종료 하지 않음
          continue;
        }
      }

      // 자동종료2: 마무리인사 발송 후 15분 무응답
      if (isClosingGreeting(text) && elapsed > FIFTEEN_MIN) {
        results.push(await autoCloseChat(chat.id, "closing_greeting"));
        continue;
      }

      // 자동종료1: 경고 메시지 발송 후 15분 무응답 → 종료
      if (text === WARNING_TEXT && elapsed > FIFTEEN_MIN) {
        results.push(await autoCloseChat(chat.id, "warning_timeout"));
        continue;
      }

      // 자동종료1: 매니저/봇 마지막 답변 후 1시간 무응답 → 경고 발송
      // 배정된 채팅이면 시스템봇("커버링") 메시지도 포함 (자동배차 응답 후 무응답 대응)
      if ((lastMsg.personType === "manager" || lastMsg.personType === "bot") && elapsed > ONE_HOUR) {
        if (isClosingGreeting(text)) continue; // 마무리인사는 자동종료2에서 처리

        try {
          // 비멱등 쓰기 — 재시도 시 같은 경고문이 두 번 발송될 수 있어 단일 호출
          await sendMessage(chat.id, WARNING_TEXT, { botName: "커버링" });
          console.log(`[auto-close] ${chat.id}: warning sent`);
          results.push({ chatId: chat.id, action: "warning_sent" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[auto-close] ${chat.id}: warning send failed:`, msg);
          results.push({ chatId: chat.id, action: "warning_error", error: msg });
        }
      }
    }

    // ═══ 스누즈 해제: 차량등록 + 번호판 전달 완료 → opened로 전환 ═══
    // 스누즈 상태에서는 자동종료 대상이 아니므로, 번호판 전달 후 스누즈를 해제해야
    // 다음 크론에서 일반 자동종료 로직이 적용됨
    if (autoCloseEnabled) {
      try {
        const snoozedData = await listAllUserChats({ state: "snoozed" });
        const snoozedMsgMap = new Map<string, ChannelTalkMessage[]>();
        for (const msg of snoozedData.messages ?? []) {
          if (!snoozedMsgMap.has(msg.chatId)) snoozedMsgMap.set(msg.chatId, []);
          snoozedMsgMap.get(msg.chatId)!.push(msg);
        }

        for (const chat of snoozedData.userChats ?? []) {
          const chatTags = chat.tags ?? [];
          if (!chatTags.includes("차량등록")) continue;

          const msgs = snoozedMsgMap.get(chat.id) ?? [];
          const hasPlateDelivered = msgs.some(
            (m) =>
              (m.personType === "manager" || m.personType === "bot") &&
              !m.log &&
              PLATE_PATTERN.test(m.plainText ?? "")
          );

          if (hasPlateDelivered) {
            try {
              await withRetry(() => openChat(chat.id));
              console.log(`[auto-close] ${chat.id}: snooze released (plate delivered)`);
              results.push({ chatId: chat.id, action: "snooze_released", reason: "plate_delivered" });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[auto-close] ${chat.id}: snooze release failed:`, msg);
              results.push({ chatId: chat.id, action: "snooze_release_error", error: msg });
            }
          }
        }
      } catch (err) {
        console.error("[auto-close] snoozed chats query error:", err);
      }
    }

    console.log(`[cron] auto-close/vehicle: ${results.length} actions`);
    return NextResponse.json({ processed: results.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron] auto-close/vehicle error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
