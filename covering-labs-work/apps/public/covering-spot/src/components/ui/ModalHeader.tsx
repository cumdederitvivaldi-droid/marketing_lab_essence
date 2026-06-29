"use client";

/* ─── Types ─── */
interface ModalHeaderProps {
  title: string;
  onClose?: () => void;
  subtitle?: string;
  className?: string;
}

/* ─── Icons ─── */
function CloseIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 6L18 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export function ModalHeader({
  title,
  onClose,
  subtitle,
  className = "",
}: ModalHeaderProps) {
  const classes = [
    "flex items-center justify-between h-14 px-[--spacing-lg]",
    "border-b border-[#DEE3ED]",
    "transition-all duration-200",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={classes}>
      {/* Title group */}
      <div className="flex flex-col min-w-0">
        <h2 className="text-[18px] leading-[26px] font-bold text-text-primary truncate">
          {title}
        </h2>
        {subtitle && (
          <p className="text-[14px] leading-[22px] font-normal text-text-sub truncate">
            {subtitle}
          </p>
        )}
      </div>

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center w-10 h-10 -mr-2 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-warm2 transition-all duration-200 cursor-pointer shrink-0"
          aria-label="닫기"
        >
          <CloseIcon />
        </button>
      )}
    </header>
  );
}
