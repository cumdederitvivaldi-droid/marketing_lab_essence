"use client";

import { type ReactNode, type ButtonHTMLAttributes } from "react";

/* ─── Types ─── */
type Variant = "primary" | "secondary" | "outline";
type Size = "sm" | "md";

interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: Variant;
  size?: Size;
  selected?: boolean;
  disabled?: boolean;
  onDelete?: () => void;
  children: ReactNode;
  className?: string;
}

/* ─── Variant styles ─── */
const variantStyles: Record<Variant, { base: string; selected: string }> = {
  primary: {
    base: "bg-brand-400 text-white",
    selected: "bg-brand-400 text-white",
  },
  secondary: {
    base: "bg-brand-50 text-brand-700",
    selected: "bg-brand-50 text-brand-700",
  },
  outline: {
    base: "bg-transparent border border-border text-text-primary",
    selected: "border-brand-400 text-brand-700 bg-brand-50",
  },
};

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

/* ─── X icon ─── */
function DeleteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0"
    >
      <path
        d="M4.5 4.5L9.5 9.5M9.5 4.5L4.5 9.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export function Chip({
  variant = "outline",
  size = "md",
  selected = false,
  disabled = false,
  onDelete,
  children,
  className = "",
  onClick,
  ...rest
}: ChipProps) {
  const style = variantStyles[variant];

  const classes = [
    "inline-flex items-center justify-center gap-1 font-medium",
    "rounded-full whitespace-nowrap",
    "transition-all duration-200",
    "cursor-pointer",
    sizeStyles[size],
    selected && variant === "outline" ? style.selected : style.base,
    disabled ? "opacity-40 cursor-not-allowed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      disabled={disabled}
      className={classes}
      onClick={onClick}
      {...rest}
    >
      <span>{children}</span>
      {onDelete && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onDelete();
          }}
          className="inline-flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity duration-150"
        >
          <DeleteIcon />
        </span>
      )}
    </button>
  );
}
