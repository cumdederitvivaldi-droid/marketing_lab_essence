"use client";

import { type ReactNode } from "react";

/* ─── Types ─── */
interface MessageItemProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  timestamp?: string;
  unread?: boolean;
  onClick?: () => void;
  className?: string;
}

/* ─── Component ─── */
export function MessageItem({
  icon,
  title,
  description,
  timestamp,
  unread = false,
  onClick,
  className = "",
}: MessageItemProps) {
  const Tag = onClick ? "button" : "div";

  const classes = [
    "relative flex flex-row w-full px-[--spacing-lg] py-[--spacing-md] gap-[--spacing-sm]",
    "transition-all duration-200",
    onClick ? "cursor-pointer hover:bg-bg-warm active:bg-bg-warm2 text-left" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={classes}
    >
      {/* Icon */}
      {icon !== undefined && (
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-bg-warm2 flex items-center justify-center">
            {icon}
          </div>
          {/* Unread dot */}
          {unread && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-400" />
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={[
            "text-[16px] leading-[24px] text-text-primary truncate",
            unread ? "font-semibold" : "font-normal",
          ].join(" ")}
        >
          {title}
        </p>
        {description && (
          <p className="text-[14px] leading-[22px] text-text-sub mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>

      {/* Timestamp */}
      {timestamp && (
        <span className="shrink-0 text-[12px] leading-[18px] text-text-muted">
          {timestamp}
        </span>
      )}
    </Tag>
  );
}
