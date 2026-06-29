export type Category =
  | 'GENERAL_FOOD_RECYCLE'
  | 'APPLIANCE_FURNITURE'
  | 'BEDDING_CLOTHES_MISC'
  | 'ETC';

export type LengthRange =
  | 'UNDER_80'
  | 'AROUND_80'
  | 'OVER_80_UNDER_140'
  | 'OVER_140_UNDER_150'
  | 'OVER_150';

export type WeightRange =
  | 'UNDER_15'
  | 'OVER_15_UNDER_25'
  | 'OVER_25'
  | 'UNKNOWN';

export type PerceivedWeight =
  | 'EASY_TO_LIFT'
  | 'HARD_TO_HOLD_LONG'
  | 'HARD_TO_LIFT';

export type SplittableStatus =
  | 'CAN_SPLIT'
  | 'CANNOT_SPLIT'
  | 'UNKNOWN';

export type Recommendation =
  | 'VISIT_PICKUP'
  | 'LARGE_COVERING_BAG'
  | 'GENERAL_BAG_MULTIPLE'
  | 'GENERAL_BAG_SINGLE';

export type RecommendationAction = Recommendation | 'HEAVY_SPLIT_DECISION';

export type ScreenId =
  | 'intro'
  | 'step_category'
  | 'step_food_waste'
  | 'step_item_description'
  | 'step_length'
  | 'step_weight'
  | 'step_perceived_weight'
  | 'step_splittable'
  | 'result';

export interface AppState {
  screen: ScreenId;
  categories: Category[];
  hasFoodWaste: boolean;
  itemDescription: string;
  lengthCm?: number;
  lengthRange: LengthRange;
  weightRange: WeightRange;
  perceivedWeight?: PerceivedWeight;
  splittableStatus?: SplittableStatus;
  resultId?: Recommendation;
}

export interface StepChoice {
  id: string;
  label: string;
  description?: string;
}

export type HazardousCategory = 'PHARMACEUTICAL' | 'HAZARDOUS_WASTE';

export interface HazardousMatch {
  category: HazardousCategory;
  keyword: string;
}

export interface DiagnosisResult {
  recommendation: Recommendation;
  title: string;
  description: string;
  caution?: string;       // 음식물·특수 품목 등 강조 안내 (노란 경고 박스)
  hint?: string;          // 불확실성·보조 추천 (회색 가이드 박스)
  cta: string;
}

export type RecommendationCategoryMode = 'GENERAL_ONLY' | 'SPLITTABLE_ONLY';

export interface RecommendationCondition {
  __invalid?: true;
  categoryMode?: RecommendationCategoryMode;
  lengthIn?: LengthRange[];
  weightIn?: WeightRange[];
  perceivedWeightIn?: PerceivedWeight[];
  bagAcceptableLength?: boolean;
  anyOf?: RecommendationCondition[];
  allOf?: RecommendationCondition[];
  not?: RecommendationCondition;
}

export interface RecommendationRule {
  id: string;
  priority: number;
  condition: RecommendationCondition;
  action: RecommendationAction;
}

export interface RecommendationCopy {
  recommendation: Recommendation;
  title: string;
  description: string;
  cta: string;
}

export interface DisposalGuideChoices {
  categories: StepChoice[];
  weights: StepChoice[];
  perceivedWeights: StepChoice[];
  splittable: StepChoice[];
}

export interface DisposalGuideConfig {
  choices: DisposalGuideChoices;
  hazardousKeywords: HazardousMatch[];
  recommendationRules: RecommendationRule[];
  recommendationCopy: Record<Recommendation, RecommendationCopy>;
  dataSource: 'supabase' | 'sheet' | 'fallback';
}
