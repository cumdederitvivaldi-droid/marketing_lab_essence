"use client";

import { type ReactNode } from "react";

/* ─── Types ─── */
type Variant = "information" | "positive" | "negative" | "caution";

interface BannerProps {
  variant?: Variant;
  title?: string;
  description: string;
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
  className?: string;
  icon?: ReactNode;
}

/* ─── Variant styles ─── */
const variantStyles: Record<
  Variant,
  { container: string; icon: string; text: string }
> = {
  information: {
    container: "bg-brand-50 text-brand-700",
    icon: "text-brand-700",
    text: "text-brand-700",
  },
  positive: {
    container: "bg-semantic-green-tint text-[#059458]",
    icon: "text-[#059458]",
    text: "text-[#059458]",
  },
  negative: {
    container: "bg-semantic-red-tint text-[#99001C]",
    icon: "text-[#99001C]",
    text: "text-[#99001C]",
  },
  caution: {
    container: "bg-semantic-orange-tint text-[#CC5F00]",
    icon: "text-[#CC5F00]",
    text: "text-[#CC5F00]",
  },
};

/* ─── Default icons per variant ─── */
function InfoCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 9V14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.5 10L9 12.5L13.5 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ErrorCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6V11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="13.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function WarningTriangleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2L18.66 17H1.34L10 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M10 8V12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function CloseSmallIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M14 6L6 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M6 6L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const defaultIcons: Record<Variant, ReactNode> = {
  information: <InfoCircleIcon />,
  positive: <CheckCircleIcon />,
  negative: <ErrorCircleIcon />,
  caution: <WarningTriangleIcon />,
};

/* ─── Component ─── */
export function Banner({
  variant = "information",
  title,
  description,
  action,
  onClose,
  className = "",
  icon,
}: BannerProps) {
  const styles = variantStyles[variant];

  const classes = [
    "relative flex gap-[--spacing-sm] p-[--spacing-md] rounded-md w-full",
    "transition-all duration-200",
    styles.container,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="alert">
      {/* Icon */}
      <div className={`shrink-0 mt-0.5 ${styles.icon}`}>
        {icon || defaultIcons[variant]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {title && (
          <p
            className={`text-[14px] leading-[22px] font-semibold ${styles.text}`}
          >
            {title}
          </p>
        )}
        <p
          className={`text-[14px] leading-[22px] font-normal ${styles.text} ${title ? "mt-0.5" : ""}`}
        >
          {description}
        </p>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`text-[14px] leading-[22px] font-semibold underline mt-1 cursor-pointer ${styles.text} hover:opacity-80 transition-all duration-200`}
          >
            {action.label}
          </button>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={`shrink-0 mt-0.5 cursor-pointer ${styles.icon} opacity-60 hover:opacity-100 transition-all duration-200`}
          aria-label="닫기"
        >
          <CloseSmallIcon />
        </button>
      )}
    </div>
  );
}
