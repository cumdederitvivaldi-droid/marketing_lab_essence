"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";

/* ─── Types ─── */
type Size = "md" | "lg";

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: boolean;
  helperText?: string;
  size?: Size;
  maxLength?: number;
}

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  md: "h-12",
  lg: "h-14",
};

/* ─── Component ─── */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      error = false,
      helperText,
      disabled = false,
      size = "md",
      maxLength,
      value,
      className = "",
      required,
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

    /* Input classes */
    const inputClasses = [
      "w-full rounded-md px-4 text-base leading-6",
      "outline-none transition-all duration-200",
      "placeholder:text-text-muted",
      sizeStyles[size],
      borderColor,
      "border",
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
            {required && (
              <span className="ml-0.5 text-semantic-red">*</span>
            )}
          </label>
        )}

        {/* Input */}
        <input
          ref={ref}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          className={inputClasses}
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
