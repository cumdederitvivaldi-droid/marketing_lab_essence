/**
 * 커버링 AI 상담 추천 시스템 — 타입 정의
 */

export interface ScoredCandidate {
  id: number;
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  category: string | null;
  managerName: string | null;
  similarity: number; // 0~1 코사인 유사도
  similarityScore: number; // 0~45
  tagScore: number; // 0~30
  categoryScore: number; // 0~25
  totalScore: number; // 0~100
  chatCreatedAt: string | null;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number; // 0~100
  issues: string[];
  suggestedFix?: string;
}

export interface SuggestResult {
  suggestions: Array<
    ScoredCandidate & {
      validation: ValidationResult;
    }
  >;
  classifiedCategory: string;
  normalizedMessage: string;
  canAnswer: boolean;
  reason?: string; // AI답변 불가 사유
  summary?: string; // 고객 문의 요약 (답변 불가 시)
  accumulatedCategories: string[]; // 대화 누적 카테고리
  timings?: Record<string, number>; // 각 단계별 소요시간 (ms)
  debug?: {
    allCandidates: ScoredCandidate[];
    inputTags: string[];
    embeddingDimension: number;
    matchCount: number;
    processingTimeMs: number;
    timings?: Record<string, number>;
  };
}

export interface CategoryPrompt {
  id: number;
  category_id: string;
  category_name: string;
  parent_category: string | null;
  prompt_rules: string;
  policy_sections: string[];
  ai_scope_note: string | null;
  updated_at: string;
}

export interface ConsultationMatch {
  id: number;
  chat_id: string;
  question_text: string;
  answer_text: string;
  tag: string | null;
  category: string | null;
  manager_name: string | null;
  similarity: number;
  chat_created_at: string | null;
}

// 스코어링 가중치 (테스트 기반 튜닝 가능)
export const SCORING_WEIGHTS = {
  similarity: { max: 45, threshold: 0.5 },
  tag: { exact: 30, partial: 20, topLevel: 10 },
  category: { exact: 25 },
  minTotalScore: 40, // 이 점수 미만이면 추천하지 않음
} as const;
