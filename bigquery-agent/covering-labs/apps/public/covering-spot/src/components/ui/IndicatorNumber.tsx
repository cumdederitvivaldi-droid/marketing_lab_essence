"use client";

/* ─── Types ─── */
interface IndicatorNumberProps {
  step: number;
  total: number;
  current: number;
  label?: string;
  className?: string;
}

/* ─── Checkmark icon ─── */
function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
    >
      <path
        d="M3.5 7L6 9.5L10.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export function IndicatorNumber({
  step,
  total,
  current,
  label,
  className = "",
}: IndicatorNumberProps) {
  const isCompleted = step < current;
  const isActive = step === current;
  /* const isUpcoming = step > current; */

  /* Circle style */
  const circleStyle = (() => {
    if (isCompleted) return "bg-brand-400 text-white";
    if (isActive) return "bg-brand-400 text-white";
    return "bg-[#DEE3ED] text-[#8A96A8]";
  })();

  /* Label style */
  const labelStyle = (() => {
    if (isActive) return "text-brand-700 font-semibold";
    if (isCompleted) return "text-text-sub";
    return "text-[#8A96A8]";
  })();

  return (
    <div
      className={[
        "inline-flex flex-col items-center gap-1.5",
        "transition-all duration-200",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Step ${step} of ${total}${label ? `: ${label}` : ""}`}
      aria-current={isActive ? "step" : undefined}
    >
      {/* Number circle */}
      <div
        className={[
          "flex items-center justify-center w-7 h-7 rounded-full",
          "text-xs font-semibold",
          "transition-all duration-200",
          circleStyle,
        ].join(" ")}
      >
        {isCompleted ? <CheckIcon /> : step}
      </div>

      {/* Optional label */}
      {label && (
        <span
          className={[
            "text-xs leading-none",
            "transition-all duration-200",
            labelStyle,
          ].join(" ")}
        >
          {label}
        </span>
      )}
    </div>
  );
}
