"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

/* ─── Types ─── */
type Direction = "left" | "right";
type Size = "sm" | "md" | "lg";

interface NavButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  direction?: Direction;
  size?: Size;
}

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "w-8 h-8",
  md: "w-10 h-10",
  lg: "w-12 h-12",
};

const iconSizes: Record<Size, number> = {
  sm: 14,
  md: 18,
  lg: 22,
};

/* ─── Chevron SVG ─── */
function Chevron({ direction, size }: { direction: Direction; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  );
}

/* ─── Component ─── */
export const NavButton = forwardRef<HTMLButtonElement, NavButtonProps>(
  function NavButton(
    {
      direction = "left",
      size = "md",
      disabled = false,
      className = "",
      ...rest
    },
    ref,
  ) {
    const classes = [
      "inline-flex items-center justify-center shrink-0 rounded-full",
      "bg-white border border-border text-text-primary",
      "hover:bg-bg-warm2",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
      "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
      "shadow-sm",
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
        aria-label={direction === "left" ? "Previous" : "Next"}
        {...rest}
      >
        <Chevron direction={direction} size={iconSizes[size]} />
      </button>
    );
  },
);
