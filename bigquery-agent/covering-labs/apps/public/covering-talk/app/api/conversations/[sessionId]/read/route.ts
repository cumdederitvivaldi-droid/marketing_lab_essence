import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-009] 상담 읽음 처리
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;

  try {
    await conversationStore.markRead(sessionId);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[read] 읽음 처리 실패:", err);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}

// [CS-ETC-053] 상담 안읽음 처리 (unread_count = 1)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  try {
    await supabase.from("conversations").update({ unread_count: 1 }).eq("session_id", sessionId);
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    console.error("[unread] 안읽음 처리 실패:", err);
    return NextResponse.json({ error: "Failed to mark as unread" }, { status: 500 });
  }
}
