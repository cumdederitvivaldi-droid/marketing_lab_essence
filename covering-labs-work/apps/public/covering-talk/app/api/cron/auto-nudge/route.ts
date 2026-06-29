import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { conversationStore } from "@/lib/store/conversations";
import { sendSplitMessage } from "@/lib/happytalk/send-message";

const NUDGE_MESSAGE = `고객님, 안녕하세요
커버링 방문수거 입니다!

어제 보내드린 견적은 확인하셨나요?

혹시 추가로 견적 관련해 궁금하신 점이나, 변경 사항 있으시면 언제든 말씀 주세요!
고객님 편하신 시간에 연락 주시면 빠르게 답변 드릴 수 있도록 하겠습니다 : )`;

/**
 * [CS-NTF-014] 넛지 자동 발송 크론
 * 매일 오전 10시(KST) — 견적 발송 후 24시간 이상 지난 quote_sent_nudge 대상에 넛지 자동 발송.
 * 기준은 `quote.sentAt` (견적 발송 시각). 인입 시점(created_at) 으로 잡으면
 * 같은 날 09시에 견적 발송 → 10시 cron 에 즉시 넛지 가는 버그 발생.
 */
export async function GET(): Promise<NextResponse> {
  try {
    // "딱 전일 견적" 만 — quote.sentAt 가 24h~48h 전 윈도우 안인 건만.
    // 24h 미만 = 같은 날 견적 (즉시 넛지 차단), 48h 초과 = 이미 며칠 지난 stale (skip)
    const upperMs = Date.now() - 24 * 60 * 60 * 1000;       // 24h 이전
    const lowerMs = Date.now() - 48 * 60 * 60 * 1000;       // 48h 이전 까진 OK

    const { data, error } = await supabase
      .from("conversations")
      .select("session_id, name, phone, quote")
      .eq("status", "quote_sent_nudge");

    if (error) throw error;
    const targets = (data ?? []).filter((c) => {
      const sentAt = (c.quote as { sentAt?: number | null } | null)?.sentAt ?? null;
      if (sentAt == null) return false;     // 견적 발송 시각 없으면 skip
      if (sentAt > upperMs) return false;   // 24시간 미만이면 skip (당일 견적)
      if (sentAt < lowerMs) return false;   // 48시간 초과도 skip (stale)
      return true;
    });

    if (targets.length === 0) {
      console.log("[auto-nudge] 대상 없음");
      return NextResponse.json({ sent: 0, total: 0 });
    }

    let sent = 0;
    let failed = 0;
    let alreadyClaimed = 0;

    for (const t of targets) {
      // ── atomic claim: status='quote_sent_nudge' 일 때만 'nudge_sent' 로 변경 ──
      // 동시 cron 또는 재시도 발생해도 update 가 성공한 1개만 실제 발송 진행.
      // 발송 실패 시 finally 에서 'no_response' 로 다시 update (qsn 으로 되돌리지 X — 무한 발송 방지).
      const { data: claimed, error: claimErr } = await supabase
        .from("conversations")
        .update({ status: "nudge_sent", updated_at: new Date().toISOString() })
        .eq("session_id", t.session_id)
        .eq("status", "quote_sent_nudge")
        .select("session_id")
        .maybeSingle();

      if (claimErr || !claimed) { alreadyClaimed++; continue; }

      try {
        const conv = await conversationStore.getById(t.session_id);
        if (!conv) { failed++; continue; }

        await sendSplitMessage({
          user_key: conv.userKey,
          sender_key: conv.senderKey,
          message: NUDGE_MESSAGE,
        });

        await conversationStore.addAssistantMessage(t.session_id, NUDGE_MESSAGE, "넛지봇", false);
        sent++;
      } catch {
        // 발송 실패 = 고객 채팅방 나감 → 무응답 처리. status 는 nudge_sent → no_response 로 보정.
        try { await conversationStore.updateStatus(t.session_id, "no_response"); } catch {}
        failed++;
      }
    }

    console.log(`[auto-nudge] 대상=${targets.length} 발송=${sent} 실패=${failed} 이미처리=${alreadyClaimed}`);
    return NextResponse.json({ total: targets.length, sent, failed, alreadyClaimed });
  } catch (e) {
    console.error("[auto-nudge] 오류:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
