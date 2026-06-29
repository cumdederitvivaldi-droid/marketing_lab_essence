import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore } from "@/lib/store/audit-logs";

// [CS-CONV-088] 전화상담 처리 완료 — 전화요청 tag → 전화요청완료 마커 전환 (상태는 유지)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const conv = await conversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const hadOpen = (conv.tags ?? []).includes("전화요청");
  await conversationStore.markPhoneRequestDone(sessionId);

  const user = await getCurrentUser();
  if (user && hadOpen) {
    auditStore.log({
      entityType: "conversation",
      entityId: sessionId,
      action: "update",
      changes: { tags: { old: ["전화요청"], new: ["전화요청완료"] } },
      description: "전화상담 처리 완료",
      userId: user.id,
      userName: user.name,
    });
  }
  return NextResponse.json({ ok: true });
}
