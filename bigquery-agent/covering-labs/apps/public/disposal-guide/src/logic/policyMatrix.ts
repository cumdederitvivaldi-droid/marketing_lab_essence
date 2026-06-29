import type { AppState, Category, LengthRange, Recommendation, WeightRange } from '../types';
import { recommendWithTrace, type RecommendationTrace } from './recommend';
import { DEFAULT_GUIDE_CONFIG } from '../data/defaultGuideConfig';

export interface PolicyMatrixScenario {
  id: string;
  label: string;
  state: AppState;
  expectedRecommendation: Recommendation;
  qaNote: string;
}

export interface PolicyMatrixEntry {
  id: string;
  label: string;
  input: {
    categories: Category[];
    lengthRange: LengthRange;
    weightRange: WeightRange;
    perceivedWeight?: string;
    splittableStatus?: string;
    hasFoodWaste: boolean;
    itemDescription: string;
  };
  expectedRecommendation: Recommendation;
  actualRecommendation: Recommendation;
  pass: boolean;
  qaNote: string;
  trace: RecommendationTrace;
}

const baseState: AppState = {
  screen: 'result',
  categories: ['BEDDING_CLOTHES_MISC'],
  hasFoodWaste: false,
  itemDescription: '',
  lengthRange: 'UNDER_80',
  weightRange: 'UNDER_15',
};

function scenario(
  id: string,
  label: string,
  patch: Partial<AppState>,
  expectedRecommendation: Recommendation,
  qaNote: string,
): PolicyMatrixScenario {
  return {
    id,
    label,
    state: { ...baseState, ...patch },
    expectedRecommendation,
    qaNote,
  };
}

export const POLICY_MATRIX_SCENARIOS: PolicyMatrixScenario[] = [
  scenario(
    'general_under_15_single',
    '일반 쓰레기 단독, 15kg 이하',
    { categories: ['GENERAL_FOOD_RECYCLE'], weightRange: 'UNDER_15' },
    'GENERAL_BAG_SINGLE',
    '일반 쓰레기 단독은 방문수거로 가지 않는다.',
  ),
  scenario(
    'general_over_25_multiple',
    '일반 쓰레기 단독, 25kg 이상',
    { categories: ['GENERAL_FOOD_RECYCLE'], weightRange: 'OVER_25' },
    'GENERAL_BAG_MULTIPLE',
    '일반 쓰레기 단독은 무거워도 일반 봉투 여러 장으로 안내한다.',
  ),
  scenario(
    'appliance_over_25_visit',
    '가전·가구, 25kg 이상',
    { categories: ['APPLIANCE_FURNITURE'], weightRange: 'OVER_25' },
    'VISIT_PICKUP',
    '혼자 옮기기 어려운 가전·가구는 방문수거로 안내한다.',
  ),
  scenario(
    'appliance_hard_to_lift_visit',
    '가전·가구, 체감상 혼자 들기 어려움',
    {
      categories: ['APPLIANCE_FURNITURE'],
      weightRange: 'UNKNOWN',
      perceivedWeight: 'HARD_TO_LIFT',
    },
    'VISIT_PICKUP',
    '정확한 무게를 몰라도 혼자 들기 어려우면 방문수거로 안내한다.',
  ),
  scenario(
    'bedding_over_25_multiple',
    '이불·의류·잡화 단독, 25kg 이상',
    { categories: ['BEDDING_CLOTHES_MISC'], weightRange: 'OVER_25' },
    'GENERAL_BAG_MULTIPLE',
    '나눠 담을 수 있는 품목은 무거워도 일반 봉투 여러 장으로 안내한다.',
  ),
  scenario(
    'bedding_with_appliance_over_25_visit',
    '이불·의류·잡화와 가전·가구 혼합, 25kg 이상',
    {
      categories: ['BEDDING_CLOTHES_MISC', 'APPLIANCE_FURNITURE'],
      weightRange: 'OVER_25',
    },
    'VISIT_PICKUP',
    '혼합 선택에 가전·가구가 포함되면 방문수거를 우선한다.',
  ),
  scenario(
    'length_74_under80_single',
    '길이 74cm 구간',
    { lengthRange: 'UNDER_80', weightRange: 'UNDER_15' },
    'GENERAL_BAG_SINGLE',
    '75cm 미만은 80cm 이하 구간이다.',
  ),
  scenario(
    'length_75_around80_single',
    '길이 75cm 구간',
    { lengthRange: 'AROUND_80', weightRange: 'UNDER_15' },
    'GENERAL_BAG_SINGLE',
    '75~85cm는 80cm 내외 구간이다.',
  ),
  scenario(
    'length_85_around80_single',
    '길이 85cm 구간',
    { lengthRange: 'AROUND_80', weightRange: 'UNDER_15' },
    'GENERAL_BAG_SINGLE',
    '85cm까지는 80cm 내외 구간이다.',
  ),
  scenario(
    'length_86_large',
    '길이 86cm 구간',
    { lengthRange: 'OVER_80_UNDER_140', weightRange: 'UNDER_15' },
    'LARGE_COVERING_BAG',
    '86cm부터 일반 봉투 한 장 안내가 아니라 대형 봉투로 안내한다.',
  ),
  scenario(
    'length_140_large',
    '길이 140cm 구간',
    { lengthRange: 'OVER_80_UNDER_140', weightRange: 'UNDER_15' },
    'LARGE_COVERING_BAG',
    '140cm까지는 대형 봉투 구간이다.',
  ),
  scenario(
    'length_141_large',
    '길이 141cm 구간',
    { lengthRange: 'OVER_140_UNDER_150', weightRange: 'UNDER_15' },
    'LARGE_COVERING_BAG',
    '141~150cm는 대형 봉투 구간이다.',
  ),
  scenario(
    'length_150_large',
    '길이 150cm 구간',
    { lengthRange: 'OVER_140_UNDER_150', weightRange: 'UNDER_15' },
    'LARGE_COVERING_BAG',
    '150cm까지는 대형 봉투 구간이다.',
  ),
  scenario(
    'length_151_visit',
    '길이 151cm 구간',
    { lengthRange: 'OVER_150', weightRange: 'UNDER_15' },
    'VISIT_PICKUP',
    '150cm 초과는 방문수거로 안내한다.',
  ),
  scenario(
    'bedding_unknown_weight_hard_hold_multiple',
    '이불·의류·잡화, 무게 모름, 오래 들기 어려움',
    {
      categories: ['BEDDING_CLOTHES_MISC'],
      weightRange: 'UNKNOWN',
      perceivedWeight: 'HARD_TO_HOLD_LONG',
      splittableStatus: undefined,
    },
    'GENERAL_BAG_MULTIPLE',
    '나눠 담을 수 있는 품목의 15~25kg 추정은 여러 장으로 안내한다.',
  ),
  scenario(
    'etc_around80_heavy_unknown_split_multiple',
    '기타, 80cm 내외, 15~25kg, 나눠 담기 모름',
    {
      categories: ['ETC'],
      lengthRange: 'AROUND_80',
      weightRange: 'OVER_15_UNDER_25',
      splittableStatus: undefined,
    },
    'GENERAL_BAG_MULTIPLE',
    '기타 품목이 80cm 내외이고 나눠 담기 여부가 없으면 현재 정책은 여러 장으로 안내한다.',
  ),
];

export function buildPolicyMatrix(
  scenarios: PolicyMatrixScenario[] = POLICY_MATRIX_SCENARIOS,
  rules = DEFAULT_GUIDE_CONFIG.recommendationRules,
): PolicyMatrixEntry[] {
  return scenarios.map((item) => {
    const trace = recommendWithTrace(item.state, rules);
    return {
      id: item.id,
      label: item.label,
      input: {
        categories: item.state.categories,
        lengthRange: item.state.lengthRange,
        weightRange: item.state.weightRange,
        perceivedWeight: item.state.perceivedWeight,
        splittableStatus: item.state.splittableStatus,
        hasFoodWaste: item.state.hasFoodWaste,
        itemDescription: item.state.itemDescription,
      },
      expectedRecommendation: item.expectedRecommendation,
      actualRecommendation: trace.recommendation,
      pass: trace.recommendation === item.expectedRecommendation,
      qaNote: item.qaNote,
      trace,
    };
  });
}
