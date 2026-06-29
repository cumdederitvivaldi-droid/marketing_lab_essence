"use client";

import { type ReactNode } from "react";

/* ─── Types ─── */
interface GeneralHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  className?: string;
  sticky?: boolean;
  transparent?: boolean;
}

/* ─── Icons ─── */
function ChevronLeftIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15 19L8 12L15 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export function GeneralHeader({
  title,
  onBack,
  rightAction,
  className = "",
  sticky = false,
  transparent = false,
}: GeneralHeaderProps) {
  const baseClasses = [
    "flex items-center h-14 px-[--spacing-md] gap-[--spacing-xs]",
    "transition-all duration-200",
  ];

  const stickyClasses = sticky
    ? "fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-border-light"
    : "";

  const bgClasses = transparent ? "bg-transparent" : sticky ? "" : "bg-white";

  const classes = [...baseClasses, stickyClasses, bgClasses, className]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={classes}>
      {/* Back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-full text-text-primary hover:bg-bg-warm2 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="뒤로가기"
        >
          <ChevronLeftIcon />
        </button>
      )}

      {/* Title */}
      <h1 className="flex-1 text-[18px] leading-[26px] font-semibold text-text-primary truncate">
        {title}
      </h1>

      {/* Right action slot */}
      {rightAction && (
        <div className="flex items-center shrink-0">{rightAction}</div>
      )}
    </header>
  );
}
