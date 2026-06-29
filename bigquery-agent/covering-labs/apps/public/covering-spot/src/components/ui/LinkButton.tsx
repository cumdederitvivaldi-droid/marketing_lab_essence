"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";

/* ─── Types ─── */
type Size = "sm" | "md" | "lg";

interface LinkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: Size;
  href?: string;
  icon?: ReactNode;
  children: ReactNode;
}

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/* ─── Component ─── */
export const LinkButton = forwardRef<HTMLButtonElement, LinkButtonProps>(
  function LinkButton(
    {
      size = "md",
      disabled = false,
      href,
      icon,
      children,
      className = "",
      ...rest
    },
    ref,
  ) {
    const classes = [
      "inline-flex items-center gap-1 font-semibold",
      "text-brand-400 hover:text-brand-300",
      "underline-offset-2 hover:underline",
      "transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
      "cursor-pointer",
      disabled ? "opacity-40 pointer-events-none" : "",
      sizeStyles[size],
      className,
    ]
      .filter(Boolean)
      .join(" ");

    if (href && !disabled) {
      return (
        <Link href={href} className={classes}>
          {children}
          {icon && <span className="inline-flex shrink-0">{icon}</span>}
        </Link>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={classes}
        {...rest}
      >
        {children}
        {icon && <span className="inline-flex shrink-0">{icon}</span>}
      </button>
    );
  },
);
