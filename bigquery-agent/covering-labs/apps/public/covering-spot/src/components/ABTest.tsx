"use client";

import { useExperiment } from "@/contexts/ExperimentContext";
import type { ReactNode } from "react";

interface ABTestProps {
  /** 실험 이름 (experiments.ts의 name과 일치) */
  experiment: string;
  /** variant별 렌더링할 컴포넌트 매핑 */
  variants: Record<string, ReactNode>;
  /** variant가 아직 로드되지 않았거나 매칭되지 않을 때 표시할 fallback (기본: control) */
  fallback?: ReactNode;
}

/**
 * A/B 테스트 헬퍼 컴포넌트
 *
 * 사용 예시:
 * <ABTest
 *   experiment="cta_text"
 *   variants={{
 *     control: <Button>견적 요청하기</Button>,
 *     variant_a: <Button>5분만에 견적 받기</Button>,
 *   }}
 * />
 */
export function ABTest({ experiment, variants, fallback }: ABTestProps) {
  const { getVariant } = useExperiment();
  const variant = getVariant(experiment);

  // variant가 매칭되면 해당 컴포넌트 렌더링
  if (variant && variants[variant]) {
    return <>{variants[variant]}</>;
  }

  // fallback이 있으면 사용, 없으면 control variant 사용
  if (fallback) {
    return <>{fallback}</>;
  }

  if (variants.control) {
    return <>{variants.control}</>;
  }

  // control도 없으면 첫 번째 variant 렌더링
  const firstKey = Object.keys(variants)[0];
  return firstKey ? <>{variants[firstKey]}</> : null;
}
