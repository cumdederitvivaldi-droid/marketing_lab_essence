"use client";

import { useState, useRef, useEffect } from "react";
import type { PriceCategory } from "@/types";
import { CTALink } from "@/components/ui/CTALink";
import { KakaoIcon } from "@/components/ui/KakaoIcon";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { track } from "@/lib/analytics";

/* ── SVG 아이콘 (Illustrated duotone style) ── */
const icons: Record<string, React.ReactNode> = {
  sofa: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="10" width="24" height="10" rx="3" fill="#DBEAFE" />
      <path d="M6 14c0-3.3 2.7-6 6-6h8c3.3 0 6 2.7 6 6" fill="#93C5FD" />
      <rect x="3" y="16" width="26" height="5" rx="2.5" fill="#3B82F6" />
      <rect x="6" y="21" width="3" height="3" rx="1" fill="#1E40AF" />
      <rect x="23" y="21" width="3" height="3" rx="1" fill="#1E40AF" />
      <path d="M8 16v-3a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v3" fill="#60A5FA" />
      <path d="M22 16v-3a1 1 0 0 1 1-1h0a1 1 0 0 1 1 1v3" fill="#60A5FA" />
    </svg>
  ),
  bed: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="18" width="26" height="4" rx="2" fill="#3B82F6" />
      <rect x="5" y="12" width="22" height="6" rx="2" fill="#93C5FD" />
      <rect x="6" y="9" width="7" height="5" rx="2.5" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1" />
      <rect x="15" y="9" width="7" height="5" rx="2.5" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1" />
      <rect x="5" y="22" width="2" height="3" rx="1" fill="#1E40AF" />
      <rect x="25" y="22" width="2" height="3" rx="1" fill="#1E40AF" />
    </svg>
  ),
  wardrobe: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="5" y="4" width="22" height="23" rx="3" fill="#93C5FD" />
      <rect x="6" y="5" width="10" height="21" rx="2" fill="#DBEAFE" />
      <rect x="16" y="5" width="10" height="21" rx="2" fill="#EFF6FF" />
      <line x1="16" y1="5" x2="16" y2="26" stroke="#3B82F6" strokeWidth="1.5" />
      <circle cx="13" cy="15" r="1.2" fill="#3B82F6" />
      <circle cx="19" cy="15" r="1.2" fill="#3B82F6" />
      <rect x="7" y="27" width="4" height="2" rx="1" fill="#1E40AF" />
      <rect x="21" y="27" width="4" height="2" rx="1" fill="#1E40AF" />
    </svg>
  ),
  table: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="10" width="26" height="4" rx="2" fill="#3B82F6" />
      <rect x="4" y="9" width="24" height="3" rx="1.5" fill="#60A5FA" />
      <rect x="6" y="14" width="3" height="12" rx="1.5" fill="#93C5FD" />
      <rect x="23" y="14" width="3" height="12" rx="1.5" fill="#93C5FD" />
      <path d="M6 26h6M20 26h6" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  desk: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="10" width="26" height="3.5" rx="1.5" fill="#3B82F6" />
      <rect x="5" y="13.5" width="3" height="12" rx="1.5" fill="#93C5FD" />
      <rect x="24" y="13.5" width="3" height="12" rx="1.5" fill="#93C5FD" />
      <rect x="17" y="13.5" width="10" height="5" rx="1.5" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1" />
      <rect x="17" y="18.5" width="10" height="5" rx="1.5" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1" />
      <circle cx="22" cy="16" r="0.8" fill="#3B82F6" />
      <circle cx="22" cy="21" r="0.8" fill="#3B82F6" />
    </svg>
  ),
  fridge: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="7" y="2" width="18" height="28" rx="3" fill="#93C5FD" />
      <rect x="8" y="3" width="16" height="11" rx="2" fill="#DBEAFE" />
      <rect x="8" y="15" width="16" height="14" rx="2" fill="#EFF6FF" />
      <line x1="8" y1="14.5" x2="24" y2="14.5" stroke="#3B82F6" strokeWidth="1.5" />
      <rect x="11" y="7" width="1.5" height="4" rx="0.75" fill="#3B82F6" />
      <rect x="11" y="18" width="1.5" height="6" rx="0.75" fill="#3B82F6" />
    </svg>
  ),
  washer: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="5" y="3" width="22" height="27" rx="3" fill="#93C5FD" />
      <rect x="6" y="4" width="20" height="6" rx="2" fill="#DBEAFE" />
      <circle cx="16" cy="19" r="7" fill="#EFF6FF" />
      <circle cx="16" cy="19" r="5" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1" />
      <path d="M13 17c1-1.5 2.5-1.5 3 0s2 1.5 3 0" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="10" cy="7" r="1.2" fill="#3B82F6" />
      <circle cx="14" cy="7" r="1.2" fill="#60A5FA" />
    </svg>
  ),
  aircon: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="5" width="26" height="12" rx="3" fill="#93C5FD" />
      <rect x="4" y="6" width="24" height="10" rx="2" fill="#DBEAFE" />
      <rect x="6" y="12" width="20" height="2" rx="1" fill="#3B82F6" opacity="0.6" />
      <path d="M10 17v4c0 2 2 3 3.5 1.5" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 17v5" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22 17v4c0 2-2 3-3.5 1.5" stroke="#60A5FA" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  tv: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="5" width="26" height="17" rx="2.5" fill="#1E40AF" />
      <rect x="4.5" y="6.5" width="23" height="14" rx="1.5" fill="#DBEAFE" />
      <path d="M5 7l22 13M5 20l22-13" stroke="#EFF6FF" strokeWidth="0.5" opacity="0.5" />
      <rect x="13" y="22" width="6" height="3" rx="1" fill="#93C5FD" />
      <rect x="10" y="25" width="12" height="2" rx="1" fill="#3B82F6" />
    </svg>
  ),
  kitchen: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="7" y="14" width="4" height="14" rx="2" fill="#93C5FD" />
      <path d="M8 4v6a3 3 0 0 0 3 3v0" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M11 4v6" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 4v6a3 3 0 0 1-3 3" stroke="#3B82F6" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="20" y="4" width="6" height="24" rx="3" fill="#DBEAFE" />
      <path d="M23 4c-2.8 0-5 2.2-5 5v5a3 3 0 0 0 3 3h2" fill="#93C5FD" />
      <rect x="22" y="8" width="1.5" height="5" rx="0.75" fill="#3B82F6" />
    </svg>
  ),
  storage: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="5" y="3" width="22" height="9" rx="2" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="1" />
      <rect x="5" y="13" width="22" height="9" rx="2" fill="#EFF6FF" stroke="#93C5FD" strokeWidth="1" />
      <rect x="13" y="6.5" width="6" height="2" rx="1" fill="#3B82F6" />
      <rect x="13" y="16.5" width="6" height="2" rx="1" fill="#3B82F6" />
      <rect x="5" y="23" width="22" height="3" rx="1.5" fill="#93C5FD" />
      <rect x="8" y="26" width="3" height="2" rx="1" fill="#1E40AF" />
      <rect x="21" y="26" width="3" height="2" rx="1" fill="#1E40AF" />
    </svg>
  ),
  fitness: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="11" width="6" height="10" rx="2" fill="#3B82F6" />
      <rect x="24" y="11" width="6" height="10" rx="2" fill="#3B82F6" />
      <rect x="6" y="13" width="4" height="6" rx="1.5" fill="#60A5FA" />
      <rect x="22" y="13" width="4" height="6" rx="1.5" fill="#60A5FA" />
      <rect x="10" y="14.5" width="12" height="3" rx="1.5" fill="#93C5FD" />
    </svg>
  ),
  music: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <path d="M12 22V7l14-3v15" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="8" cy="23" r="4" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
      <circle cx="22" cy="20" r="4" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5" />
      <path d="M12 12l14-3" stroke="#3B82F6" strokeWidth="1.5" />
    </svg>
  ),
  appliance: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <rect x="4" y="4" width="24" height="24" rx="4" fill="#DBEAFE" />
      <rect x="5" y="5" width="22" height="22" rx="3" fill="#EFF6FF" />
      <circle cx="16" cy="16" r="6" fill="#93C5FD" />
      <circle cx="16" cy="16" r="3" fill="#DBEAFE" />
      <path d="M16 10v6l4 2" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  etc: (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <path d="M16 3L28 10v12l-12 7L4 22V10l12-7z" fill="#DBEAFE" />
      <path d="M16 3L28 10v12l-12 7L4 22V10l12-7z" stroke="#93C5FD" strokeWidth="1.5" />
      <path d="M4 10l12 7 12-7" stroke="#3B82F6" strokeWidth="1.5" />
      <path d="M16 29V17" stroke="#3B82F6" strokeWidth="1.5" />
      <circle cx="16" cy="14" r="3" fill="#60A5FA" opacity="0.5" />
    </svg>
  ),
};

interface Props {
  categories: PriceCategory[];
}

export function ItemPrices({ categories }: Props) {
  const [activeId, setActiveId] = useState<string | null>(categories[0].id);
  const cardRef = useRef<HTMLDivElement>(null);
  const [barsAnimated, setBarsAnimated] = useState(false);

  const active = categories.find((c) => c.id === activeId) ?? categories[0];

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBarsAnimated(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setBarsAnimated(false);
    const timer = setTimeout(() => setBarsAnimated(true), 50);
    return () => clearTimeout(timer);
  }, [activeId]);

  return (
    <section className="py-[120px] bg-bg-warm max-md:py-20" id="item-price">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        <ScrollReveal>
          <SectionHeader
            tag="투명한 가격"
            title="품목별 예상 가격"
            desc="정확한 품목별 가격은 수거 신청 후 확정돼요"
            center
          />
        </ScrollReveal>

        {/* Tab selector - scrollable on mobile */}
        <ScrollReveal>
          <div className="flex gap-2 mb-12 flex-wrap justify-center max-md:justify-start max-md:overflow-x-auto max-md:flex-nowrap max-md:-mx-5 max-md:px-5 max-md:pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  if (activeId === cat.id) {
                    setActiveId(null);
                  } else {
                    setActiveId(cat.id);
                    track("[CLICK] SpotHomeScreen_priceTab", { item: cat.id });
                  }
                }}
                className={`group flex items-center gap-2 py-3 px-5 rounded-full font-semibold text-sm border cursor-pointer transition-all duration-300 ease-out whitespace-nowrap shrink-0 hover:-translate-y-0.5 active:scale-[0.97] ${
                  cat.id === activeId
                    ? "bg-primary text-white border-primary shadow-[0_4px_16px_rgba(26,163,255,0.3)]"
                    : "bg-bg text-text-primary border-border hover:border-primary/40 hover:shadow-md"
                }`}
              >
                <span className="flex items-center shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-125 group-active:scale-95">
                  {icons[cat.icon] || icons.etc}
                </span>
                {cat.title}
              </button>
            ))}
          </div>
        </ScrollReveal>

        {/* Price card */}
        {activeId !== null && <ScrollReveal>
          <div
            ref={cardRef}
            className="max-w-[640px] mx-auto bg-bg rounded-lg p-10 border border-border/80 shadow-[0_4px_24px_rgba(0,0,0,0.06),0_1px_4px_rgba(0,0,0,0.04)] max-md:p-7"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 rounded-lg bg-primary-tint/50 flex items-center justify-center shrink-0 max-md:w-12 max-md:h-12 animate-[icon-pop_0.4s_ease-out]" key={active.id}>
                {icons[active.icon] || icons.etc}
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1 max-md:text-xl">
                  {active.title}
                </h3>
                <p className="text-[15px] text-text-sub">{active.subtitle}</p>
              </div>
            </div>

            <div>
              {active.rows.map((row, i) => (
                <div key={i} className={i < active.rows.length - 1 ? "mb-5" : ""}>
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-[15px] font-medium text-text-sub">
                      {row.label}
                    </span>
                    <span className="text-base font-bold text-text-primary tracking-[-0.3px]">
                      {row.value}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-bg-warm2 rounded-[5px] overflow-hidden">
                    <div
                      className="price-bar-fill h-full rounded-[5px] bg-gradient-to-r from-primary to-primary-light"
                      style={
                        { "--target-width": `${row.barPercent}%` } as React.CSSProperties
                      }
                      ref={(el) => {
                        if (el && barsAnimated) {
                          el.classList.add("animated");
                        } else if (el) {
                          el.classList.remove("animated");
                        }
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-text-muted mt-6 text-center">부가세 포함 기준 가격입니다</p>

            <div className="mt-4 flex flex-col items-center gap-3">
              <CTALink
                location="price"
                className="flex items-center justify-center gap-2 w-full bg-kakao text-text-primary text-base font-bold py-4 rounded-lg hover:bg-kakao-hover hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(250,225,0,0.2)] active:scale-[0.98] transition-all duration-300 ease-out"
              >
                <KakaoIcon size={18} />
                <span>카카오톡으로 5분만에 신청하기</span>
              </CTALink>
            </div>
          </div>
        </ScrollReveal>}
      </div>
    </section>
  );
}
