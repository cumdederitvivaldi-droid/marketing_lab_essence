import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";

// [CS-ETC-051] 사이드 드롭박스 — 수거 희망일 저장 (상담사 수동 변경)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const { date } = await request.json();

    if (date !== null && date !== undefined && date !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return NextResponse.json({ error: "date YYYY-MM-DD 형식 또는 빈 값" }, { status: 400 });
    }

    await conversationStore.updateCollectedInfo(sessionId, {
      requestedDate: date || null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[requested-date] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "저장 실패" }, { status: 500 });
  }
}
