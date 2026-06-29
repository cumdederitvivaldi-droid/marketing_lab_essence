/**
 * 런치 AI 응답 생성
 *
 * 방문수거 lib/ai/claude.ts의 경량 버전
 * Phase: idle → order → confirm / inquiry
 */

import { createMessage } from "./ai-client";
import { buildLunchSystemPrompt, buildRegionPricesContext, type LunchPhase } from "./lunch-prompt";
import regionPricesJson from "@/lib/data/region-prices.json";

const regionPrices = regionPricesJson as { region: string; price1: number; lunchSmall?: number }[];

export interface LunchOrderSummary {
  orderNumber: string;
  date: string;
  pickupTime: string;
  boxCount: string | number;
  pickupAddress: string;
  totalAmount: number;
  status: string;
  sortingPrice?: number;
}

export interface LunchAIRequest {
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
  vendorName: string;
  isNewVendor: boolean;
  phase: LunchPhase;
  recentOrders?: LunchOrderSummary[];
}

export interface LunchOrderData {
  vendorName?: string;
  date?: string;
  timeAmPm?: string;
  timeHour?: string;
  timeMinute?: string;
  boxCount?: string;
  pickupAddress?: string;
  ownerPhone?: string;
  siteContact?: string;
  notes?: string;
  settlementType?: string;
}

export interface LunchAIResponse {
  response: string;
  intent: "AUTO_REPLY" | "NEED_HUMAN";
  phase: LunchPhase;
  orderData?: LunchOrderData;
}

/**
 * 런치 AI 응답 생성
 *
 * @returns AI 응답 텍스트 + 의도 분류 + Phase
 */
export async function generateLunchAIResponse(params: LunchAIRequest): Promise<LunchAIResponse> {
  const regionCtx = buildRegionPricesContext(regionPrices);

  const systemPrompt = buildLunchSystemPrompt({
    phase: params.phase,
    vendorName: params.vendorName,
    isNewVendor: params.isNewVendor,
    regionPricesContext: regionCtx,
    recentOrders: params.recentOrders,
  });

  // 대화 히스토리 (최근 60건 — 장기 대화 대응)
  const messages = [
    ...params.history.slice(-60),
    { role: "user" as const, content: params.userMessage },
  ];

  const result = await createMessage({
    model: "sonnet",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const raw = result.text;

  // 의도 태그 파싱
  const intentMatch = raw.match(/<intent>(AUTO_REPLY|NEED_HUMAN)<\/intent>/);
  const intent: "AUTO_REPLY" | "NEED_HUMAN" = intentMatch?.[1] === "NEED_HUMAN" ? "NEED_HUMAN" : "AUTO_REPLY";

  // Phase 태그 파싱
  const phaseMatch = raw.match(/<phase>(idle|order|confirm|inquiry)<\/phase>/);
  const phase: LunchPhase = (phaseMatch?.[1] as LunchPhase) ?? params.phase;

  // 주문 데이터 파싱 (confirm phase)
  let orderData: LunchOrderData | undefined;
  const orderMatch = raw.match(/<order_data>\s*([\s\S]*?)\s*<\/order_data>/);
  if (orderMatch) {
    try {
      orderData = JSON.parse(orderMatch[1]);
    } catch {
      console.warn("[lunch-ai] order_data JSON 파싱 실패");
    }
  }

  // 태그 제거한 깨끗한 응답
  const response = raw
    .replace(/<intent>.*?<\/intent>/g, "")
    .replace(/<phase>.*?<\/phase>/g, "")
    .replace(/<order_data>[\s\S]*?<\/order_data>/g, "")
    .trim();

  return { response, intent, phase, orderData };
}
