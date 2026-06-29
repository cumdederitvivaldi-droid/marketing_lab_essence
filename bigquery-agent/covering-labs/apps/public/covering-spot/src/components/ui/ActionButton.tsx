"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/* ─── Types ─── */
type ActionType = "caution" | "negative";
type Hierarchy = "primary" | "secondary" | "tertiary";
type Size = "sm" | "md" | "lg";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  actionType?: ActionType;
  hierarchy?: Hierarchy;
  size?: Size;
  children: ReactNode;
}

/* ─── Color map per action type ─── */
const colorMap: Record<
  ActionType,
  Record<Hierarchy, string>
> = {
  caution: {
    primary:
      "bg-semantic-orange text-white hover:opacity-85 disabled:bg-[#DEE3ED] disabled:text-disable-strong",
    secondary:
      "bg-semantic-orange-tint text-[#B26D12] hover:opacity-80 disabled:bg-[#DEE3ED] disabled:text-disable-strong",
    tertiary:
      "bg-transparent border border-semantic-orange text-semantic-orange hover:bg-semantic-orange-tint disabled:border-[#DEE3ED] disabled:text-disable-strong",
  },
  negative: {
    primary:
      "bg-semantic-red text-white hover:bg-[#FF6682] disabled:bg-[#DEE3ED] disabled:text-disable-strong",
    secondary:
      "bg-semantic-red-tint text-semantic-red hover:opacity-80 disabled:bg-[#DEE3ED] disabled:text-disable-strong",
    tertiary:
      "bg-transparent border border-semantic-red text-semantic-red hover:bg-semantic-red-tint disabled:border-[#DEE3ED] disabled:text-disable-strong",
  },
};

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-sm",
  md: "h-10 px-4 text-sm rounded-md",
  lg: "h-[50px] px-6 text-base rounded-md",
};

/* ─── Component ─── */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton(
    {
      actionType = "caution",
      hierarchy = "primary",
      size = "md",
      disabled = false,
      children,
      className = "",
      ...rest
    },
    ref,
  ) {
    const classes = [
      "inline-flex items-center justify-center gap-2 font-semibold",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
      "cursor-pointer disabled:cursor-not-allowed",
      colorMap[actionType][hierarchy],
      sizeStyles[size],
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
