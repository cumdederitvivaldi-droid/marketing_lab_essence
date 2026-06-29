"use client";

import { useRef, useState, useEffect } from "react";
import { processSteps } from "@/data/process-steps";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

/* ── 스텝별 듀오톤 아이콘 ── */
const stepIcons: React.ReactNode[] = [
  /* 01 수거 신청 - 클립보드 */
  <svg key="s1" width="28" height="28" viewBox="0 0 32 32" fill="none">
    <rect x="7" y="4" width="18" height="24" rx="3" fill="#93C5FD" />
    <rect x="8" y="8" width="16" height="19" rx="2" fill="#EFF6FF" />
    <rect x="11" y="2" width="10" height="5" rx="2" fill="#3B82F6" />
    <rect x="11" y="13" width="10" height="2" rx="1" fill="#93C5FD" />
    <rect x="11" y="18" width="7" height="2" rx="1" fill="#93C5FD" />
  </svg>,
  /* 02 커버링 방문 - 트럭 */
  <svg key="s2" width="28" height="28" viewBox="0 0 32 32" fill="none">
    <rect x="2" y="10" width="18" height="12" rx="2" fill="#93C5FD" />
    <path d="M20 14h6l4 5v3h-10v-8z" fill="#DBEAFE" />
    <rect x="20" y="14" width="10" height="8" rx="1" fill="#60A5FA" opacity="0.5" />
    <circle cx="9" cy="24" r="3" fill="#3B82F6" /><circle cx="9" cy="24" r="1.5" fill="#EFF6FF" />
    <circle cx="25" cy="24" r="3" fill="#3B82F6" /><circle cx="25" cy="24" r="1.5" fill="#EFF6FF" />
  </svg>,
  /* 03 수거 완료 - 체크박스 */
  <svg key="s3" width="28" height="28" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="4" width="24" height="24" rx="5" fill="#DBEAFE" />
    <rect x="6" y="6" width="20" height="20" rx="3" fill="#EFF6FF" />
    <path d="M11 16l4 4L22 12" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  /* 04 정산 - 영수증 */
  <svg key="s4" width="28" height="28" viewBox="0 0 32 32" fill="none">
    <path d="M8 4h16a2 2 0 0 1 2 2v22l-3-2-3 2-3-2-3 2-3-2-3 2V6a2 2 0 0 1 2-2z" fill="#DBEAFE" />
    <path d="M9 5h14a1 1 0 0 1 1 1v20l-2.5-1.5-2.5 1.5-2.5-1.5L14 27l-2.5-1.5L9 27V6a1 1 0 0 1 0 0z" fill="#EFF6FF" />
    <rect x="12" y="10" width="8" height="2" rx="1" fill="#93C5FD" />
    <rect x="12" y="15" width="6" height="2" rx="1" fill="#93C5FD" />
    <rect x="12" y="20" width="8" height="2" rx="1" fill="#3B82F6" />
  </svg>,
];

function ProcessCard({ step, index }: { step: typeof processSteps[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* 스텝 간 연결선 (마지막 카드 제외) */}
      {index < processSteps.length - 1 && (
        <div className="absolute top-10 -right-8 w-8 h-[2px] z-[1] max-lg:hidden">
          <div className="w-full h-full border-t-2 border-dashed border-primary/20" />
          <svg
            className="absolute -right-1 top-1/2 -translate-y-1/2 text-primary/30"
            width="8"
            height="10"
            viewBox="0 0 8 10"
            fill="currentColor"
          >
            <path d="M0 0L8 5L0 10V0Z" />
          </svg>
        </div>
      )}
      <div className="bg-bg rounded-lg p-8 text-left border border-border transition-all duration-300 hover:-translate-y-1 hover:shadow-hover">
        {/* 아이콘 + 번호 영역 */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-md bg-primary-bg flex items-center justify-center overflow-hidden"
            style={{
              animation: visible ? `icon-bounce-in 0.6s cubic-bezier(0.16,1,0.3,1) ${index * 0.15}s both` : "none",
            }}
          >
            {stepIcons[index]}
            {/* 반짝임 오버레이 */}
            {visible && (
              <div
                className="absolute top-0 left-0 w-3 h-full pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)",
                  animation: `icon-shimmer 0.5s ease-out ${0.4 + index * 0.15}s both`,
                  position: "absolute",
                }}
              />
            )}
          </div>
          <span className="text-[13px] font-bold text-primary/50 tracking-wider">
            STEP {step.num}
          </span>
        </div>
        <div className="text-xl font-bold mb-3">{step.title}</div>
        <div className="text-[15px] text-text-sub leading-relaxed whitespace-pre-line">
          {step.desc}
        </div>
      </div>
    </div>
  );
}

export function Process() {
  return (
    <section className="py-[120px] bg-bg-warm max-md:py-20" id="process">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        <ScrollReveal>
          <SectionHeader
            tag="이용 방법"
            title="간단한 4단계"
            desc="복잡한 절차 없이, 신청부터 수거까지 쉽고 빠르게"
            center
          />
        </ScrollReveal>
        <div className="grid grid-cols-4 gap-8 max-lg:grid-cols-2 max-lg:gap-6 max-sm:grid-cols-1 max-sm:gap-4">
          {processSteps.map((step, i) => (
            <ScrollReveal key={step.num} delay={i * 0.1}>
              <ProcessCard step={step} index={i} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
