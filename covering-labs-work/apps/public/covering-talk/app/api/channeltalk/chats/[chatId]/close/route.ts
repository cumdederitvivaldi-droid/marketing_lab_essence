import { NextRequest, NextResponse } from "next/server";
import { closeChat } from "@/lib/channeltalk/client";

// [CS-CT-009] 상담 종료 (태그는 별도 /auto-tag 엔드포인트에서 처리)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  try {
    const { chatId } = await params;
    await closeChat(chatId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CT] close error:", msg);
    return NextResponse.json({ error: `상담 종료 실패: ${msg}` }, { status: 500 });
  }
}
