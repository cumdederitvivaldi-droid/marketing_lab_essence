"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";

/* ─── Types ─── */
type Variant = "primary" | "secondary" | "tertiary" | "ghost" | "danger";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  href?: string;
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
  ghost:
    "bg-transparent border border-border text-text-primary hover:bg-bg-warm2 disabled:border-[#DEE3ED] disabled:text-disable-strong",
  danger:
    "bg-semantic-red text-white hover:bg-[#FF6682] disabled:bg-[#DEE3ED] disabled:text-disable-strong",
};

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs rounded-sm",
  sm: "h-8 px-3 text-[13px] rounded-sm",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-[50px] px-6 text-base rounded-md",
};

/* ─── Spinner ─── */
function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={"animate-spin " + (className || "")}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled = false,
      href,
      children,
      className = "",
      type = "button",
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    const classes = [
      "inline-flex items-center justify-center gap-2 font-semibold",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
      "cursor-pointer disabled:cursor-not-allowed",
      variantStyles[variant],
      sizeStyles[size],
      fullWidth ? "w-full" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    /* Link variant */
    if (href && !isDisabled) {
      return (
        <Link href={href} className={classes}>
          {loading && <Spinner />}
          {children}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={classes}
        {...rest}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);
