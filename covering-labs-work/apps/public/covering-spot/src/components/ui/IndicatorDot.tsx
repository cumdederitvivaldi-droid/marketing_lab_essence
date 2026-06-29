"use client";

/* ─── Types ─── */
interface IndicatorDotProps {
  total: number;
  current: number;
  className?: string;
  onChange?: (index: number) => void;
}

/* ─── Component ─── */
export function IndicatorDot({
  total,
  current,
  className = "",
  onChange,
}: IndicatorDotProps) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="tablist"
    >
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current;

        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`${i + 1} / ${total}`}
            onClick={() => onChange?.(i)}
            className={[
              "block rounded-full shrink-0",
              "transition-all duration-200 ease-out",
              isActive
                ? "w-4 h-1.5 bg-brand-400"
                : "w-1.5 h-1.5 bg-border hover:bg-fill-assistive",
              onChange ? "cursor-pointer" : "cursor-default",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        );
      })}
    </div>
  );
}
