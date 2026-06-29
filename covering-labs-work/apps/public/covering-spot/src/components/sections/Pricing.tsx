import React from "react";
import { pricingItems } from "@/data/pricing-items";
import { features } from "@/data/features";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeader } from "@/components/ui/SectionHeader";

const featureIcons: Record<string, React.ReactNode> = {
  chat: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M5 6a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H11l-5 4V6z" fill="#DBEAFE" />
      <path d="M6 7a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H11.5l-4 3.5V7z" fill="#93C5FD" />
      <circle cx="11" cy="13" r="1.5" fill="#3B82F6" />
      <circle cx="16" cy="13" r="1.5" fill="#3B82F6" />
      <circle cx="21" cy="13" r="1.5" fill="#3B82F6" />
    </svg>
  ),
  clock: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" fill="#DBEAFE" />
      <circle cx="16" cy="16" r="11" fill="#EFF6FF" />
      <path d="M16 8v8l5.5 3" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="2" fill="#3B82F6" />
    </svg>
  ),
  home: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 4L4 14v13a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V14L16 4z" fill="#DBEAFE" />
      <path d="M16 4L4 14h24L16 4z" fill="#93C5FD" />
      <rect x="12" y="18" width="8" height="11" rx="1" fill="#EFF6FF" />
      <rect x="13.5" y="19.5" width="5" height="5" rx="0.5" fill="#3B82F6" opacity="0.3" />
    </svg>
  ),
  dollar: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="13" fill="#DBEAFE" />
      <circle cx="16" cy="16" r="11" fill="#EFF6FF" />
      <path d="M11 16l3.5 3.5L21 12" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function Pricing() {
  return (
    <section className="py-[120px] bg-bg max-md:py-20" id="pricing">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        {/* ── 견적 구성 ── */}
        <ScrollReveal>
          <SectionHeader
            tag="가격 안내"
            title="이렇게 견적이 정해져요"
            desc="명확한 기준으로 투명하게 안내드려요"
            center
          />
        </ScrollReveal>

        {/* 단일 카드 안에 테이블 형태로 구성 */}
        <ScrollReveal>
          <div className="max-w-[720px] mx-auto rounded-lg border border-border bg-bg-warm overflow-hidden">
            {pricingItems.map((item, i) => (
              <div
                key={item.title}
                className={`flex gap-6 px-10 py-8 max-sm:px-6 max-sm:py-6 max-sm:flex-col max-sm:gap-3 ${
                  i < pricingItems.length - 1
                    ? "border-b border-border"
                    : ""
                }`}
              >
                {/* 좌측: 라벨 + 제목 */}
                <div className="w-[200px] shrink-0 max-sm:w-full">
                  <span className="text-[12px] font-semibold text-primary tracking-[0.3px] leading-none">
                    {item.label}
                  </span>
                  <div className="text-[18px] font-bold mt-1.5 text-text-primary">
                    {item.title}
                  </div>
                </div>
                {/* 우측: 상세 설명 */}
                <div className="flex-1 text-[15px] text-text-sub leading-[1.8] whitespace-pre-line pt-0.5 max-sm:pt-0">
                  {item.detail}
                </div>
              </div>
            ))}

          </div>
        </ScrollReveal>

        {/* ── 왜 커버링인가요 ── */}
        <ScrollReveal>
          <div className="mt-[120px] max-md:mt-20">
            <div className="text-center mb-14 max-md:mb-10">
              <h3 className="text-[28px] font-extrabold tracking-[-0.8px] text-text-primary max-md:text-[24px]">
                왜 커버링인가요?
              </h3>
            </div>

            {/* 2x2 카드 그리드 */}
            <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
              {features.map((feat) => {
                const icon = featureIcons[feat.icon];
                const desc = feat.desc.replace(/\n/g, " ");
                return (
                  <div
                    key={feat.title}
                    className="rounded-lg border border-border bg-bg p-8 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30 transition-all duration-300"
                  >
                    <div className="w-14 h-14 rounded-lg bg-primary-tint flex items-center justify-center">
                      {icon}
                    </div>
                    <div className="text-lg font-bold text-text-primary mt-5 mb-2">
                      {feat.title}
                    </div>
                    <div className="text-[15px] text-text-sub leading-relaxed">
                      {desc}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
