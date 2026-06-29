"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getActiveExperiments } from "@/config/experiments";

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** experimentName -> variant 매핑 */
type ExperimentMap = Map<string, string>;

interface ExperimentValue {
  /** 하위 호환: 첫 번째 실험의 이름 */
  experimentName: string | null;
  /** 하위 호환: 첫 번째 실험의 variant */
  variant: string | null;
  /** 모든 활성 실험의 variant 매핑 */
  experiments: ExperimentMap;
  /** 특정 실험의 variant 조회 */
  getVariant: (experimentName: string) => string | null;
}

const ExperimentContext = createContext<ExperimentValue>({
  experimentName: null,
  variant: null,
  experiments: new Map(),
  getVariant: () => null,
});

export function ExperimentProvider({ children }: { children: React.ReactNode }) {
  const [experiments, setExperiments] = useState<ExperimentMap>(new Map());

  useEffect(() => {
    const activeExps = getActiveExperiments();
    if (activeExps.length === 0) return;

    const map = new Map<string, string>();
    for (const exp of activeExps) {
      const variant = readCookie(`ab_${exp.name}`);
      if (variant) {
        map.set(exp.name, variant);
      }
    }
    setExperiments(map);
  }, []);

  // 하위 호환: 첫 번째 실험 정보
  const firstEntry = experiments.entries().next().value;
  const experimentName = firstEntry ? firstEntry[0] : null;
  const variant = firstEntry ? firstEntry[1] : null;

  const getVariant = (name: string): string | null => {
    return experiments.get(name) || null;
  };

  return (
    <ExperimentContext.Provider value={{ experimentName, variant, experiments, getVariant }}>
      {children}
    </ExperimentContext.Provider>
  );
}

export function useExperiment() {
  return useContext(ExperimentContext);
}
