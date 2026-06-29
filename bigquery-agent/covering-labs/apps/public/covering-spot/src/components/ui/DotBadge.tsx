"use client";

/* ─── Types ─── */
type Size = "sm" | "md";
type Color = "primary" | "negative" | "positive";

interface DotBadgeProps {
  size?: Size;
  color?: Color;
  className?: string;
}

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
};

/* ─── Color styles ─── */
const colorStyles: Record<Color, string> = {
  primary: "bg-brand-400",
  negative: "bg-[#FF3358]",
  positive: "bg-[#059458]",
};

/* ─── Component ─── */
export function DotBadge({
  size = "sm",
  color = "primary",
  className = "",
}: DotBadgeProps) {
  return (
    <span
      className={[
        "absolute top-0 right-0 block rounded-full",
        "transition-all duration-200",
        sizeStyles[size],
        colorStyles[color],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
