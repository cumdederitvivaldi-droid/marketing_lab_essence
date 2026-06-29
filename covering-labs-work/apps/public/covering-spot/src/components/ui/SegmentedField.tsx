"use client";

import { forwardRef, type HTMLAttributes } from "react";

/* ─── Types ─── */
interface SegmentOption {
  value: string;
  label: string;
}

interface SegmentedFieldProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/* ─── Component ─── */
export const SegmentedField = forwardRef<HTMLDivElement, SegmentedFieldProps>(
  function SegmentedField(
    { options, value, onChange, disabled = false, className = "", ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={[
          "inline-flex gap-1 rounded-md bg-fill-tint p-1",
          disabled ? "opacity-60 pointer-events-none" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="radiogroup"
        {...rest}
      >
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={[
                "flex-1 flex items-center justify-center",
                "h-9 rounded-sm px-3",
                "text-sm leading-[22px]",
                "transition-all duration-200",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
                isActive
                  ? "bg-white text-text-primary font-semibold shadow-sm"
                  : "bg-transparent text-text-sub hover:text-text-primary cursor-pointer",
                disabled ? "cursor-not-allowed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  },
);
