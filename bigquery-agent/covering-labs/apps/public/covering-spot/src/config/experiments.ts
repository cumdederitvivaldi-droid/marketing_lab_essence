/**
 * A/B 테스트 실험 설정
 * experiments.ts에 실험을 추가하면 미들웨어가 자동으로 쿠키 할당
 */

export interface Experiment {
  /** 실험 고유 ID (쿠키명: ab_{name}) */
  name: string;
  /** variant 이름 배열 (예: ["control", "variant_a"]) */
  variants: string[];
  /** 각 variant 트래픽 비율 (합=100) */
  weights: number[];
  /** 실험 활성화 여부 */
  enabled: boolean;
  /** 설명 */
  description?: string;
}

export const EXPERIMENTS: Experiment[] = [
  // 실험 추가 예시:
  // {
  //   name: "photo_optional",
  //   variants: ["control", "optional"],
  //   weights: [50, 50],
  //   enabled: true,
  //   description: "사진 필수 vs 선택 전환율 비교",
  // },
];

/** 현재 활성화된 실험 (1개만 지원, 하위 호환) */
export function getActiveExperiment(): Experiment | null {
  return EXPERIMENTS.find((e) => e.enabled) || null;
}

/** 활성화된 모든 실험 반환 (복수 실험 지원) */
export function getActiveExperiments(): Experiment[] {
  return EXPERIMENTS.filter((e) => e.enabled);
}

/** weights 기반 variant 할당 */
export function assignVariant(exp: Experiment): string {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < exp.variants.length; i++) {
    cumulative += exp.weights[i];
    if (rand < cumulative) return exp.variants[i];
  }
  return exp.variants[0];
}
