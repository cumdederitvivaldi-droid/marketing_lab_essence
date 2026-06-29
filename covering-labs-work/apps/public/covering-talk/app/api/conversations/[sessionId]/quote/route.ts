import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { generateQuoteTemplate } from "@/lib/utils/quote-template";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore } from "@/lib/store/audit-logs";

// [CS-ITM-011] 견적 저장
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const body = await request.json();

  if (!body.quote) {
    return NextResponse.json({ error: "quote is required" }, { status: 400 });
  }

  try {
    // 1. 견적 저장 (운영자가 편집기에서 저장 → manuallyEdited 플래그 설정)
    const quoteToSave = { ...body.quote, manuallyEdited: true };
    await conversationStore.updateQuote(sessionId, quoteToSave);

    // 2. 견적 데이터로 템플릿 자동 재생성 → AI 초안 업데이트
    // 초기화(품목 0개)일 때는 draft를 비움
    let template = "";
    if (body.quote.items?.length > 0) {
      const conv = await conversationStore.getById(sessionId);
      template = await generateQuoteTemplate(body.quote, conv?.collectedInfo);
    }
    await conversationStore.updateDraft(sessionId, template);

    // audit log
    const user = await getCurrentUser();
    if (user) {
      const itemCount = body.quote.items?.length ?? 0;
      const totalPrice = body.quote.totalPrice ?? 0;
      auditStore.log({
        entityType: "conversation",
        entityId: sessionId,
        action: "update",
        changes: {
          quote: {
            old: null,
            new: { itemCount, totalPrice },
          },
        },
        description: `견적 수정: ${itemCount}개 품목, ${totalPrice.toLocaleString()}원`,
        userId: user.id,
        userName: user.name,
      });
    }

    return NextResponse.json({ status: "ok", aiDraft: template });
  } catch (err) {
    console.error("[quote] save error:", err);
    return NextResponse.json({ error: "Failed to save quote" }, { status: 500 });
  }
}
