"use client";

import { useRouter, usePathname } from "next/navigation";

/**
 * 백오피스 좌상단 커버링 심볼 — 클릭 시 대시보드로 이동
 * 대시보드 자체에서는 링크 비활성(현재 페이지)
 */
export function AdminLogo() {
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === "/admin/dashboard";

  const symbol = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/logo.png"
      alt="커버링"
      className="w-7 h-7 object-contain shrink-0 rounded-sm"
    />
  );

  if (isDashboard) return symbol;

  return (
    <button
      onClick={() => router.push("/admin/dashboard")}
      className="hover:opacity-80 transition-opacity"
      aria-label="대시보드로 이동"
    >
      {symbol}
    </button>
  );
}
