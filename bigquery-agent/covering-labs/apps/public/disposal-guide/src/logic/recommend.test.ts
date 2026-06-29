import {
  resolveLengthRange,
  resolveWeightRange,
  hasFoodWaste,
  isGeneralCategoryOnly,
  needsSplittable,
  needsLengthQuestion,
  recommend,
  recommendWithTrace,
  buildResult,
} from './recommend';
import type { AppState, RecommendationCondition } from '../types';
import { DEFAULT_GUIDE_CONFIG } from '../data/defaultGuideConfig';

const base: AppState = {
  screen: 'result',
  categories: ['BEDDING_CLOTHES_MISC'],
  hasFoodWaste: false,
  itemDescription: '',
  lengthRange: 'UNDER_80',
  weightRange: 'UNDER_15',
};

const generalBase: AppState = {
  ...base,
  categories: ['GENERAL_FOOD_RECYCLE'],
};

describe('resolveLengthRange', () => {
  it('< 75 → UNDER_80', () => {
    expect(resolveLengthRange(10)).toBe('UNDER_80');
    expect(resolveLengthRange(74)).toBe('UNDER_80');
  });
  it('75 ~ 85 → AROUND_80', () => {
    expect(resolveLengthRange(75)).toBe('AROUND_80');
    expect(resolveLengthRange(80)).toBe('AROUND_80');
    expect(resolveLengthRange(85)).toBe('AROUND_80');
  });
  it('86 ~ 140 → OVER_80_UNDER_140', () => {
    expect(resolveLengthRange(86)).toBe('OVER_80_UNDER_140');
    expect(resolveLengthRange(140)).toBe('OVER_80_UNDER_140');
  });
  it('141 ~ 150 → OVER_140_UNDER_150', () => {
    expect(resolveLengthRange(141)).toBe('OVER_140_UNDER_150');
    expect(resolveLengthRange(150)).toBe('OVER_140_UNDER_150');
  });
  it('> 150 → OVER_150', () => {
    expect(resolveLengthRange(151)).toBe('OVER_150');
    expect(resolveLengthRange(160)).toBe('OVER_150');
  });
});

describe('resolveWeightRange', () => {
  it('returns explicit weightRange when not UNKNOWN', () => {
    expect(resolveWeightRange({ ...base, weightRange: 'OVER_25' })).toBe('OVER_25');
  });
  it('maps EASY_TO_LIFT → UNDER_15', () => {
    expect(resolveWeightRange({ ...base, weightRange: 'UNKNOWN', perceivedWeight: 'EASY_TO_LIFT' })).toBe('UNDER_15');
  });
  it('maps HARD_TO_HOLD_LONG → OVER_15_UNDER_25', () => {
    expect(resolveWeightRange({ ...base, weightRange: 'UNKNOWN', perceivedWeight: 'HARD_TO_HOLD_LONG' })).toBe('OVER_15_UNDER_25');
  });
  it('maps HARD_TO_LIFT → OVER_25', () => {
    expect(resolveWeightRange({ ...base, weightRange: 'UNKNOWN', perceivedWeight: 'HARD_TO_LIFT' })).toBe('OVER_25');
  });
});

describe('hasFoodWaste', () => {
  it('true when hasFoodWaste true', () => {
    expect(hasFoodWaste({ ...base, hasFoodWaste: true })).toBe(true);
  });
  it('false otherwise', () => {
    expect(hasFoodWaste(base)).toBe(false);
  });
});

describe('isGeneralCategoryOnly', () => {
  it('true only when single GENERAL_FOOD_RECYCLE', () => {
    expect(isGeneralCategoryOnly(['GENERAL_FOOD_RECYCLE'])).toBe(true);
  });
  it('false when combined with another category', () => {
    expect(isGeneralCategoryOnly(['GENERAL_FOOD_RECYCLE', 'APPLIANCE_FURNITURE'])).toBe(false);
  });
  it('false for empty array', () => {
    expect(isGeneralCategoryOnly([])).toBe(false);
  });
});

describe('needsLengthQuestion', () => {
  it('false when only GENERAL_FOOD_RECYCLE', () => {
    expect(needsLengthQuestion({ ...base, categories: ['GENERAL_FOOD_RECYCLE'] })).toBe(false);
  });
  it('true otherwise', () => {
    expect(needsLengthQuestion({ ...base, categories: ['APPLIANCE_FURNITURE'] })).toBe(true);
    expect(needsLengthQuestion({ ...base, categories: ['ETC'] })).toBe(true);
  });
});

describe('needsSplittable', () => {
  it('true for UNDER_80 + heavy', () => {
    expect(needsSplittable({ ...base, lengthRange: 'UNDER_80', weightRange: 'OVER_15_UNDER_25' })).toBe(true);
  });
  it('true for AROUND_80 + heavy', () => {
    expect(needsSplittable({ ...base, lengthRange: 'AROUND_80', weightRange: 'OVER_15_UNDER_25' })).toBe(true);
  });
  it('true for OVER_80_UNDER_140 + heavy', () => {
    expect(needsSplittable({ ...base, lengthRange: 'OVER_80_UNDER_140', weightRange: 'OVER_15_UNDER_25' })).toBe(true);
  });
  it('false for OVER_140_UNDER_150 (대형 봉투 우선)', () => {
    expect(needsSplittable({ ...base, lengthRange: 'OVER_140_UNDER_150', weightRange: 'OVER_15_UNDER_25' })).toBe(false);
  });
  it('false for OVER_150 (방문수거 확정)', () => {
    expect(needsSplittable({ ...base, lengthRange: 'OVER_150', weightRange: 'OVER_15_UNDER_25' })).toBe(false);
  });
  it('false when light', () => {
    expect(needsSplittable({ ...base, lengthRange: 'AROUND_80', weightRange: 'UNDER_15' })).toBe(false);
  });
});

describe('recommend - 우선순위', () => {
  it('VISIT_PICKUP for OVER_25 (가전·가구)', () => {
    expect(recommend({ ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'OVER_25' })).toBe('VISIT_PICKUP');
  });
  it('VISIT_PICKUP for HARD_TO_LIFT (가전·가구)', () => {
    expect(recommend({ ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'UNKNOWN', perceivedWeight: 'HARD_TO_LIFT' })).toBe('VISIT_PICKUP');
  });
  it('VISIT_PICKUP for OVER_150', () => {
    expect(recommend({ ...base, lengthRange: 'OVER_150' })).toBe('VISIT_PICKUP');
  });
});

describe('recommend - DB rule config', () => {
  it('uses supplied recommendation rules before fallback rules', () => {
    expect(
      recommend(base, [
        {
          id: 'force-visit-pickup',
          priority: 1,
          condition: {},
          action: 'VISIT_PICKUP',
        },
      ]),
    ).toBe('VISIT_PICKUP');
  });

  it('supports DB heavy split decision action', () => {
    expect(
      recommend(
        {
          ...base,
          lengthRange: 'UNDER_80',
          weightRange: 'OVER_15_UNDER_25',
          splittableStatus: 'CANNOT_SPLIT',
        },
        [
          {
            id: 'heavy-split',
            priority: 1,
            condition: { weightIn: ['OVER_15_UNDER_25'] },
            action: 'HEAVY_SPLIT_DECISION',
          },
        ],
      ),
    ).toBe('LARGE_COVERING_BAG');
  });

  it('defaults DB heavy split UNKNOWN + UNDER_80 to multiple bags', () => {
    expect(
      recommend(
        {
          ...base,
          categories: ['APPLIANCE_FURNITURE'],
          lengthRange: 'UNDER_80',
          weightRange: 'OVER_15_UNDER_25',
          splittableStatus: 'UNKNOWN',
        },
        [
          {
            id: 'heavy-split',
            priority: 1,
            condition: { weightIn: ['OVER_15_UNDER_25'] },
            action: 'HEAVY_SPLIT_DECISION',
          },
        ],
      ),
    ).toBe('GENERAL_BAG_MULTIPLE');
  });

  it('never matches invalid DB rule sentinel', () => {
    const invalidCondition: RecommendationCondition = { __invalid: true };

    expect(
      recommend(base, [
        {
          id: 'invalid-catch-all',
          priority: 1,
          condition: invalidCondition,
          action: 'VISIT_PICKUP',
        },
        {
          id: 'valid-default',
          priority: 2,
          condition: {},
          action: 'GENERAL_BAG_SINGLE',
        },
      ]),
    ).toBe('GENERAL_BAG_SINGLE');
  });
});

describe('recommendWithTrace', () => {
  it('returns the matched rule for a default recommendation', () => {
    const trace = recommendWithTrace(base);

    expect(trace).toMatchObject({
      recommendation: 'GENERAL_BAG_SINGLE',
      matchedRuleId: 'bag-length-default',
      matchedPriority: 110,
      action: 'GENERAL_BAG_SINGLE',
    });
  });

  it('returns the UNDER_80 unknown fallback reason when split status is missing', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'UNDER_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: undefined,
    });

    expect(trace).toMatchObject({
      recommendation: 'GENERAL_BAG_MULTIPLE',
      matchedRuleId: 'bag-length-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'under_80_unknown_fallback',
    });
  });

  it('does not treat mixed bedding and furniture categories as splittable by category fallback beyond UNDER_80', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'APPLIANCE_FURNITURE'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: undefined,
    });

    expect(trace).toMatchObject({
      recommendation: 'LARGE_COVERING_BAG',
      matchedRuleId: 'length-86-140-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'category_appliance_cannot_split',
    });
  });

  it('returns the UNDER_80 unknown fallback for appliance/furniture too', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['APPLIANCE_FURNITURE'],
      lengthRange: 'UNDER_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    });

    expect(trace).toMatchObject({
      recommendation: 'GENERAL_BAG_MULTIPLE',
      matchedRuleId: 'bag-length-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'under_80_unknown_fallback',
    });
  });

  it('treats bedding-only AROUND_80 unknown split as a single large item', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'AROUND_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    });

    expect(trace).toMatchObject({
      recommendation: 'LARGE_COVERING_BAG',
      matchedRuleId: 'bag-length-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'category_bedding_single_cannot_split',
    });
  });

  it('treats bedding-only OVER_80_UNDER_140 unknown split as a single large item', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    });

    expect(trace).toMatchObject({
      recommendation: 'LARGE_COVERING_BAG',
      matchedRuleId: 'length-86-140-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'category_bedding_single_cannot_split',
    });
  });

  it('keeps UNDER_80 unknown fallback ahead of the bedding-only large-item assumption', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'UNDER_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    });

    expect(trace).toMatchObject({
      recommendation: 'GENERAL_BAG_MULTIPLE',
      matchedRuleId: 'bag-length-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'under_80_unknown_fallback',
    });
  });

  it('keeps mixed bedding and general categories splittable for unknown split fallback', () => {
    const trace = recommendWithTrace({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'GENERAL_FOOD_RECYCLE'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    });

    expect(trace).toMatchObject({
      recommendation: 'GENERAL_BAG_MULTIPLE',
      matchedRuleId: 'length-86-140-heavy',
      action: 'HEAVY_SPLIT_DECISION',
      heavySplitReason: 'category_bedding_can_split',
    });
  });

  it('marks no-matching-rule fallback explicitly', () => {
    const trace = recommendWithTrace(base, []);

    expect(trace).toEqual({
      recommendation: 'GENERAL_BAG_SINGLE',
      fallbackReason: 'no_matching_rule',
    });
  });
});

describe('recommend - 의류·이불 무게 분산 redirect', () => {
  it('BEDDING + OVER_25 + UNDER_80 → MULTIPLE (방문수거 X)', () => {
    expect(recommend({ ...base, categories: ['BEDDING_CLOTHES_MISC'], weightRange: 'OVER_25' })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('BEDDING + HARD_TO_LIFT + AROUND_80 → MULTIPLE', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'AROUND_80',
      weightRange: 'UNKNOWN',
      perceivedWeight: 'HARD_TO_LIFT',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('BEDDING + OVER_25 + OVER_80_UNDER_140 → MULTIPLE', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_25',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('BEDDING + OVER_25 + OVER_140_UNDER_150 → LARGE', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'OVER_140_UNDER_150',
      weightRange: 'OVER_25',
    })).toBe('LARGE_COVERING_BAG');
  });
  it('BEDDING + HARD_TO_LIFT + OVER_140_UNDER_150 → LARGE', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'OVER_140_UNDER_150',
      weightRange: 'OVER_15_UNDER_25',
      perceivedWeight: 'HARD_TO_LIFT',
    })).toBe('LARGE_COVERING_BAG');
  });
  it('BEDDING + OVER_25 + AROUND_80 → MULTIPLE by splittable heavy bag rule', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'AROUND_80',
      weightRange: 'OVER_25',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('BEDDING + GENERAL + OVER_25 + OVER_140_UNDER_150 → LARGE', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'GENERAL_FOOD_RECYCLE'],
      lengthRange: 'OVER_140_UNDER_150',
      weightRange: 'OVER_25',
    })).toBe('LARGE_COVERING_BAG');
  });
  it('BEDDING + GENERAL + HARD_TO_LIFT + OVER_140_UNDER_150 → LARGE', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'GENERAL_FOOD_RECYCLE'],
      lengthRange: 'OVER_140_UNDER_150',
      weightRange: 'OVER_15_UNDER_25',
      perceivedWeight: 'HARD_TO_LIFT',
    })).toBe('LARGE_COVERING_BAG');
  });
  it('BEDDING + APPLIANCE 동시 선택은 redirect 안 함 → VISIT_PICKUP', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'APPLIANCE_FURNITURE'],
      weightRange: 'OVER_25',
    })).toBe('VISIT_PICKUP');
  });
  it('BEDDING + ETC 동시 선택은 redirect 안 함 → VISIT_PICKUP', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'ETC'],
      weightRange: 'OVER_25',
    })).toBe('VISIT_PICKUP');
  });
  it('BEDDING + OVER_150은 길이 우선 → VISIT_PICKUP', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'OVER_150',
      weightRange: 'OVER_25',
    })).toBe('VISIT_PICKUP');
  });
  it('APPLIANCE + OVER_25 + OVER_140_UNDER_150 → VISIT_PICKUP', () => {
    expect(recommend({
      ...base,
      categories: ['APPLIANCE_FURNITURE'],
      lengthRange: 'OVER_140_UNDER_150',
      weightRange: 'OVER_25',
    })).toBe('VISIT_PICKUP');
  });
  it('ETC + HARD_TO_LIFT + OVER_140_UNDER_150 → VISIT_PICKUP', () => {
    expect(recommend({
      ...base,
      categories: ['ETC'],
      lengthRange: 'OVER_140_UNDER_150',
      weightRange: 'UNKNOWN',
      perceivedWeight: 'HARD_TO_LIFT',
    })).toBe('VISIT_PICKUP');
  });
});

describe('recommend - GENERAL_FOOD_RECYCLE 단독 (방문수거 절대 추천 X)', () => {
  it('SINGLE for UNDER_15', () => {
    expect(recommend({ ...generalBase, weightRange: 'UNDER_15' })).toBe('GENERAL_BAG_SINGLE');
  });
  it('MULTIPLE for OVER_15_UNDER_25', () => {
    expect(recommend({ ...generalBase, weightRange: 'OVER_15_UNDER_25' })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('OVER_25라도 MULTIPLE (방문수거 X)', () => {
    expect(recommend({ ...generalBase, weightRange: 'OVER_25' })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('HARD_TO_LIFT라도 MULTIPLE (방문수거 X)', () => {
    expect(recommend({ ...generalBase, weightRange: 'UNKNOWN', perceivedWeight: 'HARD_TO_LIFT' })).toBe('GENERAL_BAG_MULTIPLE');
  });
});

describe('recommend - OVER_140_UNDER_150', () => {
  it('LARGE_COVERING_BAG (light)', () => {
    expect(recommend({ ...base, lengthRange: 'OVER_140_UNDER_150' })).toBe('LARGE_COVERING_BAG');
  });
  it('LARGE_COVERING_BAG (heavy)', () => {
    expect(recommend({ ...base, lengthRange: 'OVER_140_UNDER_150', weightRange: 'OVER_15_UNDER_25' })).toBe('LARGE_COVERING_BAG');
  });
});

describe('recommend - OVER_80_UNDER_140', () => {
  it('LARGE for light (길이 자체가 일반 봉투 한계 초과)', () => {
    expect(recommend({ ...base, lengthRange: 'OVER_80_UNDER_140' })).toBe('LARGE_COVERING_BAG');
  });
  it('MULTIPLE for heavy + CAN_SPLIT', () => {
    expect(recommend({ ...base, lengthRange: 'OVER_80_UNDER_140', weightRange: 'OVER_15_UNDER_25', splittableStatus: 'CAN_SPLIT' })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('LARGE for heavy + CANNOT_SPLIT', () => {
    expect(recommend({ ...base, lengthRange: 'OVER_80_UNDER_140', weightRange: 'OVER_15_UNDER_25', splittableStatus: 'CANNOT_SPLIT' })).toBe('LARGE_COVERING_BAG');
  });
  it('LARGE for heavy + UNKNOWN(BEDDING-only fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('LARGE_COVERING_BAG');
  });
  it('MULTIPLE for heavy + UNKNOWN(BEDDING + GENERAL fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'GENERAL_FOOD_RECYCLE'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('LARGE for heavy + UNKNOWN(APPLIANCE fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['APPLIANCE_FURNITURE'],
      lengthRange: 'OVER_80_UNDER_140',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('LARGE_COVERING_BAG');
  });
});

describe('recommend - AROUND_80', () => {
  it('SINGLE for light', () => {
    expect(recommend({ ...base, lengthRange: 'AROUND_80' })).toBe('GENERAL_BAG_SINGLE');
  });
  it('MULTIPLE for heavy + CAN_SPLIT', () => {
    expect(recommend({ ...base, lengthRange: 'AROUND_80', weightRange: 'OVER_15_UNDER_25', splittableStatus: 'CAN_SPLIT' })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('LARGE for heavy + CANNOT_SPLIT', () => {
    expect(recommend({ ...base, lengthRange: 'AROUND_80', weightRange: 'OVER_15_UNDER_25', splittableStatus: 'CANNOT_SPLIT' })).toBe('LARGE_COVERING_BAG');
  });
  it('LARGE for heavy + UNKNOWN(BEDDING-only fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'AROUND_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('LARGE_COVERING_BAG');
  });
  it('MULTIPLE for heavy + UNKNOWN(BEDDING + GENERAL fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC', 'GENERAL_FOOD_RECYCLE'],
      lengthRange: 'AROUND_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('LARGE for heavy + UNKNOWN(APPLIANCE fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['APPLIANCE_FURNITURE'],
      lengthRange: 'AROUND_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('LARGE_COVERING_BAG');
  });
});

describe('recommend - UNDER_80', () => {
  it('SINGLE for light', () => {
    expect(recommend(base)).toBe('GENERAL_BAG_SINGLE');
  });
  it('MULTIPLE for heavy + CAN_SPLIT', () => {
    expect(recommend({ ...base, lengthRange: 'UNDER_80', weightRange: 'OVER_15_UNDER_25', splittableStatus: 'CAN_SPLIT' })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('LARGE for heavy + CANNOT_SPLIT', () => {
    expect(recommend({ ...base, lengthRange: 'UNDER_80', weightRange: 'OVER_15_UNDER_25', splittableStatus: 'CANNOT_SPLIT' })).toBe('LARGE_COVERING_BAG');
  });
  it('MULTIPLE for heavy + UNKNOWN(BEDDING fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['BEDDING_CLOTHES_MISC'],
      lengthRange: 'UNDER_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
  it('MULTIPLE for heavy + UNKNOWN(APPLIANCE UNDER_80 fallback)', () => {
    expect(recommend({
      ...base,
      categories: ['APPLIANCE_FURNITURE'],
      lengthRange: 'UNDER_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: 'UNKNOWN',
    })).toBe('GENERAL_BAG_MULTIPLE');
  });
});

describe('buildResult - VISIT_PICKUP 원인별 description', () => {
  it('25kg 이상 → 무게 원인 (가전·가구)', () => {
    const r = buildResult({ ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'OVER_25' });
    expect(r.recommendation).toBe('VISIT_PICKUP');
    expect(r.description).toContain('25kg');
  });
  it('HARD_TO_LIFT → 체감 무게 원인 (가전·가구)', () => {
    const r = buildResult({ ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'UNKNOWN', perceivedWeight: 'HARD_TO_LIFT' });
    expect(r.recommendation).toBe('VISIT_PICKUP');
    expect(r.description).toContain('혼자 들기 어려운');
  });
  it('OVER_150 → 길이 원인', () => {
    const r = buildResult({ ...base, lengthRange: 'OVER_150' });
    expect(r.recommendation).toBe('VISIT_PICKUP');
    expect(r.description).toContain('150cm');
  });
});

describe('buildResult - CTA', () => {
  it('VISIT_PICKUP → 카카오톡으로 견적받기', () => {
    expect(buildResult({ ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'OVER_25' }).cta).toBe('카카오톡으로 견적받기');
  });
  it('LARGE_COVERING_BAG → 대형 커버링 봉투 신청하기', () => {
    expect(buildResult({ ...base, lengthRange: 'OVER_80_UNDER_140' }).cta).toBe('대형 커버링 봉투 신청하기');
  });
  it('GENERAL_BAG → 일반 커버링 봉투 신청하기', () => {
    expect(buildResult(base).cta).toBe('일반 커버링 봉투 신청하기');
  });
});

describe('buildResult - DB copy config', () => {
  it('uses supplied result copy for title, description, and cta', () => {
    const result = buildResult(base, {
      ...DEFAULT_GUIDE_CONFIG,
      recommendationCopy: {
        ...DEFAULT_GUIDE_CONFIG.recommendationCopy,
        GENERAL_BAG_SINGLE: {
          recommendation: 'GENERAL_BAG_SINGLE',
          title: 'DB title',
          description: 'DB description',
          cta: 'DB CTA',
        },
      },
    });

    expect(result.title).toBe('DB title');
    expect(result.description).toBe('DB description');
    expect(result.cta).toBe('DB CTA');
  });

  it('uses supplied DB description for VISIT_PICKUP', () => {
    const result = buildResult(
      { ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'OVER_25' },
      {
        ...DEFAULT_GUIDE_CONFIG,
        recommendationCopy: {
          ...DEFAULT_GUIDE_CONFIG.recommendationCopy,
          VISIT_PICKUP: {
            recommendation: 'VISIT_PICKUP',
            title: 'DB visit title',
            description: 'DB visit description',
            cta: 'DB visit CTA',
          },
        },
      },
    );

    expect(result.title).toBe('DB visit title');
    expect(result.description).toBe('DB visit description');
    expect(result.cta).toBe('DB visit CTA');
  });
});

describe('buildResult - hint', () => {
  it('OVER_140_UNDER_150 → 220L 사양 확인 hint', () => {
    const r = buildResult({ ...base, lengthRange: 'OVER_140_UNDER_150' });
    expect(r.hint).toContain('220L');
  });
  it('BEDDING + GENERAL_BAG_MULTIPLE → 220L 보조 hint', () => {
    const r = buildResult({ ...base, weightRange: 'OVER_15_UNDER_25' });
    expect(r.recommendation).toBe('GENERAL_BAG_MULTIPLE');
    expect(r.hint).toContain('220L');
  });
});

describe('buildResult - specialItem caution', () => {
  it('배터리 키워드 → caution에 분리배출 안내', () => {
    const r = buildResult({ ...base, itemDescription: '폐건전지' });
    expect(r.caution).toContain('배터리');
  });
  it('형광등 키워드 → caution에 신문지 포장 안내', () => {
    const r = buildResult({ ...base, itemDescription: '깨진 형광등' });
    expect(r.caution).toContain('신문지');
  });
  it('거울 키워드 → caution에 신문지 포장 안내', () => {
    const r = buildResult({ ...base, itemDescription: '깨진 거울' });
    expect(r.caution).toContain('신문지');
  });
});

describe('buildResult - 음식물 caution', () => {
  it('VISIT_PICKUP', () => {
    const r = buildResult({ ...base, categories: ['APPLIANCE_FURNITURE'], weightRange: 'OVER_25', hasFoodWaste: true });
    expect(r.caution).toContain('방문수거 물품과 섞지 말고');
  });
  it('LARGE_COVERING_BAG', () => {
    const r = buildResult({ ...base, lengthRange: 'OVER_80_UNDER_140', hasFoodWaste: true });
    expect(r.recommendation).toBe('LARGE_COVERING_BAG');
    expect(r.caution).toContain('단, 음식물만');
  });
  it('GENERAL_BAG_SINGLE', () => {
    const r = buildResult({ ...base, hasFoodWaste: true });
    expect(r.recommendation).toBe('GENERAL_BAG_SINGLE');
    expect(r.caution).toContain('음식물은');
  });
  it('GENERAL_BAG_MULTIPLE', () => {
    const r = buildResult({ ...base, weightRange: 'OVER_15_UNDER_25', hasFoodWaste: true });
    expect(r.recommendation).toBe('GENERAL_BAG_MULTIPLE');
    expect(r.caution).toContain('음식물은');
  });
  it('no caution when no food waste / no special item', () => {
    expect(buildResult(base).caution).toBeUndefined();
  });
});
