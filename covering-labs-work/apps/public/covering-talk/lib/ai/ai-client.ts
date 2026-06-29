/**
 * 통합 AI 클라이언트 — Anthropic / OpenAI 런타임 전환
 *
 * app_settings.ai_provider 값("anthropic" | "openai")에 따라 자동 라우팅.
 * 설정 페이지에서 변경 시 30초 내 반영 (캐시 TTL).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { supabase } from "@/lib/supabase/client";

// ── Provider 타입 ──
export type AIProvider = "anthropic" | "openai";

// ── 클라이언트 인스턴스 (lazy 초기화 — 키 없어도 빌드 가능) ──
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getOpenAIClient(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// ── Provider 캐시 (30초) ──
let cachedProvider: AIProvider | null = null;
let providerExpiry = 0;
const CACHE_TTL = 30_000;

export async function getProvider(): Promise<AIProvider> {
  if (cachedProvider && Date.now() < providerExpiry) return cachedProvider;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_provider")
      .single();
    cachedProvider = data?.value === "openai" ? "openai" : "anthropic";
  } catch {
    cachedProvider = "anthropic";
  }
  providerExpiry = Date.now() + CACHE_TTL;
  return cachedProvider;
}

/** 설정 변경 시 즉시 캐시 무효화 */
export function invalidateProviderCache() {
  cachedProvider = null;
  providerExpiry = 0;
}

// ── 모델 매핑 ──
const MODEL_MAP: Record<string, Record<AIProvider, string>> = {
  // short names
  sonnet: { anthropic: "claude-sonnet-4-6", openai: "gpt-5.4" },
  haiku: { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-5.4-mini" },
  opus: { anthropic: "claude-opus-4-7", openai: "gpt-5.4" },
  // full anthropic names → openai equivalents
  "claude-sonnet-4-6": { anthropic: "claude-sonnet-4-6", openai: "gpt-5.4" },
  "claude-haiku-4-5-20251001": { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-5.4-mini" },
  "claude-opus-4-7": { anthropic: "claude-opus-4-7", openai: "gpt-5.4" },
};

function resolveModel(model: string, provider: AIProvider): string {
  return MODEL_MAP[model]?.[provider] ?? (provider === "openai" ? "gpt-5.4" : model);
}

// ── 통합 인터페이스 ──

/** system 블록 (Anthropic 형식 호환) */
export type SystemBlock = string | { type: "text"; text: string; cache_control?: { type: string } }[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MessageContent = string | any[];

export interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system?: SystemBlock;
  messages: { role: "user" | "assistant"; content: MessageContent }[];
  temperature?: number;
}

export interface MessageResponse {
  text: string; // 첫 번째 텍스트 블록
  content: { type: string; text: string }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * 통합 메시지 생성 — 현재 provider 설정에 따라 자동 라우팅
 */
export async function createMessage(params: CreateMessageParams): Promise<MessageResponse> {
  const provider = await getProvider();
  if (provider === "openai") return callOpenAI(params);
  return callAnthropic(params);
}

// ── Anthropic ──
async function callAnthropic(params: CreateMessageParams): Promise<MessageResponse> {
  const systemParam = !params.system ? ""
    : typeof params.system === "string" ? params.system
    : params.system as Anthropic.Messages.TextBlockParam[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await getAnthropicClient().messages.create({
    model: resolveModel(params.model, "anthropic"),
    max_tokens: params.max_tokens,
    system: systemParam,
    messages: params.messages as any,
    ...(params.temperature !== undefined && { temperature: params.temperature }),
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";
  const usage = response.usage as unknown as Record<string, number>;

  return {
    text,
    content: response.content.map((b) => ({
      type: b.type,
      text: "text" in b ? b.text : "",
    })),
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens,
      cache_read_input_tokens: usage.cache_read_input_tokens,
    },
  };
}

// ── OpenAI ──

/** Anthropic 메시지 content를 OpenAI 형식으로 변환 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertContentForOpenAI(content: MessageContent): any {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content);
  // 배열 → OpenAI content parts 변환
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return content.map((block: any) => {
    if (block.type === "text") return { type: "text", text: block.text };
    // Anthropic image → OpenAI image_url
    if (block.type === "image" && block.source?.url) {
      return { type: "image_url", image_url: { url: block.source.url } };
    }
    if (block.type === "image_url") return block; // 이미 OpenAI 형식
    return { type: "text", text: JSON.stringify(block) }; // fallback
  });
}

async function callOpenAI(params: CreateMessageParams): Promise<MessageResponse> {
  // system → 단일 문자열 변환
  let systemText = "";
  if (typeof params.system === "string") {
    systemText = params.system;
  } else if (Array.isArray(params.system)) {
    systemText = params.system.map((b) => b.text).join("\n\n");
  }

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemText) messages.push({ role: "system", content: systemText });
  for (const msg of params.messages) {
    const converted = convertContentForOpenAI(msg.content);
    messages.push({ role: msg.role, content: converted } as OpenAI.ChatCompletionMessageParam);
  }

  const response = await getOpenAIClient().chat.completions.create({
    model: resolveModel(params.model, "openai"),
    max_completion_tokens: params.max_tokens,
    messages,
    ...(params.temperature !== undefined && { temperature: params.temperature }),
  });

  const text = response.choices[0]?.message?.content ?? "";

  return {
    text,
    content: [{ type: "text", text }],
    usage: {
      input_tokens: response.usage?.prompt_tokens ?? 0,
      output_tokens: response.usage?.completion_tokens ?? 0,
    },
  };
}
