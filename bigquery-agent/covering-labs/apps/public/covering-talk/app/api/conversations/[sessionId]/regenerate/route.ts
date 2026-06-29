import { NextRequest, NextResponse } from "next/server";
import { conversationStore } from "@/lib/store/conversations";
import { generateAIResponse, extractMessage } from "@/lib/ai/claude";

// [CS-ETC-013] AI 응답 재생성
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const conv = await conversationStore.getById(sessionId);

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const userMessage = conv.messages.filter((m) => m.role === "user").at(-1)?.content ?? "";
  if (!userMessage) {
    return NextResponse.json({ error: "No user message found" }, { status: 400 });
  }

  const history = conv.messages
    .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
    .slice(0, -1)
    .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // 견적 데이터가 있으면 AI에 컨텍스트로 전달
  let quoteContext: string | undefined;
  if (conv.quote && conv.quote.items.length > 0) {
    const q = conv.quote;
    const itemLines = q.items.map((i: { name: string; quantity: number }) =>
      `- ${i.name} x${i.quantity}`
    ).join("\n");
    quoteContext = `품목:\n${itemLines}\n총 견적: ${q.totalPrice.toLocaleString()}원 (부가세 포함)`;
  }

  let aiDraft: string;
  try {
    const aiResult = await generateAIResponse(userMessage, history, undefined, quoteContext, conv.currentPhase, conv.collectedInfo);
    aiDraft = extractMessage(aiResult.response);
  } catch (err) {
    console.error("[regenerate] Claude API 오류:", err);
    return NextResponse.json({ error: "AI generation failed" }, { status: 500 });
  }

  await conversationStore.updateDraft(sessionId, aiDraft);

  return NextResponse.json({ aiDraft });
}
