'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import FilledButton from './FilledButton';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';

interface Props {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

// 컨텐츠 끝과 floating CTA 상단 사이에 항상 유지할 gap (px).
const CONTENT_BOTTOM_GAP_PX = 64;
// floating 카드 높이가 측정되기 전 초기 추정값 (single CTA 기준 + gap).
const INITIAL_SPACER_HEIGHT = 138;
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// floating 카드 실제 높이를 ResizeObserver 로 측정.
// (secondary 버튼 on/off, env(safe-area-inset-bottom) 등 변화 자동 반영)
function useObservedHeight<T extends HTMLElement>(initial: number) {
  const ref = useRef<T | null>(null);
  const [height, setHeight] = useState(initial);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const next = el.getBoundingClientRect().height;
      if (typeof next === 'number') setHeight(next);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  return [ref, height] as const;
}

// viewport 하단에 고정되는 floating CTA.
// 부모는 flex column이라 spacer가 자리를 차지해 다음 컨텐츠가 BottomBar에 가려지지 않도록 함.
// spacer = floating 카드 실제 높이 + 64px gap → 컨텐츠 끝과 CTA 사이가 항상 64px 유지.
// 모바일 소프트 키보드 노출 시 CTA 가 키보드 위로 떠올라 항상 보이도록 처리.
export default function BottomBar({ label, onClick, disabled, secondaryLabel, onSecondary }: Props) {
  const hasSecondary = Boolean(secondaryLabel && onSecondary);
  const [cardRef, cardHeight] = useObservedHeight<HTMLDivElement>(INITIAL_SPACER_HEIGHT - CONTENT_BOTTOM_GAP_PX);
  const keyboardOffset = useKeyboardOffset({ floatingElementHeight: cardHeight });
  const spacerHeight = Math.max(INITIAL_SPACER_HEIGHT, cardHeight + CONTENT_BOTTOM_GAP_PX);

  return (
    <>
      {/* 레이아웃 자리 차지용 spacer (fixed가 아니라 flex 흐름에 들어감) */}
      <div aria-hidden className="shrink-0" style={{ height: `${spacerHeight}px` }} />

      {/* 실제 floating CTA */}
      <div
        className="pointer-events-none fixed left-0 right-0 z-50 flex justify-center transition-[bottom] duration-150 ease-out"
        style={{ bottom: `${keyboardOffset}px` }}
      >
        <div
          ref={cardRef}
          className="pointer-events-auto w-full max-w-[768px] bg-white px-5 pt-2 pb-[max(16px,env(safe-area-inset-bottom,16px))]"
        >
          <FilledButton label={label} onClick={onClick} disabled={disabled} />
          {hasSecondary && (
            <button
              type="button"
              onClick={onSecondary}
              className="mt-3 w-full py-3 text-body2-regular text-text-secondary active:text-text-default"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
