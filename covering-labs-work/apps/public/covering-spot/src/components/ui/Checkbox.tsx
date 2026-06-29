"use client";

import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from "react";

/* ─── Types ─── */
interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: boolean;
  indeterminate?: boolean;
}

/* ─── Icons ─── */
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IndeterminateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3 6H9"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ─── Component ─── */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      checked = false,
      indeterminate = false,
      disabled = false,
      error = false,
      label,
      className = "",
      ...rest
    },
    ref,
  ) {
    /* Handle indeterminate state on the native input */
    const internalRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    /* Merge refs */
    function setRefs(el: HTMLInputElement | null) {
      internalRef.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    }

    const isActive = checked || indeterminate;

    /* Box style */
    const boxColor = (() => {
      if (disabled && isActive) return "bg-disable-strong border-disable-strong";
      if (disabled) return "bg-disable-assistive border-disable-normal";
      if (error) return "border-semantic-red";
      if (isActive) return "bg-brand-400 border-brand-400";
      return "border-border-strong";
    })();

    return (
      <label
        className={[
          "inline-flex items-center gap-2",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Hidden native checkbox */}
        <input
          ref={setRefs}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="sr-only peer"
          {...rest}
        />

        {/* Custom checkbox */}
        <span
          className={[
            "relative flex shrink-0 items-center justify-center",
            "h-5 w-5 rounded-[4px] border-2",
            "transition-all duration-200",
            boxColor,
            /* Focus ring via peer */
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-400",
          ].join(" ")}
        >
          {isActive &&
            (indeterminate ? <IndeterminateIcon /> : <CheckIcon />)}
        </span>

        {/* Label text */}
        {label && (
          <span
            className={[
              "text-base leading-6",
              disabled ? "text-disable-strong" : "text-text-primary",
            ].join(" ")}
          >
            {label}
          </span>
        )}
      </label>
    );
  },
);
