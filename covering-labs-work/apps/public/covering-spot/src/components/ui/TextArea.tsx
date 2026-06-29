"use client";

import { forwardRef, useState, type TextareaHTMLAttributes } from "react";

/* ─── Types ─── */
interface TextAreaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> {
  label?: string;
  error?: boolean;
  helperText?: string;
  maxLength?: number;
}

/* ─── Component ─── */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextArea(
    {
      label,
      error = false,
      helperText,
      disabled = false,
      rows = 4,
      maxLength,
      value,
      className = "",
      ...rest
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);

    /* Border color by state */
    const borderColor = (() => {
      if (disabled) return "border-disable-alt";
      if (error) return "border-semantic-red";
      if (focused) return "border-brand-400 ring-1 ring-brand-400";
      return "border-border";
    })();

    /* Textarea classes */
    const textareaClasses = [
      "w-full rounded-md px-4 py-3 text-base leading-6",
      "outline-none transition-all duration-200 resize-y",
      "placeholder:text-text-muted",
      "border",
      borderColor,
      disabled
        ? "bg-disable-assistive text-disable-strong cursor-not-allowed"
        : "bg-white text-text-primary",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    /* Character count */
    const charCount =
      typeof value === "string" ? value.length : String(value ?? "").length;

    return (
      <div className="flex flex-col">
        {/* Label */}
        {label && (
          <label className="mb-2 text-sm font-semibold leading-[22px] text-text-primary">
            {label}
          </label>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          value={value}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          className={textareaClasses}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />

        {/* Helper / Character count */}
        {(helperText || maxLength != null) && (
          <div className="mt-1 flex items-center justify-between">
            <span
              className={[
                "text-xs leading-[18px]",
                error ? "text-semantic-red" : "text-text-sub",
              ].join(" ")}
            >
              {helperText}
            </span>
            {maxLength != null && (
              <span className="text-xs leading-[18px] text-text-muted">
                {charCount}/{maxLength}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);
