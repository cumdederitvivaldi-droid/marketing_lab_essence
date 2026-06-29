import { NextRequest, NextResponse } from "next/server";
import { sendMessage, snoozeChat, assignChat, listManagers, updateChatTags, getUserChat, getMessages } from "@/lib/channeltalk/client";

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

// 재시도 헬퍼 (Channel Talk API 일시 오류 대응)
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries) throw e;
      console.warn(`[vehicle-auto] retry ${i + 1}/${retries}:`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

// KST 현재 시간 헬퍼
function nowKST(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST
}

function kstToUtc(kstDate: Date): number {
  return kstDate.getTime() - 9 * 60 * 60 * 1000; // KST → UTC timestamp
}

// [CS-CT-025] 차량등록 자동 처리 (답변 전송 + 태그 + 배정 + 보류)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;
  const results: Record<string, string> = {};

  try {
    const kst = nowKST();
    const kstHour = kst.getUTCHours();
    const kstMin = kst.getUTCMinutes();

    // 운영 시간 체크: 10:00 ~ 22:30 KST 외에는 자동배차 중지
    const vehicleTimeOk = kstHour >= 10 && (kstHour < 22 || (kstHour === 22 && kstMin < 30));
    if (!vehicleTimeOk) {
      return NextResponse.json({ error: "자동배차 운영 시간이 아닙니다 (10:00~22:30)" }, { status: 400 });
    }

    // 중복 발송 체크
    const VEHICLE_AUTO_MSG_PATTERNS = [
      /방문 드리는 차량의 경우/,
      /아직 배차가 진행되기 전으로 확인됩니다/,
    ];
    const msgData = await getMessages(chatId, { sortOrder: "asc", limit: 100 });
    const alreadySent = (msgData.messages ?? []).some(
      (m) => (m.personType === "bot" || m.personType === "manager") &&
        VEHICLE_AUTO_MSG_PATTERNS.some((p) => p.test(m.plainText ?? ""))
    );
    if (alreadySent) {
      return NextResponse.json({ error: "이미 자동배차 안내가 발송된 채팅입니다" }, { status: 409 });
    }

    const isAfter2130 = kstHour > 21 || (kstHour === 21 && kstMin >= 30);

    // 1. 답변 전송 — 21:30 이후에는 다른 메시지
    const vehicleMessage = isAfter2130
      ? "안녕하세요, 커버링 입니다.\n\n아직 배차가 진행되기 전으로 확인됩니다.\n배차 진행 후 해당 채팅방을 통해 전달드리겠습니다!"
      : "안녕하세요, 커버링 입니다.\n\n방문 드리는 차량의 경우,\n밤 9시 30분 이후 배차가 진행된 후 확인이 가능하여\n배차 완료된 후에 해당 채팅을 통해 순차적으로 차량 번호 전달 드릴 수 있도록 하겠습니다.";
    await sendMessage(chatId, vehicleMessage, { botName: "커버링" });
    results.message = isAfter2130 ? "sent_after_dispatch" : "sent";

    // 2~4 병렬 처리: 태그 + 배정 + 보류
    // 기사 성함/연락처 요청 여부에 따라 태그 결정
    const DRIVER_INFO_PATTERN = /기사\s*님?\s*(성함|이름|연락처|번호|전화)|성함.*연락처|연락처.*성함|기사.*누구|기사.*알려|기사.*확인|운전\s*기사/;
    const userTexts = (msgData.messages ?? [])
      .filter((m) => m.personType === "user")
      .map((m) => m.plainText ?? "")
      .join(" ");
    const vehicleTag = DRIVER_INFO_PATTERN.test(userTexts) ? "차량등록2" : "차량등록";

    const tagPromise = (async () => {
      try {
        await withRetry(async () => {
          const chatData = await getUserChat(chatId);
          const currentTags: string[] = chatData.userChat?.tags ?? [];
          if (!currentTags.includes(vehicleTag)) {
            const filtered = currentTags.filter((t) => t !== "차량등록" && t !== "차량등록2");
            await updateChatTags(chatId, [...filtered, vehicleTag]);
          }
        });
        return "ok";
      } catch (e) { console.error("[vehicle-auto] tag error (after retries):", e); return "failed"; }
    })();

    const assignPromise = (async () => {
      try {
        const id = await getLionManagerId();
        if (id) {
          await withRetry(() => assignChat(chatId, id));
          return "라이언";
        }
        return "not_found";
      } catch (e) { console.error("[vehicle-auto] assign error (after retries):", e); return "failed"; }
    })();

    const snoozePromise = (async () => {
      if (kstHour >= 21) return "skip_after_21"; // 21시 이후는 보류하지 않음
      try {
        // 21시 이전 → 오늘 밤 9시 KST로 보류
        const target = new Date(kst.getTime());
        target.setUTCHours(21, 0, 0, 0);
        const reopenedAt = kstToUtc(target);
        console.log(`[vehicle-auto] snooze until KST 21:00 (UTC ts: ${reopenedAt})`);
        await withRetry(() => snoozeChat(chatId, { reopenedAt }));
        return "ok";
      } catch (e) { console.error("[vehicle-auto] snooze error (after retries):", e); return "failed"; }
    })();

    const [tagResult, assignResult, snoozeResult] = await Promise.all([
      tagPromise, assignPromise, snoozePromise,
    ]);

    results.tag = tagResult;
    results.assign = assignResult;
    results.snooze = snoozeResult;

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CT] vehicle-auto error:", msg);
    return NextResponse.json({ error: msg, results }, { status: 500 });
  }
}
