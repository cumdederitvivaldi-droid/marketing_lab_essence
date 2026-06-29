import type {
  StepChoice,
  Category,
  LengthRange,
  WeightRange,
  PerceivedWeight,
  SplittableStatus,
} from '../types';

export const categoryChoices: StepChoice[] = [
  { id: 'GENERAL_FOOD_RECYCLE', label: '재활용 · 음식물 · 일반 쓰레기' },
  { id: 'APPLIANCE_FURNITURE', label: '가전 · 가구' },
  { id: 'BEDDING_CLOTHES_MISC', label: '이불 · 의류 · 잡화' },
  { id: 'ETC', label: '기타' },
];

export const weightChoices: StepChoice[] = [
  { id: 'UNDER_15', label: '15kg 이하', description: '혼자 어렵지 않게 들 수 있어요' },
  { id: 'OVER_15_UNDER_25', label: '15kg 초과 ~ 25kg 미만', description: '들 수는 있지만 오래 들기 어렵거나 꽤 무거워요' },
  { id: 'OVER_25', label: '25kg 이상', description: '혼자 들기 어렵거나 두 사람이 들어야 해요' },
  { id: 'UNKNOWN', label: '잘 모르겠어요' },
];

export const perceivedWeightChoices: StepChoice[] = [
  { id: 'EASY_TO_LIFT', label: '어렵지 않게 들 수 있어요' },
  { id: 'HARD_TO_HOLD_LONG', label: '들 수는 있지만 오래 들기 어려워요' },
  { id: 'HARD_TO_LIFT', label: '혼자 들기 어려워요' },
];

export const splittableChoices: StepChoice[] = [
  { id: 'CAN_SPLIT', label: '네, 여러 봉투에 나눠 담을 수 있어요' },
  { id: 'CANNOT_SPLIT', label: '아니요, 하나로만 버려야 하는 물건이에요' },
  { id: 'UNKNOWN', label: '잘 모르겠어요' },
];

export const INIT_STATE = {
  screen: 'intro' as const,
  categories: [] as Category[],
  hasFoodWaste: false,
  itemDescription: '',
  lengthCm: undefined as number | undefined,
  lengthRange: 'UNDER_80' as LengthRange,
  weightRange: 'UNKNOWN' as WeightRange,
  perceivedWeight: undefined as PerceivedWeight | undefined,
  splittableStatus: undefined as SplittableStatus | undefined,
};
