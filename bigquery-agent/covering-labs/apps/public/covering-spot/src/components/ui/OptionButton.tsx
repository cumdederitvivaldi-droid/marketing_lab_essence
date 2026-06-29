"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ─── Types ─── */
interface OptionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  description?: ReactNode;
  children: ReactNode;
}

/* ─── Component ─── */
export const OptionButton = forwardRef<HTMLButtonElement, OptionButtonProps>(
  function OptionButton(
    {
      selected = false,
      disabled = false,
      description,
      children,
      className = "",
      ...rest
    },
    ref,
  ) {
    const stateClass = disabled
      ? "bg-bg-warm2 border-disable-alt text-disable-strong cursor-not-allowed"
      : selected
        ? "bg-brand-50 border-brand-400 text-brand-700"
        : "bg-white border-border text-text-primary hover:border-brand-300";

    const classes = [
      "flex flex-col items-start gap-1 w-full",
      "p-4 border rounded-md",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
      "cursor-pointer",
      stateClass,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        role="option"
        aria-selected={selected}
        className={classes}
        {...rest}
      >
        <span className="font-semibold text-sm">{children}</span>
        {description && (
          <span
            className={
              "text-xs " +
              (disabled ? "text-disable-strong" : selected ? "text-brand-600" : "text-text-sub")
            }
          >
            {description}
          </span>
        )}
      </button>
    );
  },
);
