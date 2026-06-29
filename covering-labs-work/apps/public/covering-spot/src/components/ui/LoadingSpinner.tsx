"use client";

/* ─── Types ─── */
type Size = "sm" | "md" | "lg";
type Color = "primary" | "white" | "grey";

interface LoadingSpinnerProps {
  size?: Size;
  color?: Color;
  className?: string;
}

/* ─── Size → px ─── */
const sizeMap: Record<Size, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

/* ─── Color → stroke ─── */
const colorMap: Record<Color, string> = {
  primary: "#1AA3FF",
  white: "#FFFFFF",
  grey: "#8A96A8",
};

/* ─── Component ─── */
export function LoadingSpinner({
  size = "md",
  color = "primary",
  className = "",
}: LoadingSpinnerProps) {
  const px = sizeMap[size];
  const stroke = colorMap[color];
  const r = px / 2 - 2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      width={px}
      height={px}
      viewBox={`0 0 ${px} ${px}`}
      fill="none"
      className={[
        "animate-spin",
        "transition-all duration-200",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ animationDuration: "0.8s" }}
    >
      {/* Background track */}
      <circle
        cx={px / 2}
        cy={px / 2}
        r={r}
        stroke={stroke}
        strokeOpacity="0.2"
        strokeWidth="2.5"
        fill="none"
      />
      {/* Active arc */}
      <circle
        cx={px / 2}
        cy={px / 2}
        r={r}
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * 0.7} ${circumference * 0.3}`}
        fill="none"
      />
    </svg>
  );
}
