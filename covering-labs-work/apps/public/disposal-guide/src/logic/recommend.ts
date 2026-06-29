import type {
  AppState,
  Category,
  LengthRange,
  WeightRange,
  Recommendation,
  RecommendationAction,
  RecommendationCondition,
  RecommendationCopy,
  RecommendationRule,
  DiagnosisResult,
  DisposalGuideConfig,
} from '../types';
import { detectSpecialItem } from '../data/specialItems';
import {
  DEFAULT_GUIDE_CONFIG,
  DEFAULT_RECOMMENDATION_COPY,
  DEFAULT_RECOMMENDATION_RULES,
} from '../data/defaultGuideConfig';

export type RecommendationFallbackReason = 'no_matching_rule';

export type HeavySplitReason =
  | 'explicit_can_split'
  | 'explicit_cannot_split'
  | 'under_80_unknown_fallback'
  | 'category_bedding_can_split'
  | 'category_bedding_single_cannot_split'
  | 'category_appliance_cannot_split'
  | 'around_80_unknown_can_split'
  | 'unknown_cannot_split';

export interface RecommendationTrace {
  recommendation: Recommendation;
  matchedRuleId?: string;
  matchedPriority?: number;
  action?: RecommendationAction;
  fallbackReason?: RecommendationFallbackReason;
  heavySplitReason?: HeavySplitReason;
}

// ── 길이 슬라이더 cm → 구간 변환 ─────────────────────────
export function resolveLengthRange(lengthCm: number): LengthRange {
  if (lengthCm < 75) return 'UNDER_80';
  if (lengthCm <= 85) return 'AROUND_80';
  if (lengthCm <= 140) return 'OVER_80_UNDER_140';
  if (lengthCm <= 150) return 'OVER_140_UNDER_150';
  return 'OVER_150';
}

// ── 체감 무게 → 무게 구간 ─────────────────────────────
export function resolveWeightRange(state: AppState): WeightRange {
  if (state.weightRange !== 'UNKNOWN') return state.weightRange;
  if (state.perceivedWeight === 'EASY_TO_LIFT') return 'UNDER_15';
  if (state.perceivedWeight === 'HARD_TO_HOLD_LONG') return 'OVER_15_UNDER_25';
  if (state.perceivedWeight === 'HARD_TO_LIFT') return 'OVER_25';
  return 'UNKNOWN';
}

export function hasFoodWaste(state: AppState): boolean {
  return state.hasFoodWaste;
}

// 일반/음식물/재활용 카테고리만 단독 선택한 경우
export function isGeneralCategoryOnly(categories: Category[]): boolean {
  return categories.length === 1 && categories[0] === 'GENERAL_FOOD_RECYCLE';
}

// 의류·이불·잡화처럼 무게를 봉투 여러 장에 나눠 담을 수 있는 카테고리만 선택한 경우
// (가전·가구는 분할 불가, ETC는 불확실하므로 둘 다 포함되면 false)
function isSplittableCategorySelection(categories: Category[]): boolean {
  if (categories.length === 0) return false;
  if (!categories.includes('BEDDING_CLOTHES_MISC')) return false;
  if (categories.includes('APPLIANCE_FURNITURE')) return false;
  if (categories.includes('ETC')) return false;
  return true;
}

function isBagAcceptableLength(length: LengthRange): boolean {
  return (
    length === 'UNDER_80' ||
    length === 'AROUND_80' ||
    length === 'OVER_80_UNDER_140'
  );
}

function isRecommendationAction(value: string): value is RecommendationAction {
  return (
    value === 'VISIT_PICKUP' ||
    value === 'LARGE_COVERING_BAG' ||
    value === 'GENERAL_BAG_MULTIPLE' ||
    value === 'GENERAL_BAG_SINGLE' ||
    value === 'HEAVY_SPLIT_DECISION'
  );
}

export function needsLengthQuestion(state: AppState): boolean {
  return !isGeneralCategoryOnly(state.categories);
}

// 무거운 짐(15~25kg)이면서 길이가 봉투 가능 영역이면 split 질문
export function needsSplittable(state: AppState): boolean {
  const weight = resolveWeightRange(state);
  if (weight !== 'OVER_15_UNDER_25') return false;
  if (state.lengthRange === 'OVER_140_UNDER_150') return false;
  if (state.lengthRange === 'OVER_150') return false;
  return true;
}

// 카테고리 기반 splittable UNKNOWN fallback
function heavySplitFallbackReason(state: AppState): HeavySplitReason {
  const cats = state.categories;
  if (cats.length === 1 && cats[0] === 'BEDDING_CLOTHES_MISC') {
    return 'category_bedding_single_cannot_split';
  }
  if (cats.includes('BEDDING_CLOTHES_MISC') && isSplittableCategorySelection(cats)) {
    return 'category_bedding_can_split';
  }
  if (cats.includes('APPLIANCE_FURNITURE')) return 'category_appliance_cannot_split';
  if (state.lengthRange === 'AROUND_80') return 'around_80_unknown_can_split';
  return 'unknown_cannot_split';
}

// heavy 분기 공통 처리: split 답변 + fallback
function decideHeavyWithReason(state: AppState): {
  recommendation: Recommendation;
  heavySplitReason: HeavySplitReason;
} {
  const split = state.splittableStatus;
  if (split === 'CAN_SPLIT') {
    return {
      recommendation: 'GENERAL_BAG_MULTIPLE',
      heavySplitReason: 'explicit_can_split',
    };
  }
  if (split === 'CANNOT_SPLIT') {
    return {
      recommendation: 'LARGE_COVERING_BAG',
      heavySplitReason: 'explicit_cannot_split',
    };
  }
  if ((split === undefined || split === 'UNKNOWN') && state.lengthRange === 'UNDER_80') {
    return {
      recommendation: 'GENERAL_BAG_MULTIPLE',
      heavySplitReason: 'under_80_unknown_fallback',
    };
  }

  const heavySplitReason = heavySplitFallbackReason(state);
  return {
    recommendation:
      heavySplitReason === 'category_bedding_can_split' ||
      heavySplitReason === 'around_80_unknown_can_split'
        ? 'GENERAL_BAG_MULTIPLE'
        : 'LARGE_COVERING_BAG',
    heavySplitReason,
  };
}

function decideHeavy(state: AppState): Recommendation {
  return decideHeavyWithReason(state).recommendation;
}

function matchesCategoryMode(condition: RecommendationCondition, state: AppState): boolean {
  if (!condition.categoryMode) return true;
  if (condition.categoryMode === 'GENERAL_ONLY') {
    return isGeneralCategoryOnly(state.categories);
  }
  if (condition.categoryMode === 'SPLITTABLE_ONLY') {
    return isSplittableCategorySelection(state.categories);
  }
  return false;
}

function matchesCondition(condition: RecommendationCondition, state: AppState): boolean {
  if (condition.__invalid) return false;

  if (condition.anyOf && !condition.anyOf.some((item) => matchesCondition(item, state))) {
    return false;
  }

  if (condition.allOf && !condition.allOf.every((item) => matchesCondition(item, state))) {
    return false;
  }

  if (condition.not && matchesCondition(condition.not, state)) {
    return false;
  }

  if (!matchesCategoryMode(condition, state)) return false;

  if (condition.bagAcceptableLength && !isBagAcceptableLength(state.lengthRange)) {
    return false;
  }

  if (condition.lengthIn && !condition.lengthIn.includes(state.lengthRange)) {
    return false;
  }

  if (condition.weightIn && !condition.weightIn.includes(resolveWeightRange(state))) {
    return false;
  }

  if (
    condition.perceivedWeightIn &&
    (!state.perceivedWeight || !condition.perceivedWeightIn.includes(state.perceivedWeight))
  ) {
    return false;
  }

  return true;
}

function resolveActionWithTrace(action: RecommendationAction, state: AppState): RecommendationTrace {
  if (action === 'HEAVY_SPLIT_DECISION') {
    const heavy = decideHeavyWithReason(state);
    return {
      recommendation: heavy.recommendation,
      action,
      heavySplitReason: heavy.heavySplitReason,
    };
  }

  return {
    recommendation: action,
    action,
  };
}

function resolveAction(action: RecommendationAction, state: AppState): Recommendation {
  return resolveActionWithTrace(action, state).recommendation;
}

function sortedRules(rules: RecommendationRule[]): RecommendationRule[] {
  return [...rules]
    .filter((rule) => isRecommendationAction(rule.action))
    .sort((a, b) => a.priority - b.priority);
}

// ── 추천 로직 ──────────────────────────────────────────────
export function recommend(
  state: AppState,
  rules: RecommendationRule[] = DEFAULT_RECOMMENDATION_RULES,
): Recommendation {
  return recommendWithTrace(state, rules).recommendation;
}

export function recommendWithTrace(
  state: AppState,
  rules: RecommendationRule[] = DEFAULT_RECOMMENDATION_RULES,
): RecommendationTrace {
  for (const rule of sortedRules(rules)) {
    if (matchesCondition(rule.condition, state)) {
      const trace = resolveActionWithTrace(rule.action, state);
      return {
        ...trace,
        matchedRuleId: rule.id,
        matchedPriority: rule.priority,
      };
    }
  }
  return {
    recommendation: 'GENERAL_BAG_SINGLE',
    fallbackReason: 'no_matching_rule',
  };
}

// ── 결과 문구 ──────────────────────────────────────────────
function buildVisitPickupDescription(state: AppState): string {
  if (state.perceivedWeight === 'HARD_TO_LIFT') {
    return '혼자 들기 어려운 무게라 봉투에 담기보다는 문 앞 방문수거를 추천해요.';
  }
  const weight = resolveWeightRange(state);
  if (weight === 'OVER_25') {
    return '총 무게가 25kg을 넘어 봉투에 담기 어려워요. 문 앞 방문수거가 안전해요.';
  }
  if (state.lengthRange === 'OVER_150') {
    return '길이가 150cm를 넘어 봉투에 담을 수 없어요. 문 앞 방문수거로 처리해 주세요.';
  }
  return '봉투에 담기보다 문 앞 방문수거로 처리하는 것이 안전해요.';
}

function buildCaution(rec: Recommendation, state: AppState): string | undefined {
  const lines: string[] = [];

  if (state.hasFoodWaste) {
    if (rec === 'VISIT_PICKUP') {
      lines.push('음식물은 방문수거 물품과 섞지 말고 일반 커버링 봉투로 따로 분리해서 버려주세요.');
    } else if (rec === 'LARGE_COVERING_BAG') {
      lines.push('단, 음식물만 일반 커버링 봉투로 분리해서 버려주세요.');
    } else {
      lines.push('음식물은 다른 물건과 섞지 말고 일반 커버링 봉투에 따로 분리해서 담아주세요.');
    }
  }

  const special = detectSpecialItem(state.itemDescription);
  if (special) {
    lines.push(special.message);
  }

  return lines.length > 0 ? lines.join('\n') : undefined;
}

function buildHint(rec: Recommendation, state: AppState): string | undefined {
  // 141~150cm → 대형 봉투 사양 확인
  if (state.lengthRange === 'OVER_140_UNDER_150' && rec === 'LARGE_COVERING_BAG') {
    return '대형 커버링 봉투(220L) 사양에 안 맞으면 방문수거를 고려해 주세요. 사진을 찍어 채널톡으로 문의해 주셔도 좋아요.';
  }

  // BEDDING + GENERAL_BAG_MULTIPLE → 220L 보조 CTA
  if (
    rec === 'GENERAL_BAG_MULTIPLE' &&
    state.categories.includes('BEDDING_CLOTHES_MISC')
  ) {
    return '한 번에 정리하고 싶다면 220L 대형 커버링 봉투도 활용할 수 있어요.';
  }

  return undefined;
}

function resultCopyFor(
  rec: Recommendation,
  copy: Record<Recommendation, RecommendationCopy>,
): RecommendationCopy {
  return copy[rec] ?? DEFAULT_RECOMMENDATION_COPY[rec];
}

function visitPickupDescriptionFor(
  state: AppState,
  copy: RecommendationCopy,
): string {
  const configuredDescription = copy.description.trim();
  if (
    configuredDescription &&
    configuredDescription !== DEFAULT_RECOMMENDATION_COPY.VISIT_PICKUP.description
  ) {
    return configuredDescription;
  }
  return buildVisitPickupDescription(state);
}

export function buildResult(
  state: AppState,
  config: DisposalGuideConfig = DEFAULT_GUIDE_CONFIG,
): DiagnosisResult {
  const rec = recommend(state, config.recommendationRules);
  const copy = resultCopyFor(rec, config.recommendationCopy);
  const caution = buildCaution(rec, state);
  const hint = buildHint(rec, state);

  if (rec === 'VISIT_PICKUP') {
    return {
      recommendation: rec,
      title: copy.title,
      description: visitPickupDescriptionFor(state, copy),
      caution,
      hint,
      cta: copy.cta,
    };
  }

  return {
    recommendation: rec,
    title: copy.title,
    description: copy.description,
    caution,
    hint,
    cta: copy.cta,
  };
}
