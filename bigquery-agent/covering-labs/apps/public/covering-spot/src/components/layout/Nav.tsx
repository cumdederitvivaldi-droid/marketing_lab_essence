"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useScrollPosition } from "@/hooks/useScrollPosition";
import { BASE_PATH } from "@/lib/constants";

const NAV_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "서비스", href: "#pricing" },
  { label: "가격", href: "#item-price" },
  { label: "FAQ", href: "#faq" },
  { label: "고객 후기", href: "https://blog.covering.app/", external: true },
];

export function Nav() {
  const scrollY = useScrollPosition();
  const scrolled = scrollY > 10;
  const [menuOpen, setMenuOpen] = useState(false);

  // 스크롤 시 메뉴 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("scroll", close, { passive: true });
    return () => window.removeEventListener("scroll", close);
  }, [menuOpen]);

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  return (
    <nav
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-40px)] max-w-[1160px] flex flex-col rounded-lg transition-all duration-300 max-sm:top-2 max-sm:w-[calc(100%-16px)] ${
        scrolled
          ? "bg-white/80 backdrop-blur-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.06)] border border-white/60"
          : "bg-white/60 backdrop-blur-[12px] border border-white/40"
      }`}
    >
      <div className="px-6 max-sm:px-4 h-14 flex justify-between items-center w-full">
        <a
          href={`${BASE_PATH}/`}
          className="flex items-center gap-2 font-bold text-[16px] text-text-primary no-underline"
        >
          <Image
            src={`${BASE_PATH}/images/logo.png`}
            alt="커버링"
            width={28}
            height={28}
            className="w-7 h-7"
          />
          <span className="max-sm:text-[14px]">커버링 방문 수거</span>
        </a>

        <div className="flex items-center gap-0.5">
          {/* PC 네비 링크 */}
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-sub no-underline text-[13px] font-medium px-3 py-1.5 rounded-sm transition-all hover:text-text-primary hover:bg-black/[0.04] max-md:hidden"
              >
                {link.label}
              </a>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className="text-text-sub no-underline text-[13px] font-medium px-3 py-1.5 rounded-sm transition-all hover:text-text-primary hover:bg-black/[0.04] max-md:hidden"
              >
                {link.label}
              </a>
            ),
          )}
          {/* 모바일 햄버거 */}
          <button
            onClick={toggleMenu}
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="md:hidden ml-1.5 flex items-center justify-center w-10 h-10 rounded-md transition-all hover:bg-black/[0.04] active:scale-95"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-text-primary"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      <div
        id="mobile-menu"
        className={`md:hidden overflow-hidden transition-all duration-200 ease-out ${
          menuOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 pt-1 flex flex-col gap-1 border-t border-border-light/40">
          {NAV_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="text-text-sub no-underline text-[14px] font-medium px-3 py-2.5 rounded-md transition-all hover:text-text-primary hover:bg-black/[0.04] active:bg-black/[0.06]"
              >
                {link.label}
              </a>
            ) : (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-text-sub no-underline text-[14px] font-medium px-3 py-2.5 rounded-md transition-all hover:text-text-primary hover:bg-black/[0.04] active:bg-black/[0.06]"
              >
                {link.label}
              </a>
            ),
          )}
        </div>
      </div>
    </nav>
  );
}
