"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

/* ─── Types ─── */
interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: boolean;
}

/* ─── Component ─── */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  function Radio(
    { checked = false, disabled = false, error = false, label, className = "", ...rest },
    ref,
  ) {
    /* Outer circle color */
    const circleColor = (() => {
      if (disabled) return "border-disable-normal bg-disable-assistive";
      if (error) return "border-semantic-red";
      if (checked) return "border-brand-400";
      return "border-border-strong";
    })();

    return (
      <label
        className={[
          "inline-flex items-center gap-2",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Hidden native radio */}
        <input
          ref={ref}
          type="radio"
          checked={checked}
          disabled={disabled}
          className="sr-only peer"
          {...rest}
        />

        {/* Custom radio circle */}
        <span
          className={[
            "relative flex shrink-0 items-center justify-center",
            "h-5 w-5 rounded-full border-2",
            "transition-all duration-200",
            circleColor,
            /* Focus ring via peer */
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-400",
          ].join(" ")}
        >
          {/* Inner dot */}
          {checked && !disabled && (
            <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />
          )}
          {checked && disabled && (
            <span className="h-2.5 w-2.5 rounded-full bg-disable-strong" />
          )}
        </span>

        {/* Label text */}
        {label && (
          <span
            className={[
              "text-base leading-6",
              disabled ? "text-disable-strong" : "text-text-primary",
            ].join(" ")}
          >
            {label}
          </span>
        )}
      </label>
    );
  },
);
