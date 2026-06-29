"use client";

import { forwardRef, useState, useRef, useEffect } from "react";

/* ─── Types ─── */
interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  className?: string;
  name?: string;
}

/* ─── Chevron icon ─── */
function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className={className}
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export const Dropdown = forwardRef<HTMLButtonElement, DropdownProps>(
  function Dropdown(
    {
      label,
      options,
      value,
      onChange,
      placeholder = "Select...",
      disabled = false,
      error = false,
      helperText,
      className = "",
      name,
    },
    ref,
  ) {
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    /* Close on outside click */
    useEffect(() => {
      if (!open) return;
      function handleClick(e: MouseEvent) {
        if (
          containerRef.current &&
          !containerRef.current.contains(e.target as Node)
        ) {
          setOpen(false);
        }
      }
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    const selectedOption = options.find((o) => o.value === value);

    /* Border color by state */
    const borderColor = (() => {
      if (disabled) return "border-disable-alt";
      if (error) return "border-semantic-red";
      if (focused || open) return "border-brand-400 ring-1 ring-brand-400";
      return "border-border";
    })();

    const triggerClasses = [
      "flex w-full items-center justify-between",
      "h-12 rounded-md border px-4",
      "text-base leading-6 outline-none",
      "transition-all duration-200",
      borderColor,
      disabled
        ? "bg-disable-assistive text-disable-strong cursor-not-allowed"
        : "bg-white cursor-pointer",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className="relative flex flex-col" ref={containerRef}>
        {/* Hidden native select for form/accessibility */}
        {name && (
          <select
            name={name}
            value={value}
            onChange={() => {}}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          >
            <option value="">{placeholder}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}

        {/* Label */}
        {label && (
          <label className="mb-2 text-sm font-semibold leading-[22px] text-text-primary">
            {label}
          </label>
        )}

        {/* Trigger button */}
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          className={triggerClasses}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span
            className={
              selectedOption ? "text-text-primary" : "text-text-muted"
            }
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className={[
              "text-text-muted transition-transform duration-200",
              open ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>

        {/* Dropdown list */}
        {open && (
          <ul
            role="listbox"
            className={[
              "absolute top-full left-0 z-50 mt-1 w-full",
              "rounded-md border border-border bg-white",
              "shadow-md overflow-hidden",
              "max-h-60 overflow-y-auto",
            ].join(" ")}
          >
            {options.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={[
                  "flex items-center px-4 h-11 text-base leading-6 cursor-pointer",
                  "transition-colors duration-150",
                  option.value === value
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-text-primary hover:bg-bg-warm",
                ].join(" ")}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>
        )}

        {/* Helper text */}
        {helperText && (
          <span
            className={[
              "mt-1 text-xs leading-[18px]",
              error ? "text-semantic-red" : "text-text-sub",
            ].join(" ")}
          >
            {helperText}
          </span>
        )}
      </div>
    );
  },
);
