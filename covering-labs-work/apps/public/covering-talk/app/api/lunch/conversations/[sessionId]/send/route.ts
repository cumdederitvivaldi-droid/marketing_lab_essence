import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { sendLunchPlainMessage } from "@/lib/happytalk/lunch-client";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { classifyReply } from "@/lib/utils/reply-classify";

export const maxDuration = 30;

// [CS-ETC-047] 런치 채팅 메시지 발송
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const message: string | undefined = body.message;
    const suppressDuplicateWindow: number | undefined = body.suppressDuplicateWindow; // 초 단위, 동일 content 중복 차단 윈도우

    if (!message?.trim()) {
      return NextResponse.json({ error: "메시지를 입력해주세요" }, { status: 400 });
    }

    const trimmedMsg = message.trim();

    // 중복 차단: 최근 N초 이내 동일 세션·동일 content 발송 이력 있으면 스킵
    if (typeof suppressDuplicateWindow === "number" && suppressDuplicateWindow > 0) {
      const cutoffIso = new Date(Date.now() - suppressDuplicateWindow * 1000).toISOString();
      const { data: dup } = await supabase
        .from("lunch_messages")
        .select("id, created_at")
        .eq("session_id", sessionId)
        .eq("content", trimmedMsg)
        .gte("created_at", cutoffIso)
        .order("created_at", { ascending: false })
        .limit(1);
      if (dup && dup.length > 0) {
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: "중복 차단",
          previousAt: dup[0].created_at,
          windowSeconds: suppressDuplicateWindow,
        });
      }
    }

    // 현재 로그인된 상담사 이름
    const currentUser = await getCurrentUser();
    const senderName = currentUser?.name ?? "상담사";

    // 대화 조회
    const conv = await lunchConversationStore.getById(sessionId);
    if (!conv) return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });

    // 해피톡으로 발송
    try {
      const apiHost = process.env.LUNCH_HAPPYTALK_API_HOST || process.env.HAPPYTALK_API_HOST || "(없음)";
      const hasClientId = !!process.env.LUNCH_HT_CLIENT_ID;
      const hasSecret = !!process.env.LUNCH_HT_CLIENT_SECRET;
      const hasSenderKey = !!process.env.LUNCH_SENDER_KEY;
      console.log(`[lunch-send] 발송 시도: session=${sessionId} userKey=${conv.userKey} apiHost=${apiHost} clientId=${hasClientId} secret=${hasSecret} senderKey=${hasSenderKey}`);
      await sendLunchPlainMessage({
        user_key: conv.userKey,
        message: trimmedMsg,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // 고객이 채팅방을 나간 경우 (세션 만료) → 자동 상담종료 처리
      // (방문수거 app/api/conversations/[sessionId]/send/route.ts 와 동일 패턴)
      if (errMsg.includes("InvalidSessionException") || errMsg.includes("-502")) {
        console.log("[lunch-send] 세션 만료 → 상담종료 처리:", sessionId);
        await lunchConversationStore.update(sessionId, { status: "closed" });
        await lunchConversationStore.addOutgoingMessage(
          sessionId,
          "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.",
          "시스템",
        );
        return NextResponse.json({
          status: "session_expired",
          message: "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.",
        });
      }

      const apiHost = process.env.LUNCH_HAPPYTALK_API_HOST || process.env.HAPPYTALK_API_HOST || "(없음)";
      console.error("[lunch-send] 해피톡 발송 실패:", err, "userKey:", conv.userKey, "apiHost:", apiHost);
      return NextResponse.json({
        error: "발송 실패",
        detail: `${errMsg} [host: ${apiHost}]`,
      }, { status: 502 });
    }

    // CS Realtime 메타 — AI draft 분류 + 직전 user 메시지부터 응답까지 ms
    const { kind: replyKind, charOverlap } = classifyReply(trimmedMsg, conv.aiDraft);
    const { data: lastUserMsg } = await supabase
      .from("lunch_messages")
      .select("created_at")
      .eq("session_id", sessionId)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const respondedInMs = lastUserMsg?.created_at
      ? Math.max(0, Date.now() - new Date(lastUserMsg.created_at).getTime())
      : undefined;

    // DB에 메시지 저장 (상담사 이름 포함)
    await lunchConversationStore.addOutgoingMessage(
      sessionId,
      trimmedMsg,
      senderName,
      "text",
      undefined,
      { replyKind, draftCharOverlap: charOverlap, respondedInMs },
    );

    // 발송 성공 시 AI 초안 클리어
    await lunchConversationStore.update(sessionId, { aiDraft: null });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch-send] error:", err);
    return NextResponse.json({ error: "발송 처리 실패" }, { status: 500 });
  }
}
