import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { conversationStore } from "@/lib/store/conversations";
import { sendSplitMessage } from "@/lib/happytalk/send-message";

const NUDGE_MESSAGE = `고객님, 안녕하세요
커버링 방문수거 입니다!

어제 보내드린 견적은 확인하셨나요?

혹시 추가로 견적 관련해 궁금하신 점이나, 변경 사항 있으시면 언제든 말씀 주세요!
고객님 편하신 시간에 연락 주시면 빠르게 답변 드릴 수 있도록 하겠습니다 : )`;

// GET /api/nudge — 넛지 대상 목록 조회
// [CS-NTF-001] 넛지 목록 조회
export async function GET(): Promise<NextResponse> {
  // KST 기준 오늘/어제
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = new Date(kst);
  today.setUTCHours(0, 0, 0, 0);
  // KST 자정 → UTC로 변환 (-9h)
  const todayUtc = new Date(today.getTime() - 9 * 60 * 60 * 1000);
  const yesterday = new Date(todayUtc);
  yesterday.setDate(yesterday.getDate() - 1);

  const { data, error } = await supabase
    .from("conversations")
    .select("session_id, name, phone, created_at")
    .eq("status", "quote_sent_nudge")
    .gte("created_at", yesterday.toISOString())
    .lt("created_at", todayUtc.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const targets = (data ?? []).map((r) => ({
    sessionId: r.session_id,
    name: r.name || "미등록",
    phone: r.phone || "-",
    createdAt: r.created_at,
  }));

  return NextResponse.json({ targets, count: targets.length });
}

// POST /api/nudge — 일괄 넛지 발송
// [CS-NTF-002] 넛지 생성
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { sessionIds } = await request.json() as { sessionIds: string[] };

  if (!sessionIds?.length) {
    return NextResponse.json({ error: "발송 대상이 없습니다" }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  const results: { sessionId: string; success: boolean; error?: string }[] = [];

  for (const sid of sessionIds) {
    try {
      const conv = await conversationStore.getById(sid);
      if (!conv) {
        results.push({ sessionId: sid, success: false, error: "대화 없음" });
        failed++;
        continue;
      }

      // 이미 넛지 완료된 건은 스킵
      if (conv.status === "nudge_sent") {
        results.push({ sessionId: sid, success: false, error: "이미 넛지 완료" });
        failed++;
        continue;
      }

      // 메시지 발송
      await sendSplitMessage({
        user_key: conv.userKey,
        sender_key: conv.senderKey,
        message: NUDGE_MESSAGE,
      });

      // 대화 내역에 메시지 기록
      await conversationStore.addAssistantMessage(sid, NUDGE_MESSAGE, "넛지봇", false);

      // 상태를 넛지완료로 변경
      await conversationStore.updateStatus(sid, "nudge_sent");

      results.push({ sessionId: sid, success: true });
      sent++;
    } catch (err) {
      console.error(`[nudge] ${sid} 발송 실패:`, err);
      // 발송 실패 = 고객이 채팅방 나감 → 무응답 처리하여 넛지 목록에서 제거
      try {
        await conversationStore.updateStatus(sid, "no_response");
      } catch {}
      results.push({ sessionId: sid, success: false, error: "발송 실패 (무응답 처리됨)" });
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, results });
}
