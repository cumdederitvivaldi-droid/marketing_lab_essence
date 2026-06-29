"use client";

import { type ReactNode } from "react";

/* ─── Types ─── */
type Variant = "sent" | "received" | "system";

interface MessageBoxProps {
  variant?: Variant;
  children: ReactNode;
  timestamp?: string;
  className?: string;
}

/* ─── Variant styles ─── */
const variantStyles: Record<
  Variant,
  { wrapper: string; bubble: string; time: string }
> = {
  sent: {
    wrapper: "flex justify-end",
    bubble:
      "bg-brand-400 text-white rounded-lg rounded-br-[4px] px-[--spacing-md] py-[10px]",
    time: "text-right text-white/60",
  },
  received: {
    wrapper: "flex justify-start",
    bubble:
      "bg-bg-warm2 text-text-primary rounded-lg rounded-bl-[4px] px-[--spacing-md] py-[10px]",
    time: "text-left text-text-muted",
  },
  system: {
    wrapper: "flex justify-center",
    bubble: "bg-transparent text-text-muted px-[--spacing-md] py-[6px]",
    time: "text-center text-text-muted",
  },
};

/* ─── Component ─── */
export function MessageBox({
  variant = "received",
  children,
  timestamp,
  className = "",
}: MessageBoxProps) {
  const styles = variantStyles[variant];

  const wrapperClasses = [
    styles.wrapper,
    "transition-all duration-200",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const isSystem = variant === "system";

  return (
    <div className={wrapperClasses}>
      <div className={`max-w-[70%] ${isSystem ? "max-w-full" : ""}`}>
        {/* Bubble */}
        <div className={styles.bubble}>
          <div
            className={
              isSystem
                ? "text-[12px] leading-[18px] text-center"
                : "text-[14px] leading-[22px]"
            }
          >
            {children}
          </div>
        </div>

        {/* Timestamp */}
        {timestamp && !isSystem && (
          <p className={`text-[11px] leading-[16px] mt-1 ${styles.time}`}>
            {timestamp}
          </p>
        )}
      </div>
    </div>
  );
}
