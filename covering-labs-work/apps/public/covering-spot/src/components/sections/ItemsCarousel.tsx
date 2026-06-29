"use client";

import type { CarouselItem } from "@/types";
import { useCarousel } from "@/hooks/useCarousel";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { track } from "@/lib/analytics";

interface Props {
  items: CarouselItem[];
}

export function ItemsCarousel({ items }: Props) {
  const {
    trackRef,
    wrapperRef,
    currentPage,
    totalPages,
    goTo,
    next,
    prev,
    stopAutoplay,
    startAutoplay,
  } = useCarousel({ totalItems: items.length });

  return (
    <section className="py-[120px] bg-bg max-md:py-20" id="items">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        <ScrollReveal>
          <SectionHeader
            tag="품목 안내"
            title="수거 가능한 품목"
            desc="가구부터 가전, 운동기구까지 500여 가지 대형 폐기물을 수거해요"
          />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div className="relative">
            <div ref={wrapperRef} className="overflow-hidden w-full">
              <div
                ref={trackRef}
                className="carousel-track flex gap-5 transition-transform duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]"
              >
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="min-w-[300px] max-w-[300px] bg-bg rounded-lg overflow-hidden shrink-0 border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg max-md:min-w-[260px] max-md:max-w-[260px] max-sm:min-w-[240px] max-sm:max-w-[240px]"
                  >
                    <div className="overflow-hidden relative bg-bg-warm2">
                      <img
                        src={item.image}
                        alt={item.alt}
                        className="w-full h-[200px] object-cover transition-transform duration-400 hover:scale-[1.04] pointer-events-none max-md:h-[170px] max-sm:h-[150px]"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = "none";
                        }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-black/[0.03] to-transparent pointer-events-none" />
                    </div>
                    <div className="px-5 py-4 pb-5">
                      <div className="text-base font-bold text-text-primary">
                        {item.title}
                      </div>
                      <div className="text-[15px] font-bold text-primary mt-1">
                        {item.price}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrows */}
            <button
              onClick={() => {
                stopAutoplay();
                prev();
                startAutoplay();
                track("[CLICK] SpotHomeScreen_carousel", { type: "arrow", direction: "left" });
              }}
              className="absolute top-1/2 -translate-y-1/2 z-[2] w-11 h-11 rounded-full bg-bg border border-border cursor-pointer flex items-center justify-center shadow-md transition-all hover:shadow-lg hover:border-[#CBD5E1] hover:text-text-primary text-text-sub -left-[22px] max-lg:left-2 max-md:w-9 max-md:h-9"
              style={{ opacity: currentPage === 0 ? 0.35 : 1 }}
              aria-label="이전"
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                className="max-md:w-4 max-md:h-4"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => {
                stopAutoplay();
                next();
                startAutoplay();
                track("[CLICK] SpotHomeScreen_carousel", { type: "arrow", direction: "right" });
              }}
              className="absolute top-1/2 -translate-y-1/2 z-[2] w-11 h-11 rounded-full bg-bg border border-border cursor-pointer flex items-center justify-center shadow-md transition-all hover:shadow-lg hover:border-[#CBD5E1] hover:text-text-primary text-text-sub -right-[22px] max-lg:right-2 max-md:w-9 max-md:h-9"
              style={{ opacity: currentPage >= totalPages - 1 ? 0.35 : 1 }}
              aria-label="다음"
            >
              <svg
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                className="max-md:w-4 max-md:h-4"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </ScrollReveal>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button
              key={i}
              onClick={() => {
                goTo(i);
                track("[CLICK] SpotHomeScreen_carousel", { type: "dot" });
              }}
              className={`h-2 rounded-full border-none cursor-pointer p-0 transition-all duration-300 ${
                i === currentPage
                  ? "bg-primary w-6 rounded-[4px]"
                  : "bg-border w-2"
              }`}
              aria-label={`페이지 ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
