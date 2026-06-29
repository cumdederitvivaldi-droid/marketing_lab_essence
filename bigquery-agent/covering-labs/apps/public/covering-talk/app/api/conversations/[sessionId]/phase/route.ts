import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { Phase, getDefaultStatusForPhase } from "@/lib/ai/phases";

const VALID_PHASES = Object.values(Phase);

// [CS-ETC-006] 상담 단계 변경
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;

  try {
    const body = await request.json();
    const { phase, reason } = body as { phase: string; reason?: string };

    if (!phase || !VALID_PHASES.includes(phase as Phase)) {
      return NextResponse.json(
        { error: `Invalid phase. Valid values: ${VALID_PHASES.join(", ")}` },
        { status: 400 }
      );
    }

    const conv = await conversationStore.getById(sessionId);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Phase 업데이트
    await conversationStore.updatePhase(
      sessionId,
      phase as Phase,
      reason || "상담사 수동 변경",
      "agent"
    );

    // Phase에 맞는 기본 Status로도 업데이트
    const defaultStatus = getDefaultStatusForPhase(phase as Phase);
    await conversationStore.updateStatus(sessionId, defaultStatus as Parameters<typeof conversationStore.updateStatus>[1]);

    return NextResponse.json({ success: true, phase, status: defaultStatus });
  } catch (err) {
    console.error("[Phase API] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
