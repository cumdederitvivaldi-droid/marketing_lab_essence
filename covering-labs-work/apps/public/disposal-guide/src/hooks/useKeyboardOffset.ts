'use client';

import { useEffect, useState } from 'react';

const DEFAULT_TOP_MARGIN_PX = 8;

interface KeyboardOffsetMetrics {
  innerHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
  floatingElementHeight?: number;
  topMargin?: number;
}

interface KeyboardOffsetOptions {
  floatingElementHeight?: number;
  topMargin?: number;
}

function nonNegativeFinite(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

/**
 * Computes the bottom offset needed to place a fixed element above the visual viewport edge.
 * When the floating element height is known, the offset is capped so the element top remains visible.
 */
export function resolveKeyboardOffset({
  innerHeight,
  visualViewportHeight,
  visualViewportOffsetTop,
  floatingElementHeight,
  topMargin = DEFAULT_TOP_MARGIN_PX,
}: KeyboardOffsetMetrics): number {
  const safeInnerHeight = nonNegativeFinite(innerHeight);
  const safeViewportHeight = nonNegativeFinite(visualViewportHeight, safeInnerHeight);
  const safeOffsetTop = nonNegativeFinite(visualViewportOffsetTop);
  const rawOffset = Math.max(0, safeInnerHeight - safeViewportHeight - safeOffsetTop);
  const safeFloatingElementHeight = nonNegativeFinite(floatingElementHeight ?? 0);

  if (safeFloatingElementHeight <= 0) {
    return rawOffset;
  }

  const safeTopMargin = nonNegativeFinite(topMargin, DEFAULT_TOP_MARGIN_PX);
  const maxVisibleOffset = Math.max(
    0,
    safeInnerHeight - safeOffsetTop - safeFloatingElementHeight - safeTopMargin,
  );

  return Math.min(rawOffset, maxVisibleOffset);
}

// 모바일 소프트 키보드가 올라올 때 시각 viewport 가 축소되는 만큼의 픽셀.
// BottomBar·BottomSheetModal 등 화면 하단 요소가 키보드에 가려지지 않게
// `bottom`/`padding-bottom` 등에 적용한다.
/**
 * Returns the current keyboard avoidance offset based on `visualViewport`.
 * Pass `floatingElementHeight` for fixed bottom CTAs that must not move above the viewport.
 */
export function useKeyboardOffset(options: KeyboardOffsetOptions = {}): number {
  const { floatingElementHeight, topMargin } = options;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const update = () => {
      const next = resolveKeyboardOffset({
        innerHeight: window.innerHeight,
        visualViewportHeight: vv.height,
        visualViewportOffsetTop: vv.offsetTop,
        floatingElementHeight,
        topMargin,
      });
      setOffset(next);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [floatingElementHeight, topMargin]);

  return offset;
}
