import { conversationStore, Quote, QuoteItem } from "@/lib/store/conversations";
import { getTripFee, calcVat, ceilTo1000 } from "@/lib/utils/trip-fee";
import { normalizeKeyword } from "@/lib/utils/item-normalizer";

/** Phase 1 고정 템플릿 — AI 호출 없이 무조건 이 메시지를 보냄 */
export async function getPhase1Template(): Promise<string> {
  const { getWorkflowConfig, resolveGreeting } = await import("@/lib/utils/workflow-config");
  const config = await getWorkflowConfig();
  return resolveGreeting(config.greeting);
}

/** 견적 데이터 → quoteContext 문자열 (품목별 단가 비공개, 총 견적만 포함) */
export function buildQuoteContext(quote: Quote | null): string | undefined {
  if (!quote || quote.items.length === 0) return undefined;
  const itemLines = quote.items.map((i) =>
    `- ${i.name} x${i.quantity}`
  ).join("\n");
  return `품목:\n${itemLines}\n총 견적: ${quote.totalPrice.toLocaleString()}원 (부가세 포함)`;
}

// 동의어 정규화 → lib/utils/item-normalizer.ts로 이관 (import 참조)

// searchProduct() → lib/utils/product-search.ts의 searchProductByEmbedding()으로 이관됨

/** 대화에서 품목을 추출하고 DB에서 매칭하여 견적 자동 생성 (v2: 프롬프트 기반) */
export async function autoMapQuoteItems(
  sessionId: string,
  messages: { role: string; content: string }[]
) {
  // 운영자가 수동 편집한 견적은 자동 매핑으로 덮어쓰지 않음
  const preCheck = await conversationStore.getById(sessionId);
  if (preCheck?.quote?.manuallyEdited) {
    console.log(`[AutoQuote] ${sessionId}: 수동 편집된 견적 보호 — 자동 매핑 스킵`);
    return;
  }

  // 재인입 시 메시지 경계 적용: 이전 상담의 품목이 재추출되지 않도록 경계 이후만 사용
  const reentryIdx = (preCheck?.collectedInfo as unknown as Record<string, unknown>)?._reentryMsgIdx as number | undefined;
  const relevantMessages = reentryIdx != null && reentryIdx > 0
    ? messages.slice(reentryIdx)
    : messages;

  if (reentryIdx != null && reentryIdx > 0) {
    console.log(`[AutoQuote] 재인입 경계 적용: ${messages.length}개 중 ${relevantMessages.length}개만 사용 (idx=${reentryIdx})`);
  }

  const userText = relevantMessages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");

  if (!userText.trim()) return;

  const { extractAndMatchItems } = await import("@/lib/ai/product-prompt");
  const result = await extractAndMatchItems(userText);
  console.log(`[AutoQuote] ${sessionId}: v2 매칭 ${result.items.length}건:`, JSON.stringify(result.items.map(i => `${i.matchedName}(${i.confidence})`)));
  if (result.items.length === 0) return;

  const quoteItems: QuoteItem[] = result.items.map((item) => ({
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
  if (quoteItems.length === 0) return;

  const conv = await conversationStore.getById(sessionId);
  const existingItems = conv?.quote?.items ?? [];

  // ── 카테고리 기반 스마트 병합 ──
  // 같은 카테고리(식탁, 소파 등)의 품목은 최신 추출 결과로 교체 → 중복 방지
  // "기타"(DB 미등록) 품목은 이름 기반으로 개별 관리
  const newByKey = new Map<string, QuoteItem[]>();
  for (const item of quoteItems) {
    const key = item.category === "기타"
      ? `기타:${normalizeKeyword(item.name)}`
      : normalizeKeyword(item.category);
    const list = newByKey.get(key) ?? [];
    list.push(item);
    newByKey.set(key, list);
  }

  // 기존 품목을 키 기준으로 빠르게 조회할 수 있도록 맵 구축
  const existingByKey = new Map<string, QuoteItem>();
  for (const existing of existingItems) {
    const key = existing.category === "기타"
      ? `기타:${normalizeKeyword(existing.name)}`
      : normalizeKeyword(existing.category);
    existingByKey.set(key, existing);
  }

  const processedKeys = new Set<string>();
  const allItems: QuoteItem[] = [];

  // 1. 새로 추출된 품목 추가 (최신 사양 반영)
  //    단, 기존에 aiSuggestion/productId가 있던 "기타" 품목은 보존
  for (const [key, items] of newByKey) {
    const existingItem = existingByKey.get(key);
    for (const newItem of items) {
      if (newItem.category === "기타" && existingItem) {
        // 기존에 aiSuggestion이 있었는데 새 추출에 없으면 → 기존 것 보존
        if (!newItem.aiSuggestion && existingItem.aiSuggestion) {
          newItem.aiSuggestion = existingItem.aiSuggestion;
          newItem.volumeM3 = newItem.volumeM3 || existingItem.volumeM3;
          newItem.unitPrice = newItem.unitPrice || existingItem.unitPrice;
          newItem.note = newItem.note || existingItem.note;
        }
        // 기존에 productId가 있었으면 보존
        if (!newItem.productId && existingItem.productId) {
          newItem.productId = existingItem.productId;
          newItem.name = existingItem.name;
          newItem.category = existingItem.category;
          newItem.volumeM3 = existingItem.volumeM3;
          newItem.unitPrice = existingItem.unitPrice;
          newItem.note = existingItem.note;
        }
      }
      allItems.push(newItem);
    }
    processedKeys.add(key);
  }

  // 2. 기존 품목 중 새 추출에 없는 카테고리만 유지
  for (const existing of existingItems) {
    const key = existing.category === "기타"
      ? `기타:${normalizeKeyword(existing.name)}`
      : normalizeKeyword(existing.category);
    if (!processedKeys.has(key)) {
      allItems.push(existing);
    }
  }

  const totalItemsPrice = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const totalVolume = allItems.reduce((sum, i) => sum + i.volumeM3 * i.quantity, 0);

  // 출장비: 최신 conv에서 district를 다시 읽어 계산 (병렬 infoExtraction 완료 반영)
  // 출장비는 항상 1명 기준 고정
  const freshConv = await conversationStore.getById(sessionId);
  const district = freshConv?.collectedInfo?.district ?? conv?.collectedInfo?.district ?? null;
  const workerCount = 1;
  const tripFee = getTripFee(district, workerCount);

  const ladderFee = conv?.quote?.ladderFee ?? 0;
  const subtotal = totalItemsPrice + ladderFee + tripFee;
  const vatAmount = calcVat(subtotal);

  const quote: Quote = {
    items: allItems,
    subtotalVolume: totalVolume,
    basePrice: totalItemsPrice,
    ladderFee,
    tripFee,
    workerCount,
    extraFees: conv?.quote?.extraFees ?? [],
    vatAmount,
    totalPrice: ceilTo1000(subtotal + vatAmount),
    createdAt: conv?.quote?.createdAt ?? Date.now(),
    sentAt: conv?.quote?.sentAt ?? null,
    editLog: conv?.quote?.editLog ?? [],
  };

  await conversationStore.updateQuote(sessionId, quote);
  console.log(`[AutoQuote] ${sessionId}: ${allItems.length}개 품목 견적 업데이트 완료`);
}
