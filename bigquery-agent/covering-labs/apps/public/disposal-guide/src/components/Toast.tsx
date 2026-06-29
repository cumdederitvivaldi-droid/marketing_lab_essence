'use client';

import { useEffect } from 'react';

interface Props {
  message: string;
  onClose: () => void;
  duration?: number;
}

// AppBar(56px) 바로 아래 8px 위치에 노출되는 상단 토스트
export default function Toast({ message, onClose, duration = 2500 }: Props) {
  useEffect(() => {
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [duration, onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed left-0 right-0 z-[10000] flex justify-center px-5 dg-fade-in-up"
      style={{ top: 'calc(56px + 8px + env(safe-area-inset-top, 0px))' }}
    >
      <div className="pointer-events-auto max-w-[320px] rounded-ds-md bg-text-default/92 px-4 py-3 text-center text-[13px] font-medium text-white shadow-lg">
        {message}
      </div>
    </div>
  );
}
