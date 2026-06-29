import { NextRequest, NextResponse } from "next/server";
import { conversationStore, ConversationStatus } from "@/lib/store/conversations";
import { generateMemoSummary } from "@/lib/ai/claude";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore } from "@/lib/store/audit-logs";

const MEMO_TRIGGER_STATUSES: ConversationStatus[] = [
  "booked",
  "completed",
  "no_response",
  "wrong_inbound",
  "night_pickup",
  "payment_check",
];

// [CS-ETC-007] 상담 상태 변경
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const { status } = await request.json() as { status: ConversationStatus };

  const conv = await conversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oldStatus = conv.status;
  await conversationStore.updateStatus(sessionId, status);

  // audit log
  const user = await getCurrentUser();
  if (user && oldStatus !== status) {
    auditStore.log({
      entityType: "conversation",
      entityId: sessionId,
      action: "status_change",
      changes: { status: { old: oldStatus, new: status } },
      description: `상담 상태 변경: ${oldStatus} → ${status}`,
      userId: user.id,
      userName: user.name,
    });
  }

  // 예약완료 시 booking 정보에서 고객명/연락처 자동 입력
  if (status === "booked" && conv.booking) {
    if (conv.booking.customerName && !conv.name) {
      await conversationStore.updateName(sessionId, conv.booking.customerName);
    }
    if (conv.booking.phone && (!conv.phone || conv.phone === conv.userKey.replace(/[^0-9+]/g, ""))) {
      await conversationStore.updatePhone(sessionId, conv.booking.phone);
    }
  }

  // 상태 변경 시마다 상담 메모 자동 갱신 (재이용 고객 대비)
  if (MEMO_TRIGGER_STATUSES.includes(status) && conv.messages.length >= 2) {
    generateMemoSummary(conv.messages.map((m) => ({ role: m.role, content: m.content })))
      .then((summary) => {
        if (summary) conversationStore.updateMemo(sessionId, summary);
      })
      .catch((err) => console.error("[Status] 메모 요약 오류:", err));
  }

  return NextResponse.json({ ok: true });
}
