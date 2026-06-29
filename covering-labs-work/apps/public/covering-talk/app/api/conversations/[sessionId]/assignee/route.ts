import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore } from "@/lib/store/audit-logs";

// [CS-ETC-008] 상담사 배정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const { assignee } = (await request.json()) as { assignee: string | null };

  const conv = await conversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oldAssignee = conv.assignee;
  await conversationStore.updateAssignee(sessionId, assignee || null);

  // audit log
  const user = await getCurrentUser();
  if (user && oldAssignee !== (assignee || null)) {
    auditStore.log({
      entityType: "conversation",
      entityId: sessionId,
      action: "update",
      changes: { assignee: { old: oldAssignee, new: assignee || null } },
      description: `담당자 변경: ${oldAssignee || "미배정"} → ${assignee || "미배정"}`,
      userId: user.id,
      userName: user.name,
    });
  }

  return NextResponse.json({ ok: true });
}
