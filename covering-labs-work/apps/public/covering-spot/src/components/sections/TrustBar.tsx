"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { trustStats } from "@/data/trust-stats";

/* ── 숫자 카운트업 (소수점 지원) ── */
function useCountUp(target: string, duration = 1200) {
  const [display, setDisplay] = useState("0");
  const [started, setStarted] = useState(false);

  const start = useCallback(() => setStarted(true), []);

  useEffect(() => {
    if (!started) return;

    const numMatch = target.match(/[\d.]+/);
    if (!numMatch) {
      setDisplay(target);
      return;
    }

    const end = parseFloat(numMatch[0]);
    const isDecimal = target.includes(".");
    const prefix = target.slice(0, numMatch.index);
    const suffix = target.slice((numMatch.index ?? 0) + numMatch[0].length);
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = end * eased;
      setDisplay(
        prefix + (isDecimal ? current.toFixed(1) : Math.round(current).toString()) + suffix,
      );
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }, [started, target, duration]);

  return { display, start };
}

function StatItem({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  const { display, start } = useCountUp(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [start]);

  return (
    <div ref={ref} className="text-center">
      <div className="text-[36px] font-extrabold tracking-[-1px] leading-none mb-3 flex items-baseline gap-1 justify-center max-md:text-[28px] text-text-primary">
        {display}
        {suffix && (
          <span className="text-[20px] font-bold text-primary max-md:text-[16px]">
            {suffix}
          </span>
        )}
      </div>
      <div className="text-[14px] text-text-sub font-medium">
        {label}
      </div>
    </div>
  );
}

export function TrustBar() {
  return (
    <div className="bg-bg-warm/60">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5 flex items-center justify-center py-14 gap-16 max-md:gap-8 max-md:flex-wrap max-sm:gap-x-8 max-sm:gap-y-6 max-sm:py-10">
        {trustStats.map((stat, i) => (
          <div key={stat.label} className="contents">
            {i > 0 && (
              <div className="w-px h-10 bg-border/40 max-sm:hidden" />
            )}
            <StatItem value={stat.value} suffix={stat.suffix} label={stat.label} />
          </div>
        ))}
      </div>
    </div>
  );
}
