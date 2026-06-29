"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ─── Types ─── */
type Variant = "primary" | "secondary" | "tertiary";
type Size = "sm" | "md" | "lg";
type Shape = "circle" | "square";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  children: ReactNode;
}

/* ─── Variant styles ─── */
const variantStyles: Record<Variant, string> = {
  primary:
    "bg-brand-400 text-white hover:bg-brand-300 disabled:bg-[#DEE3ED] disabled:text-disable-strong",
  secondary:
    "bg-brand-50 text-brand-700 hover:opacity-80 disabled:bg-[#DEE3ED] disabled:text-disable-strong",
  tertiary:
    "bg-transparent border border-border text-text-primary hover:bg-bg-warm2 disabled:border-[#DEE3ED] disabled:text-disable-strong",
};

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
};

/* ─── Component ─── */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      variant = "tertiary",
      size = "md",
      shape = "circle",
      disabled = false,
      children,
      className = "",
      ...rest
    },
    ref,
  ) {
    const radiusClass = shape === "circle" ? "rounded-full" : "rounded-md";

    const classes = [
      "inline-flex items-center justify-center shrink-0",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
      "cursor-pointer disabled:cursor-not-allowed",
      variantStyles[variant],
      sizeStyles[size],
      radiusClass,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={classes}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
