'use client';

import { useState, useEffect, useRef } from 'react';
import ProgressBar from '../components/ProgressBar';
import type { StepChoice } from '../types';

interface Props {
  step: number;
  question: string;
  subtitle?: string;
  hint?: string;
  choices: StepChoice[];
  onSelect: (id: string) => void;
}

export default function RadioListScreen({
  step,
  question,
  subtitle,
  hint,
  choices,
  onSelect,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleClick = (id: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setSelected(id);
    setTimeout(() => {
      if (mountedRef.current) onSelect(id);
      pendingRef.current = false;
    }, 150);
  };

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
      <ProgressBar current={step} />

      <div className="flex-1 overflow-y-auto px-5 pt-8 pb-4">
        <h1 className="text-title2 text-text-default">{question}</h1>
        {subtitle && <p className="mt-2 text-body2-regular text-text-secondary">{subtitle}</p>}

        <div className="mt-6 flex flex-col gap-3">
          {choices.map((c) => {
            const isSelected = selected === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleClick(c.id)}
                className={`flex min-h-[56px] w-full flex-col items-center justify-center rounded-full border px-6 py-3 text-center transition-colors duration-150 active:opacity-80 ${
                  isSelected
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-border-subtle bg-white text-text-default'
                }`}
              >
                <p className="text-body1-emphasized">{c.label}</p>
                {c.description && (
                  <p className="mt-0.5 text-label1-regular text-text-secondary">{c.description}</p>
                )}
              </button>
            );
          })}
        </div>

        {hint && (
          <p className="mt-5 rounded-ds-sm bg-surface-dim px-4 py-3 text-[13px] leading-relaxed text-text-tertiary">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
