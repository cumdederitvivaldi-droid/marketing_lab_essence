/**
 * 카테고리 프롬프트 DB 로더 + 5분 TTL 메모리 캐시
 * 누적 정책 합집합 로드 지원
 */

import { supabase } from "@/lib/supabase/client";
import { loadPolicySections } from "./validate";
import type { CategoryPrompt } from "./types";

// ─── 캐시 ───

const CACHE_TTL = 5 * 60 * 1000; // 5분
let cache: Map<string, CategoryPrompt> | null = null;
let cacheTime = 0;

async function loadAllPrompts(): Promise<Map<string, CategoryPrompt>> {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  const { data, error } = await supabase
    .from("category_prompts")
    .select("*")
    .order("category_id");

  if (error) {
    console.error("[category-prompts] DB 로드 실패:", error.message);
    return cache ?? new Map();
  }

  const map = new Map<string, CategoryPrompt>();
  for (const row of data ?? []) {
    map.set(row.category_id, row as CategoryPrompt);
  }

  cache = map;
  cacheTime = now;
  return map;
}

// ─── Public API ───

/**
 * 특정 카테고리의 프롬프트 로드
 */
export async function getCategoryPrompt(
  categoryId: string
): Promise<CategoryPrompt | null> {
  const prompts = await loadAllPrompts();
  return prompts.get(categoryId) ?? null;
}

/**
 * 모든 카테고리 프롬프트 목록
 */
export async function getAllCategoryPrompts(): Promise<CategoryPrompt[]> {
  const prompts = await loadAllPrompts();
  return [...prompts.values()];
}

/**
 * 대화 누적 정책 합집합 로드
 *
 * 현재 카테고리 + 이전 카테고리들의 policy_sections를 합쳐서
 * 중복 없이 관련 정책 섹션을 모두 반환
 */
export async function getAccumulatedPolicySections(
  currentCategory: string,
  previousCategories: string[]
): Promise<string> {
  const prompts = await loadAllPrompts();
  const allCategories = new Set([currentCategory, ...previousCategories]);

  // 모든 카테고리의 policy_sections 합집합
  const allSectionNames = new Set<string>();
  for (const catId of allCategories) {
    const prompt = prompts.get(catId);
    if (prompt?.policy_sections) {
      for (const section of prompt.policy_sections) {
        allSectionNames.add(section);
      }
    }
  }

  if (allSectionNames.size === 0) return "";

  // 정책 문서에서 해당 섹션들 로드
  const sectionsMap = loadPolicySections();
  const parts: string[] = [];

  for (const name of allSectionNames) {
    const content = sectionsMap.get(name);
    if (content) {
      parts.push(content);
    }
  }

  return parts.join("\n\n---\n\n");
}

/**
 * 캐시 강제 무효화 (관리자가 프롬프트 수정 시)
 */
export function invalidateCache(): void {
  cache = null;
  cacheTime = 0;
}
