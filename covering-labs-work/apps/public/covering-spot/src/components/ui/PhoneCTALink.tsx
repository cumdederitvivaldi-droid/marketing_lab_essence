"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { track } from "@/lib/analytics";
import { CONSULT_PATH } from "@/lib/constants";

interface Props {
  location: "hero" | "floating" | "nav" | "success_card";
  children: ReactNode;
  className?: string;
}

// /consult 로 navigate 하는 통일된 CTA. CTALink (카카오) 와 짝을 이루는 컴포넌트.
// Next Link 를 통해 BASE_PATH 가 자동으로 prefix 됨.
export function PhoneCTALink({ location, children, className }: Props) {
  return (
    <Link
      href={CONSULT_PATH}
      className={className}
      onClick={() => track("[CLICK] SpotHomeScreen_phoneNav", { location })}
    >
      {children}
    </Link>
  );
}

// 사이즈는 호출부에서 className 으로 지정 (e.g. "w-4 h-4", "w-5 h-5"). 기본 currentColor stroke.
export function PhoneIcon({ className = "w-[18px] h-[18px]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
