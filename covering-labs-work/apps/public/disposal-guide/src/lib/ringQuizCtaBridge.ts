import type { Recommendation } from '../types';

export type RingQuizCtaType = 'COVERING_BAG' | 'LARGE_COVERING_BAG' | 'VISIT_PICKUP';

const CTA_TYPE_BY_RECOMMENDATION: Record<Recommendation, RingQuizCtaType> = {
  VISIT_PICKUP: 'VISIT_PICKUP',
  LARGE_COVERING_BAG: 'LARGE_COVERING_BAG',
  GENERAL_BAG_SINGLE: 'COVERING_BAG',
  GENERAL_BAG_MULTIPLE: 'COVERING_BAG',
};

interface RingQuizCtaBridgeWindow {
  FlutterChannel?: {
    postMessage?: (message: string) => void;
  };
}

export function getRingQuizCtaType(recommendation: Recommendation): RingQuizCtaType {
  return CTA_TYPE_BY_RECOMMENDATION[recommendation];
}

export function postRingQuizCtaMessage(
  recommendation: Recommendation,
  targetWindow: RingQuizCtaBridgeWindow | undefined =
    typeof window === 'undefined' ? undefined : window,
): boolean {
  const flutterChannel = targetWindow?.FlutterChannel;
  const postMessage = flutterChannel?.postMessage;
  if (typeof postMessage !== 'function') return false;

  try {
    postMessage.call(
      flutterChannel,
      JSON.stringify({
        action: 'RING_QUIZ_CTA',
        ctaType: getRingQuizCtaType(recommendation),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
