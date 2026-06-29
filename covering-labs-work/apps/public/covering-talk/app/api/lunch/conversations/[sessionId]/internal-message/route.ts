import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore } from "@/lib/store/audit-logs";
import { supabase } from "@/lib/supabase/client";

// [CS-LUNCH-090] 런치 내부대화 메시지 작성. happytalk 발신 안 함.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, mentionedUserIds } = (await request.json()) as {
    content?: string;
    mentionedUserIds?: number[];
  };
  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const conv = await lunchConversationStore.getById(sessionId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const safeMentions = Array.isArray(mentionedUserIds)
    ? mentionedUserIds.filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
    : [];

  const result = await lunchConversationStore.addInternalMessage(
    sessionId, content.trim(), user.name, safeMentions,
  );

  // 멘션 → 공용 notifications 테이블 (type=mention_lunch)
  if (safeMentions.length > 0) {
    try {
      const { data: counselorRows } = await supabase
        .from("app_settings")
        .select("key, value")
        .like("key", "counselor:%");
      const idToName = new Map<number, string>();
      for (const row of (counselorRows ?? []) as Array<{ key: string; value: { id: number } }>) {
        idToName.set(row.value?.id, row.key.replace("counselor:", ""));
      }
      const recipientNames = safeMentions
        .map((id) => idToName.get(id))
        .filter((n): n is string => !!n);
      if (recipientNames.length > 0) {
        const preview = content.trim().slice(0, 100);
        await supabase.from("notifications").insert(
          recipientNames.map((recipient) => ({
            recipient,
            sender: user.name,
            type: "mention_lunch",
            chat_id: sessionId,
            message_preview: preview,
          })),
        );
      }
    } catch (e) {
      console.warn("[lunch internal-message] notifications insert 실패:", e);
    }
  }

  auditStore.log({
    entityType: "conversation",
    entityId: sessionId,
    action: "update",
    changes: { internal_message: { old: null, new: { id: result.id, mentions: safeMentions } } },
    description: `런치 내부대화 메시지 (${user.name})${safeMentions.length > 0 ? ` 멘션 ${safeMentions.length}명` : ""}`,
    userId: user.id,
    userName: user.name,
  });

  return NextResponse.json({ id: result.id, createdAt: result.createdAt, sentBy: user.name });
}
