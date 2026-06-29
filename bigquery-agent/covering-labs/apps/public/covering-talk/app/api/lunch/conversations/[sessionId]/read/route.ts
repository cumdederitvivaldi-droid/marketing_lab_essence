import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-048] 런치 대화 읽음 처리
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    await lunchConversationStore.resetUnread(sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch-read] error:", err);
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}

// [CS-ETC-054] 런치 대화 안읽음 처리 (unread_count = 1)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    await supabase.from("lunch_conversations").update({ unread_count: 1 }).eq("session_id", sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch-unread] error:", err);
    return NextResponse.json({ error: "처리 실패" }, { status: 500 });
  }
}
