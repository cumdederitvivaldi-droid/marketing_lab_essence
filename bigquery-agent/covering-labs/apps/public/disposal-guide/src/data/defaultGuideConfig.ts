import type {
  DisposalGuideConfig,
  Recommendation,
  RecommendationCopy,
  RecommendationRule,
} from '../types';
import {
  categoryChoices,
  perceivedWeightChoices,
  splittableChoices,
  weightChoices,
} from './flow';
import { FALLBACK_HAZARDOUS_KEYWORDS } from './hazardousKeywords';

export const DEFAULT_RECOMMENDATION_RULES: RecommendationRule[] = [
  {
    id: 'general-only-heavy',
    priority: 10,
    condition: {
      categoryMode: 'GENERAL_ONLY',
      anyOf: [
        { weightIn: ['OVER_15_UNDER_25', 'OVER_25'] },
        { perceivedWeightIn: ['HARD_TO_LIFT'] },
      ],
    },
    action: 'GENERAL_BAG_MULTIPLE',
  },
  {
    id: 'general-only-default',
    priority: 20,
    condition: { categoryMode: 'GENERAL_ONLY' },
    action: 'GENERAL_BAG_SINGLE',
  },
  {
    id: 'splittable-heavy-bag-length',
    priority: 30,
    condition: {
      categoryMode: 'SPLITTABLE_ONLY',
      bagAcceptableLength: true,
      anyOf: [
        { weightIn: ['OVER_25'] },
        { perceivedWeightIn: ['HARD_TO_LIFT'] },
      ],
    },
    action: 'GENERAL_BAG_MULTIPLE',
  },
  {
    id: 'weight-over-25',
    priority: 40,
    condition: {
      weightIn: ['OVER_25'],
      not: { categoryMode: 'SPLITTABLE_ONLY' },
    },
    action: 'VISIT_PICKUP',
  },
  {
    id: 'perceived-hard-to-lift',
    priority: 50,
    condition: {
      perceivedWeightIn: ['HARD_TO_LIFT'],
      not: { categoryMode: 'SPLITTABLE_ONLY' },
    },
    action: 'VISIT_PICKUP',
  },
  {
    id: 'length-over-150',
    priority: 60,
    condition: { lengthIn: ['OVER_150'] },
    action: 'VISIT_PICKUP',
  },
  {
    id: 'length-141-150',
    priority: 70,
    condition: { lengthIn: ['OVER_140_UNDER_150'] },
    action: 'LARGE_COVERING_BAG',
  },
  {
    id: 'length-86-140-heavy',
    priority: 80,
    condition: {
      lengthIn: ['OVER_80_UNDER_140'],
      weightIn: ['OVER_15_UNDER_25'],
    },
    action: 'HEAVY_SPLIT_DECISION',
  },
  {
    id: 'length-86-140-default',
    priority: 90,
    condition: { lengthIn: ['OVER_80_UNDER_140'] },
    action: 'LARGE_COVERING_BAG',
  },
  {
    id: 'bag-length-heavy',
    priority: 100,
    condition: {
      lengthIn: ['UNDER_80', 'AROUND_80'],
      weightIn: ['OVER_15_UNDER_25'],
    },
    action: 'HEAVY_SPLIT_DECISION',
  },
  {
    id: 'bag-length-default',
    priority: 110,
    condition: { lengthIn: ['UNDER_80', 'AROUND_80'] },
    action: 'GENERAL_BAG_SINGLE',
  },
  {
    id: 'default',
    priority: 1000,
    condition: {},
    action: 'GENERAL_BAG_SINGLE',
  },
];

export const DEFAULT_RECOMMENDATION_COPY: Record<Recommendation, RecommendationCopy> = {
  VISIT_PICKUP: {
    recommendation: 'VISIT_PICKUP',
    title: '커버링 방문 수거를 추천해요',
    description:
      '총 무게가 25kg을 넘거나 길이가 150cm를 넘는 대형 · 대량 폐기물은 봉투 수거가 어려워요. 집 안으로 들어가 전문 기사님들이 직접 옮겨 수거하는 방문수거를 추천해드려요.',
    cta: '카카오톡으로 견적받기',
  },
  LARGE_COVERING_BAG: {
    recommendation: 'LARGE_COVERING_BAG',
    title: '대형 커버링 봉투에 버려주세요',
    description:
      '길이가 80cm를 넘거나, 봉투에 나눠 버릴 수 없는 큰 물품은 일반 커버링 봉투에 담기 어려워요. 대형 커버링 봉투가 더 적합해요.',
    cta: '대형 커버링 봉투 신청하기',
  },
  GENERAL_BAG_MULTIPLE: {
    recommendation: 'GENERAL_BAG_MULTIPLE',
    title: '일반 커버링 봉투 여러 장을 추천해요',
    description:
      '부피가 작지만, 만약 양이 많다면 일반 커버링 봉투 한 봉투에 모두 담기보다 여러 장에 나눠 담는 것이 안전해요. 한 봉투에 15kg을 넘지 않도록 나눠 담아주세요.',
    cta: '일반 커버링 봉투 신청하기',
  },
  GENERAL_BAG_SINGLE: {
    recommendation: 'GENERAL_BAG_SINGLE',
    title: '일반 커버링 봉투에 버려주세요',
    description:
      '길이가 80cm 이하이고 총 무게가 15kg을 넘지 않는 폐기물은 분리, 세척없이 일반 커버링 봉투에 담아 문 앞에 배출하면 기사님이 새벽 사이에 수거해 가요.',
    cta: '일반 커버링 봉투 신청하기',
  },
};

export const DEFAULT_GUIDE_CONFIG: DisposalGuideConfig = {
  choices: {
    categories: categoryChoices,
    weights: weightChoices,
    perceivedWeights: perceivedWeightChoices,
    splittable: splittableChoices,
  },
  hazardousKeywords: FALLBACK_HAZARDOUS_KEYWORDS,
  recommendationRules: DEFAULT_RECOMMENDATION_RULES,
  recommendationCopy: DEFAULT_RECOMMENDATION_COPY,
  dataSource: 'fallback',
};
