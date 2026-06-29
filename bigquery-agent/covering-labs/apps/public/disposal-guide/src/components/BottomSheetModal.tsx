'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useKeyboardOffset } from '../hooks/useKeyboardOffset';

interface Props {
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 모바일에서는 화면 하단에서 올라오는 시트, 데스크톱에서는 가운데 정렬 모달.
// 접근성: role="dialog", aria-modal, ESC 닫기, 시트 초기 포커스, focus trap, 닫힐 때 이전 포커스 복원.
export default function BottomSheetModal({ onClose, children, ariaLabel = '안내' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const keyboardOffset = useKeyboardOffset();

  useEffect(() => {
    // 모달 열릴 때 이전 포커스 저장
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    panelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'));

      if (focusables.length === 0) {
        // 포커스할 요소가 없으면 패널에 묶어둠
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // 모달 닫힐 때 이전 포커스 복원
      previouslyFocusedRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className="w-full rounded-t-[24px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom,20px))] pt-5 outline-none transition-[margin-bottom] duration-150 ease-out md:max-w-[360px] md:rounded-[20px] md:pb-7 md:pt-7"
        // 키보드 노출 시 다이얼로그 자체가 키보드 높이만큼 위로 이동.
        // 내부 padding (특히 bottom CTA 의 safe-area 패딩) 은 그대로 유지.
        style={{ marginBottom: `${keyboardOffset}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
