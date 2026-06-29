import { updateChatTags } from "./client";
import { supabase } from "@/lib/supabase/client";
import { createMessage } from "@/lib/ai/ai-client";

/**
 * 대화 내용을 분석하여 자동 태그를 생성하고 적용하는 공유 함수.
 * auto-tag API route + auto-close cron 에서 공통 사용.
 */
export async function autoTagChat(
  chatId: string,
  messages: Array<{ role: string; content: string }>,
  existingTags: string[]
): Promise<string[]> {
  // 1. DB에서 사용 가능한 태그 목록
  const { data: tagRows } = await supabase
    .from("consultation_tags")
    .select("tag, description, category")
    .eq("is_active", true);

  const availableTags = (tagRows ?? []).map((r) => `${r.tag} — ${r.description}`).join("\n");

  // 2. 대화 내용 (최근 30개)
  const conversation = messages
    .slice(-30)
    .map((m) => `${m.role === "user" ? "고객" : "상담사"}: ${m.content}`)
    .join("\n");

  // 3. Sonnet으로 자동 태깅
  const tagResponse = await createMessage({
    model: "sonnet",
    max_tokens: 200,
    system: "",
    messages: [
      {
        role: "user",
        content: `너는 커버링(생활폐기물 수거 서비스) CS 상담 태깅 전문가야.

## 태깅 절차

**1단계 — 봇 메시지 필터링**
아래는 봇 자동 메시지이므로 무시:
- "상담 과정에서 욕설이나 비속어가 포함될 경우"
- "연락처를 확인해주세요"
- "추가 문의 사항이 없으시다면 이번 상담은 종료하겠습니다"
- "오늘 상담은 전반적으로 만족스러우셨나요?"
- "선택해 주신 평가는 더 나은 서비스를 만드는데"
- 내부대화 · Summary bot 메시지

**2단계 — 핵심 파악**
봇 메시지를 제외하고, 고객의 실제 문의 내용과 상담사의 답변을 종합하여 핵심 주제를 한 줄로 정리해.
고객이 워크플로우 버튼만 누른 경우(예: "💸 요금 정책", "👩‍💻 매니저 연결") 이후 직접 작성한 텍스트 메시지가 진짜 문의임.

**3단계 — 태그 선택 (정확히 2개만)**
- "고객유형/기존" 또는 "고객유형/FIRST" 중 1개 (기존 이용자=기존, 첫 이용=FIRST)
- 고객의 최초 문의에 가장 맞는 태그 1개 (사용 가능한 태그 목록에서만)
- 고객이 텍스트 없이 워크플로우만 눌렀으면 → "고객유형/기존" 또는 "고객유형/FIRST" + "무응종결"

**⚠️ 태그 구분 가이드 (헷갈리기 쉬운 태그)**
대형폐기물 관련:
- "서비스이용/대형_수거품목" → 대형 물품(가전, 가구 등)이 수거 가능한지 확인하는 문의 (예: "에어프라이어도 수거돼요?", "소파 버릴 수 있나요?")
- "서비스이용/대형_수거신청" → 대형폐기물 수거를 신청하거나 대형 봉투/절차를 묻는 문의 (예: "대형 수거 신청하고 싶어요", "대형 봉투 어떻게 받나요?")
- "서비스이용/이용문의/수거품목" → 일반 생활폐기물(음식물, 재활용 등) 품목 관련 문의. 대형 물품 언급 시에는 대형_ 태그 사용

상담사 답변에서 "대형 봉투", "대형 커버링 봉투", "대형 폐기물 수거" 등이 언급되면 대형_ 계열 태그로 분류해야 함.

## 이미 달린 태그
${existingTags.length > 0 ? existingTags.join(", ") : "없음"}

## 사용 가능한 태그 목록
${availableTags}

## 상담 대화
${conversation}

## 응답 형식
태그 2개만 쉼표로 구분. 설명 없이 태그명만.`,
      },
    ],
  });

  const tagText = tagResponse.text;
  console.log("[CT] auto-tag raw:", tagText);

  const validTagList = (tagRows ?? []).map((r) => r.tag);
  const validTagNames = new Set(validTagList);

  // 퍼지 매칭: AI가 반환한 태그가 정확히 안 맞으면 가장 유사한 태그 찾기
  function fuzzyMatch(input: string): string | null {
    if (validTagNames.has(input)) return input;
    // 1. 부분 문자열 매칭 (입력이 태그에 포함되거나 태그가 입력에 포함)
    const partialMatch = validTagList.find((t) =>
      t.includes(input) || input.includes(t)
    );
    if (partialMatch) return partialMatch;
    // 2. 카테고리 동일 + 키워드 겹침 매칭
    const inputCategory = input.split("/")[0];
    const inputKeywords = input.replace(/[/_,]/g, " ").split(" ").filter(Boolean);
    let bestMatch: string | null = null;
    let bestScore = 0;
    for (const tag of validTagList) {
      const tagCategory = tag.split("/")[0];
      if (tagCategory !== inputCategory) continue;
      const tagKeywords = tag.replace(/[/_,]/g, " ").split(" ").filter(Boolean);
      const overlap = inputKeywords.filter((k: string) => tagKeywords.some((tk: string) => tk.includes(k) || k.includes(tk))).length;
      if (overlap > bestScore) { bestScore = overlap; bestMatch = tag; }
    }
    if (bestMatch && bestScore > 0) return bestMatch;
    // 3. 카테고리만 맞는 첫 번째 태그
    const categoryMatch = validTagList.find((t) => t.startsWith(inputCategory + "/"));
    return categoryMatch ?? null;
  }

  const rawTags = tagText.split(",").map((t) => t.trim()).filter(Boolean);
  const allTags = rawTags
    .map((t) => fuzzyMatch(t))
    .filter((t): t is string => t !== null);

  console.log("[CT] auto-tag rawTags:", rawTags, "→ matched:", allTags);

  // 고객유형 1개 + 문의태그 1개 = 정확히 2개
  const customerType = allTags.find((t) => t.startsWith("고객유형/")) ?? existingTags.find((t) => t.startsWith("고객유형/"));
  const inquiryTag = allTags.find((t) => !t.startsWith("고객유형/"));
  const finalTags = [customerType, inquiryTag].filter(Boolean) as string[];
  console.log("[CT] auto-tag allTags:", allTags, "customerType:", customerType, "inquiryTag:", inquiryTag);

  console.log("[CT] auto-tag final:", finalTags);

  if (finalTags.length > 0) {
    // 기존 태그 중 고객유형/문의태그 외의 것(차량등록, 확인중 등)은 보존
    const preservedTags = existingTags.filter((t) =>
      !t.startsWith("고객유형/") &&
      !validTagNames.has(t) || // DB에 없는 커스텀 태그 보존
      t === "차량등록" || t === "차량등록2" || t === "확인중" // 특수 태그 보존
    );
    // 중복 제거 후 병합: 보존태그 + AI 태그
    const mergedTags = [...new Set([...preservedTags, ...finalTags])];
    await updateChatTags(chatId, mergedTags);
    console.log("[CT] auto-tag done:", chatId, "merged:", mergedTags);
  }

  return finalTags;
}
