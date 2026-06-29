import { NextRequest, NextResponse } from "next/server";
import { extractAndMatchItems } from "@/lib/ai/product-prompt";
import { conversationStore, Quote, QuoteItem } from "@/lib/store/conversations";
import { calcVat, ceilTo1000 } from "@/lib/utils/trip-fee";
import { generateQuoteTemplate } from "@/lib/utils/quote-template";

// Vercel 함수 타임아웃 60초 (기본 10초로는 다품목 AI 매칭 완료 불가)
export const maxDuration = 60;

/**
 * POST /api/conversations/[sessionId]/extract-items
 * 프롬프트 기반 품목 매칭 (v2)
 * — 431개 품목 리스트를 시스템 프롬프트에 포함, AI가 직접 매칭
 */
// [CS-ITM-012] 메시지에서 품목 추출
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  const { sessionId } = await params;
  const body = await request.json();
  const message: string = body.message;

  if (!message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    // 1. 프롬프트 기반 추출 + 매칭
    const result = await extractAndMatchItems(message);

    if (result.items.length === 0) {
      return NextResponse.json({ addedCount: 0, message: "추출할 품목이 없습니다" });
    }

    // 2. QuoteItem 형태로 변환
    const newItems: QuoteItem[] = result.items.map((item) => ({
      name: item.matchedName || item.raw,
      category: item.category,
      quantity: item.quantity,
      volumeM3: item.volume,
      unitPrice: item.unitPrice,
      confidence: item.confidence,
      note: [
        item.confidence !== "high" ? `[${item.confidence}]` : "",
        item.note ?? "",
        item.productId ? `P-${item.productId}` : "미등록",
      ].filter(Boolean).join(" "),
      productId: item.productId ?? undefined,
      sourceKeyword: item.raw,
    }));

    // 3. 기존 견적과 병합
    const conv = await conversationStore.getById(sessionId);
    const existingItems = conv?.quote?.items ?? [];

    const mergedItems = [...existingItems];
    for (const item of newItems) {
      const existingIdx = mergedItems.findIndex(
        (e) => e.name === item.name && e.category === item.category
      );
      if (existingIdx >= 0) {
        mergedItems[existingIdx] = {
          ...mergedItems[existingIdx],
          quantity: mergedItems[existingIdx].quantity + item.quantity,
        };
      } else {
        mergedItems.push(item);
      }
    }

    // 4. 견적 재계산 및 저장
    const itemsPrice = mergedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const vol = mergedItems.reduce((s, i) => s + i.volumeM3 * i.quantity, 0);
    const ladderFee = conv?.quote?.ladderFee ?? 0;
    const tripFee = conv?.quote?.tripFee ?? 0;
    const workerCount = conv?.quote?.workerCount ?? 1;
    const extraFees = conv?.quote?.extraFees ?? [];
    const efTotal = extraFees.reduce((s, f) => s + f.amount, 0);
    const subtotal = itemsPrice + ladderFee + tripFee + efTotal;
    const vat = calcVat(subtotal);

    const updatedQuote: Quote = {
      items: mergedItems,
      subtotalVolume: vol,
      basePrice: itemsPrice,
      ladderFee,
      tripFee,
      workerCount,
      extraFees,
      vatAmount: vat,
      totalPrice: ceilTo1000(subtotal + vat),
      createdAt: conv?.quote?.createdAt ?? Date.now(),
      sentAt: conv?.quote?.sentAt ?? null,
      editLog: conv?.quote?.editLog ?? [],
    };

    await conversationStore.updateQuote(sessionId, updatedQuote);

    // draft 갱신
    const latestConv = await conversationStore.getById(sessionId);
    const template = await generateQuoteTemplate(updatedQuote, latestConv?.collectedInfo);
    await conversationStore.updateDraft(sessionId, template);

    return NextResponse.json({
      addedCount: newItems.length,
      totalItems: mergedItems.length,
      addedNames: newItems.map((i) => i.name),
      conditions: result.conditions,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[extract-items] error:", errMsg, err);
    return NextResponse.json({ error: `품목 추출 실패: ${errMsg}` }, { status: 500 });
  }
}
