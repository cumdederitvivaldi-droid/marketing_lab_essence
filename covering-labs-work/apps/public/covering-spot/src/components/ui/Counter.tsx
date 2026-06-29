"use client";

import { forwardRef, type HTMLAttributes } from "react";

/* ─── Types ─── */
interface CounterProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
}

/* ─── Icons ─── */
function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 3.5V12.5M3.5 8H12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export const Counter = forwardRef<HTMLDivElement, CounterProps>(
  function Counter(
    {
      value,
      onChange,
      min = 0,
      max = 99,
      disabled = false,
      label,
      className = "",
      ...rest
    },
    ref,
  ) {
    const atMin = value <= min;
    const atMax = value >= max;

    function decrement() {
      if (!atMin && !disabled) onChange(value - 1);
    }

    function increment() {
      if (!atMax && !disabled) onChange(value + 1);
    }

    const btnBase = [
      "flex items-center justify-center",
      "h-8 w-8 rounded-sm border",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
    ].join(" ");

    const btnEnabled =
      "border-border text-text-sub hover:bg-bg-warm cursor-pointer";
    const btnDisabled =
      "border-disable-alt text-disable-strong cursor-not-allowed";

    return (
      <div className="flex flex-col">
        {/* Label */}
        {label && (
          <label className="mb-2 text-sm font-semibold leading-[22px] text-text-primary">
            {label}
          </label>
        )}

        {/* Counter row */}
        <div
          ref={ref}
          className={[
            "inline-flex items-center gap-3",
            "h-10 rounded-md border border-border px-2",
            disabled ? "bg-disable-assistive" : "bg-white",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        >
          {/* Minus */}
          <button
            type="button"
            disabled={disabled || atMin}
            onClick={decrement}
            className={[
              btnBase,
              "border-0",
              disabled || atMin ? btnDisabled : btnEnabled,
            ].join(" ")}
            aria-label="Decrease"
          >
            <MinusIcon />
          </button>

          {/* Value */}
          <span
            className={[
              "min-w-[40px] text-center text-base font-semibold tabular-nums",
              disabled ? "text-disable-strong" : "text-text-primary",
            ].join(" ")}
          >
            {value}
          </span>

          {/* Plus */}
          <button
            type="button"
            disabled={disabled || atMax}
            onClick={increment}
            className={[
              btnBase,
              "border-0",
              disabled || atMax ? btnDisabled : btnEnabled,
            ].join(" ")}
            aria-label="Increase"
          >
            <PlusIcon />
          </button>
        </div>
      </div>
    );
  },
);
