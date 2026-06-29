import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-010] 대화 초기화 (상담사 UI — CustomerPanel 의 reset 버튼)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;

  // 메시지 전부 삭제
  const { error: msgErr } = await supabase
    .from("messages")
    .delete()
    .eq("session_id", sessionId);

  if (msgErr) {
    console.error("[reset] messages delete error:", msgErr);
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  // 대화 상태 초기화
  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      status: "pending",
      ai_draft: null,
      memo: "",
      quote: null,
      booking: null,
      name: null,
      phone: "",
      needs_human: false,
      unread_count: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", sessionId);

  if (convErr) {
    console.error("[reset] conversation update error:", convErr);
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", message: "대화가 초기화되었습니다." });
}

// [CS-ETC-011] 대화 삭제 (상담사 UI — CustomerPanel 의 reset 버튼)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;

  // 메시지 먼저 삭제 (FK 제약)
  await supabase.from("messages").delete().eq("session_id", sessionId);

  // 대화 삭제
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("session_id", sessionId);

  if (error) {
    console.error("[reset] delete conversation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", message: "대화가 삭제되었습니다." });
}
