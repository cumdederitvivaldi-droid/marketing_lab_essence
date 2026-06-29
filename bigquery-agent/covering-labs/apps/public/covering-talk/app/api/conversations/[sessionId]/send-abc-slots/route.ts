import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { sendRichMessage, type RichButton } from "@/lib/happytalk/client";
import { getCurrentUser } from "@/lib/auth/session";
import { BLOCK_RANGES, type TimeBlock } from "@/lib/dispatch/time-blocks";

// [CS-MSG-051] ABC 타임 슬롯 버튼 메시지 발송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const { date } = await request.json();
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date YYYY-MM-DD 형식 필수" }, { status: 400 });
    }

    const conv = await conversationStore.getById(sessionId);
    if (!conv) return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });

    // 1. 해당일 ABC 집계 조회 (서버→서버)
    const origin = request.nextUrl.origin;
    const scheduleRes = await fetch(`${origin}/api/schedule/abc?date=${date}`, {
      headers: { cookie: request.headers.get("cookie") || "" },
    });
    if (!scheduleRes.ok) {
      return NextResponse.json({ error: "집계 조회 실패" }, { status: 500 });
    }
    const schedule = await scheduleRes.json();
    const availableBlocks: TimeBlock[] = schedule.availableBlocks || [];

    if (availableBlocks.length === 0) {
      return NextResponse.json({ noAvailable: true, date, blocks: [] });
    }

    // 2. 메시지 템플릿 조회 (설정 없으면 기본 샘플 1)
    const weekdayLabel = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${date}T00:00:00`).getDay()];
    const dateLabel = date.replace(/^\d{4}-(\d{2})-(\d{2})$/, "$1월 $2일");
    const messageBody = `${dateLabel}(${weekdayLabel}) 수거 가능한 시간대입니다.
아래 버튼 중 원하시는 시간대를 선택해 주세요.

각 시간대 안에서 기사 동선에 따라 방문합니다.`;

    // 3. 버튼 구성
    const buttons: RichButton[] = availableBlocks.map((b) => ({
      name: BLOCK_RANGES[b].label,
      type: "BK",
      extra: `ABC:${date}:${b}`,
    }));

    // 4. 해피톡 rich 메시지 발송
    try {
      await sendRichMessage({
        user_key: conv.userKey,
        sender_key: conv.senderKey,
        message: messageBody,
        buttons,
      });
    } catch (err) {
      console.error("[send-abc-slots] 해피톡 발송 실패:", err);
      return NextResponse.json({ error: "발송 실패" }, { status: 502 });
    }

    // 5. 대화 기록 저장 (auto_sent_by 에 날짜 인코딩 → 웹훅에서 역추출)
    const currentUser = await getCurrentUser();
    const senderName = currentUser?.name ?? "상담사";
    const btnList = buttons.map((b) => `· ${b.name}`).join("\n");
    const fullContent = `${messageBody}\n\n${btnList}`;
    await conversationStore.addAssistantMessage(sessionId, fullContent, senderName, false);
    // 날짜 인코딩 — collectedInfo 에 기록 (webhook 에서 역추출)
    await conversationStore.updateCollectedInfo(sessionId, {
      _abcSlotsSent: { date, blocks: availableBlocks, sentAt: new Date().toISOString() },
    } as Partial<typeof conv.collectedInfo>);

    return NextResponse.json({ sent: true, date, blocks: availableBlocks });
  } catch (err) {
    console.error("[send-abc-slots] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "발송 실패" }, { status: 500 });
  }
}
