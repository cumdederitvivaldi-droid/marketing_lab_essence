import { NextRequest, NextResponse } from "next/server";
import { autoTagChat } from "@/lib/channeltalk/auto-tag";

export const maxDuration = 30;

// [CS-CT-012] 자동 태깅 (비동기, fire-and-forget)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  try {
    const { chatId } = await params;
    const { messages, existingTags } = await request.json() as {
      messages: Array<{ role: string; content: string }>;
      existingTags: string[];
    };

    const finalTags = await autoTagChat(chatId, messages, existingTags);

    return NextResponse.json({ success: true, tags: finalTags });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CT] auto-tag error:", msg);
    return NextResponse.json({ error: `자동 태깅 실패: ${msg}` }, { status: 500 });
  }
}
