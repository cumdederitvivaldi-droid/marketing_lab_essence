"use client";

import { useRef, useEffect, useState } from "react";
import { compareCards, compareReasons } from "@/data/compare-data";
import { track } from "@/lib/analytics";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatPriceWon } from "@/lib/format";

/* ── helpers ── */

function extractPrice(text: string): number {
  const match = text.match(/([\d,]+)원/);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : 0;
}

/* ── bar color palettes ── */

const GOOD_COLORS = ["#1AA3FF", "#4DB5FF", "#80CAFF", "#B2DFFF"];
const BAD_BASE = "#8A96A8";
const BAD_EXTRA = "#FF3358";

/* ── sub-components ── */

function BarChart({
  card,
  maxTotal,
  animated,
  variant,
}: {
  card: (typeof compareCards)[0];
  maxTotal: number;
  animated: boolean;
  variant: "good" | "bad";
}) {
  const totalNum = card.lines.reduce((s, l) => s + extractPrice(l.text), 0);
  const isGood = variant === "good";

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* badge + method */}
      <div className="mb-5">
        <span
          className={`inline-flex items-center h-7 px-3 rounded-full text-[13px] font-semibold ${
            isGood
              ? "bg-primary-tint text-primary"
              : "bg-semantic-red-tint text-semantic-red"
          }`}
        >
          {card.badge}
        </span>
        <p className="text-[13px] text-text-muted mt-1.5">{card.method}</p>
      </div>

      {/* stacked horizontal bar */}
      <div className="relative h-14 rounded-sm overflow-hidden bg-border-light max-sm:h-12">
        <div
          className="absolute inset-y-0 left-0 flex transition-all ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            width: animated ? `${(totalNum / maxTotal) * 100}%` : "0%",
            transitionDuration: "1s",
          }}
        >
          {card.lines.map((line, i) => {
            const price = extractPrice(line.text);
            const pct = (price / totalNum) * 100;
            const color = isGood
              ? GOOD_COLORS[i % GOOD_COLORS.length]
              : line.isExtra
                ? BAD_EXTRA
                : BAD_BASE;

            return (
              <div
                key={i}
                className="h-full flex items-center justify-center overflow-hidden"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  transitionDelay: `${i * 0.08}s`,
                }}
              >
                {pct > 14 && (
                  <span className="text-[11px] font-semibold text-white whitespace-nowrap max-sm:text-[10px]">
                    {formatPriceWon(price)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* legend items */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {card.lines.map((line, i) => {
          const color = isGood
            ? GOOD_COLORS[i % GOOD_COLORS.length]
            : line.isExtra
              ? BAD_EXTRA
              : BAD_BASE;
          const label = line.text.split(":")[0].replace("+", "").trim();

          return (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: color }}
              />
              <span
                className={`text-[12px] ${
                  line.isExtra
                    ? "text-semantic-red font-medium"
                    : "text-text-muted"
                }`}
              >
                {label}
                {line.isExtra && (
                  <span className="text-[11px] text-text-muted ml-1">
                    추가
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* total */}
      <div className="mt-auto pt-5 flex items-baseline gap-3">
        <span className="text-[24px] font-bold tracking-[-0.3px] text-text-primary max-sm:text-lg">
          {card.total}
        </span>
        {isGood ? (
          <span className="text-[13px] font-medium text-text-muted">
            추가 비용 없음
          </span>
        ) : (
          <span className="text-[13px] font-medium text-semantic-red">
            {card.tag}
          </span>
        )}
      </div>
    </div>
  );
}

function ReasonItem({
  reason,
  index,
}: {
  reason: (typeof compareReasons)[0];
  index: number;
}) {
  return (
    <ScrollReveal delay={index * 0.08}>
      <div className="flex gap-3 items-baseline">
        <span className="text-[17px] font-bold text-semantic-orange shrink-0 max-sm:text-[15px]">
          {index + 1}.
        </span>
        <div>
          <span className="text-[17px] font-bold text-text-primary max-sm:text-[15px]">
            {reason.heading}
          </span>
          <p className="text-[15px] text-text-muted mt-1 leading-relaxed max-sm:text-[14px]">
            {reason.desc}
          </p>
        </div>
      </div>
    </ScrollReveal>
  );
}

/* ── main ── */

export function Compare() {
  const good = compareCards[0];
  const bad = compareCards[1];

  const goodTotal = good.lines.reduce((s, l) => s + extractPrice(l.text), 0);
  const badTotal = bad.lines.reduce((s, l) => s + extractPrice(l.text), 0);
  const maxTotal = Math.max(goodTotal, badTotal);
  const saving = badTotal - goodTotal;

  /* IntersectionObserver for bar animation */
  const barRef = useRef<HTMLDivElement>(null);
  const [barAnimated, setBarAnimated] = useState(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setBarAnimated(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setBarAnimated(true);
          track("[VIEW] SpotHomeScreen_compareSection");
          observer.unobserve(el);
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-[120px] bg-bg-warm max-md:py-20" id="compare">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        <ScrollReveal>
          <SectionHeader
            tag="가격 비교"
            title="같은 품목, 이렇게 다릅니다"
            desc="침대 (싱글 매트리스 + 프레임), 책상, 의류 박스 2개 기준"
            center
          />
        </ScrollReveal>

        {/* ── Bar Chart Comparison ── */}
        <ScrollReveal>
          <div
            ref={barRef}
            className="max-w-[800px] mx-auto bg-bg rounded-lg border border-border-light p-8 shadow-sm max-sm:p-5"
          >
            <div className="flex gap-10 max-md:flex-col max-md:gap-10">
              <BarChart
                card={good}
                maxTotal={maxTotal}
                animated={barAnimated}
                variant="good"
              />
              <div className="w-px bg-border-light self-stretch max-md:w-full max-md:h-px" />
              <BarChart
                card={bad}
                maxTotal={maxTotal}
                animated={barAnimated}
                variant="bad"
              />
            </div>

            {/* saving highlight */}
            <div
              className={`mt-8 pt-6 border-t border-border-light text-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                barAnimated
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-3"
              }`}
              style={{ transitionDelay: "0.8s" }}
            >
              <p className="text-[17px] text-text-sub max-sm:text-[15px]">
                같은 품목인데{" "}
                <span className="text-[22px] font-bold text-primary mx-1 max-sm:text-[20px]">
                  {formatPriceWon(saving)}
                </span>{" "}
                차이!
              </p>
            </div>
          </div>
        </ScrollReveal>

        {/* ── Reasons ── */}
        <div className="max-w-[800px] mx-auto mt-16">
          <ScrollReveal>
            <p className="text-[20px] font-bold text-text-primary mb-6 max-sm:text-[15px]">
              대부분의 업체가 이런 식으로 추가 비용을 붙여요
            </p>
          </ScrollReveal>

          <div className="flex flex-col gap-5">
            {compareReasons.map((reason, i) => (
              <ReasonItem key={i} reason={reason} index={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
