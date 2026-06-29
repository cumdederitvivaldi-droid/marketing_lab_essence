'use client';

import { useState, type ChangeEvent } from 'react';
import ProgressBar from '../components/ProgressBar';
import BottomBar from '../components/BottomBar';
import type { LengthRange } from '../types';
import { resolveLengthRange } from '../logic/recommend';
import { getNearestLengthExample } from '../data/lengthExamples';

interface Props {
  step: number;
  onNext: (lengthCm: number, lengthRange: LengthRange) => void;
}

const SLIDER_MIN = 10;
const SLIDER_MAX = 160;
const SLIDER_DEFAULT = 60;

export default function LengthSliderScreen({ step, onNext }: Props) {
  const [cm, setCm] = useState(SLIDER_DEFAULT);
  // 추천·gradient 계산용 — 입력 중 일시적으로 SLIDER_MIN 미만 값이 들어와도
  // 슬라이더·범위 평가는 항상 유효 범위로 클램프된 값을 사용.
  const clampedCm = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, cm));
  const range = resolveLengthRange(clampedCm);
  const pct = ((clampedCm - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
  const isMax = clampedCm >= SLIDER_MAX;

  // 숫자 직접 입력 — 키보드(모바일은 numeric keypad)로 cm 값 변경 가능.
  // 입력 중에는 SLIDER_MIN 미만 일시 허용 (예: "1" → "10" 단계적으로 입력),
  // 포커스 아웃 시 SLIDER_MIN 으로 스냅.
  const handleNumberInput = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
    if (raw === '') {
      setCm(0);
      return;
    }
    const num = parseInt(raw, 10);
    setCm(Math.min(SLIDER_MAX, num));
  };

  const handleNumberBlur = () => {
    if (cm < SLIDER_MIN) setCm(SLIDER_MIN);
  };

  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top,0px)]">
      <ProgressBar current={step} />

      <div className="flex flex-1 flex-col px-5 pt-8 pb-4">
        <h1 className="text-title2 text-text-default">
          가장 긴 길이가 어느 정도인가요?
        </h1>
        <p className="mt-2 text-body2-regular text-text-secondary">
          가장 긴 쪽을 기준으로 선택해 주세요
        </p>

        <div className="mt-14 flex flex-col items-center gap-4">
          <div className="flex items-baseline justify-center">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={cm === 0 ? '' : cm}
              onChange={handleNumberInput}
              onBlur={handleNumberBlur}
              onFocus={(e) => e.target.select()}
              maxLength={3}
              aria-label="길이 직접 입력 (cm)"
              className="bg-transparent text-center text-[48px] font-semibold leading-none text-text-default outline-none tabular-nums focus:text-primary"
              style={{ width: '3ch' }}
            />
            <span className="ml-1 text-title2 font-medium text-text-secondary">cm</span>
            {isMax && <span className="ml-1 text-title2 font-medium text-text-default">+</span>}
          </div>

          <p className="text-[15px] font-semibold text-primary">
            {getNearestLengthExample(clampedCm).label}
          </p>

          <div className="mt-2 w-full">
            <label htmlFor="length-range" className="sr-only">
              가장 긴 물건의 길이 (cm)
            </label>
            <input
              id="length-range"
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              value={clampedCm}
              aria-valuemin={SLIDER_MIN}
              aria-valuemax={SLIDER_MAX}
              aria-valuenow={clampedCm}
              aria-valuetext={`${clampedCm}센티미터`}
              onChange={(e) => setCm(Number(e.target.value))}
              className="slider-range w-full"
              style={{
                background: `linear-gradient(to right, #1AA3FF 0%, #1AA3FF ${pct}%, #E5E7EB ${pct}%, #E5E7EB 100%)`,
              }}
            />
          </div>
        </div>
      </div>

      <BottomBar
        label="다음으로"
        onClick={() => onNext(clampedCm, range)}
      />
    </div>
  );
}
