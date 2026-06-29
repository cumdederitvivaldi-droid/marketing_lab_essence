"use client";

/* ─── Types ─── */
type Size = "sm" | "md";
type Variant = "primary" | "negative";

interface NumberBadgeProps {
  count: number;
  maxCount?: number;
  size?: Size;
  variant?: Variant;
  className?: string;
}

/* ─── Size styles ─── */
const sizeStyles: Record<Size, string> = {
  sm: "min-w-4 h-4 text-[10px]",
  md: "min-w-5 h-5 text-[11px]",
};

/* ─── Variant styles ─── */
const variantStyles: Record<Variant, string> = {
  primary: "bg-brand-400 text-white",
  negative: "bg-semantic-red text-white",
};

/* ─── Component ─── */
export function NumberBadge({
  count,
  maxCount = 99,
  size = "sm",
  variant = "primary",
  className = "",
}: NumberBadgeProps) {
  if (count <= 0) return null;

  const display = count > maxCount ? `${maxCount}+` : String(count);

  return (
    <span
      className={[
        "inline-flex items-center justify-center px-1 font-bold leading-none",
        "rounded-full",
        "transition-all duration-200",
        sizeStyles[size],
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {display}
    </span>
  );
}
