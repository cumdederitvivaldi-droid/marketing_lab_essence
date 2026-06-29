import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore } from "@/lib/store/audit-logs";

// [CS-CONV-089] 전화상담 tag 수동 조작 — request / complete / clear
//   AI 자동 검출 오탐/누락 보정용. 사이드패널 status 드롭다운에서 호출.
type PhoneAction = "request" | "complete" | "clear";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const { action } = (await request.json()) as { action: PhoneAction };
  if (!action || !["request", "complete", "clear"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const conv = await conversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const before = conv.tags ?? [];
  let description = "";
  if (action === "request") {
    // 이미 완료 마커가 있으면 addTag 가 자체적으로 skip
    await conversationStore.addTag(sessionId, "전화요청");
    description = "전화요청 tag 수동 부여";
  } else if (action === "complete") {
    await conversationStore.markPhoneRequestDone(sessionId);
    description = "전화상담 처리 완료";
  } else {
    // clear: 전화요청, 전화요청완료 둘 다 제거
    await conversationStore.removeTag(sessionId, "전화요청");
    await conversationStore.removeTag(sessionId, "전화요청완료");
    description = "전화요청 tag 전체 제거 (오탐 보정)";
  }

  const user = await getCurrentUser();
  if (user) {
    auditStore.log({
      entityType: "conversation",
      entityId: sessionId,
      action: "update",
      changes: { tags: { old: before, new: action } },
      description,
      userId: user.id,
      userName: user.name,
    });
  }
  return NextResponse.json({ ok: true });
}
