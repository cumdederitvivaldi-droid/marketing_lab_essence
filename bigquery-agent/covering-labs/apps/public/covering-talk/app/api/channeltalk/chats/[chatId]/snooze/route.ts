import { NextRequest, NextResponse } from "next/server";
import { snoozeChat } from "@/lib/channeltalk/client";

// [CS-CT-013] 상담 보류 처리
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  try {
    const { chatId } = await params;
    const body = await request.json().catch(() => ({}));
    const reopenedAt = body.reopenedAt as number | undefined;
    const duration = (body.duration as string) || "PT4H";
    await snoozeChat(chatId, reopenedAt ? { reopenedAt } : { duration });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CT] snooze error:", msg);
    return NextResponse.json({ error: `보류 처리 실패: ${msg}` }, { status: 500 });
  }
}
