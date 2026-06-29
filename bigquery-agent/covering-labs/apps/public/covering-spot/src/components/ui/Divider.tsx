"use client";

/* ─── Types ─── */
type Height = "xs" | "sm" | "md" | "lg";

interface DividerProps {
  height?: Height;
  className?: string;
}

/* ─── Height → thickness & color ─── */
const heightStyles: Record<Height, string> = {
  xs: "h-px bg-bg-warm3",
  sm: "h-1 bg-bg-warm2",
  md: "h-2 bg-bg-warm2",
  lg: "h-3 bg-bg-warm2",
};

/* ─── Component ─── */
export function Divider({ height = "xs", className = "" }: DividerProps) {
  return (
    <div
      role="separator"
      className={[
        "w-full shrink-0",
        "transition-all duration-200",
        heightStyles[height],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
