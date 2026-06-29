"use client";

import { type ReactNode } from "react";

/* ─── Types ─── */
type Variant =
  | "primary"
  | "secondary"
  | "positive"
  | "negative"
  | "caution"
  | "information"
  | "neutral";
type Size = "sm" | "md";

interface LabelProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}

/* ─── Variant styles ─── */
const variantStyles: Record<Variant, string> = {
  primary: "bg-brand-50 text-brand-700",
  secondary: "bg-semantic-green-tint text-[#059458]",
  positive: "bg-semantic-green-tint text-[#059458]",
  negative: "bg-semantic-red-tint text-[#99001C]",
  caution: "bg-semantic-orange-tint text-[#CC5F00]",
  information: "bg-brand-50 text-brand-700",
  neutral: "bg-bg-warm2 text-text-neutral",
};

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "h-5 px-1.5 text-[11px] rounded-[4px]",
  md: "h-6 px-2 text-xs rounded-[6px]",
};

/* ─── Component ─── */
export function Label({
  variant = "primary",
  size = "md",
  children,
  className = "",
}: LabelProps) {
  return (
    <span
      className={[
        "inline-flex items-center justify-center font-semibold whitespace-nowrap",
        "transition-all duration-200",
        variantStyles[variant],
        sizeStyles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
