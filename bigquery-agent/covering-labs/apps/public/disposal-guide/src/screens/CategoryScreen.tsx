'use client';

import { useState } from 'react';
import ProgressBar from '../components/ProgressBar';
import BottomBar from '../components/BottomBar';
import type { Category, StepChoice } from '../types';
import { categoryChoices } from '../data/flow';

interface Props {
  choices?: StepChoice[];
  onNext: (categories: Category[]) => void;
}

export default function CategoryScreen({ choices = categoryChoices, onNext }: Props) {
  const [selected, setSelected] = useState<Category[]>([]);

  const toggle = (id: Category) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
      <ProgressBar current={1} />

      <div className="flex-1 px-5 pt-8">
        <h1 className="text-title2 text-text-default">
          버리시는 품목을 <span className="text-primary">모두</span> 선택해주세요
        </h1>

        <div className="mt-6 flex flex-col gap-3">
          {choices.map((c) => {
            const isSelected = selected.includes(c.id as Category);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${c.label}${isSelected ? ' (선택됨)' : ''}`}
                onClick={() => toggle(c.id as Category)}
                className={`flex min-h-[56px] w-full items-center justify-center rounded-full border px-6 py-3 text-center transition-colors duration-150 active:opacity-80 ${
                  isSelected
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-border-subtle bg-white text-text-default'
                }`}
              >
                <span className="text-body1-emphasized">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="dg-fade-in">
          <BottomBar
            label="다음으로"
            onClick={() => onNext(selected)}
          />
        </div>
      )}
    </div>
  );
}
