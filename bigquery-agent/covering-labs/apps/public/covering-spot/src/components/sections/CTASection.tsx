"use client";

import { CTALink } from "@/components/ui/CTALink";
import { KakaoIcon } from "@/components/ui/KakaoIcon";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export function CTASection() {
  return (
    <section
      className="py-[120px] text-center bg-gradient-to-br from-[#0B1120] via-[#0F172A] to-[#162032] relative overflow-hidden max-md:py-20"
      id="cta"
    >
      {/* Primary radial glow */}
      <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle_at_30%_50%,rgba(26,163,255,0.12)_0%,transparent_50%)] pointer-events-none" />
      {/* Secondary glow - right side */}
      <div className="absolute -bottom-1/2 -right-1/4 w-[150%] h-[150%] bg-[radial-gradient(circle_at_70%_60%,rgba(26,163,255,0.08)_0%,transparent_45%)] pointer-events-none" />
      {/* Subtle dot pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5 relative">
        <ScrollReveal>
          <h2 className="text-[44px] font-extrabold tracking-[-1.5px] leading-[1.15] text-white max-md:text-[32px]">
            지금 바로
            <br />
            수거 신청하세요
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <p className="text-[17px] text-[#94A3B8] mt-5 mb-10">
            카톡 한 번이면 간편하게 수거 신청 완료
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.2}>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <CTALink
              location="bottom"
              className="inline-flex items-center gap-2 bg-kakao text-text-primary text-[17px] font-bold py-[17px] px-9 rounded-lg hover:bg-kakao-hover hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(250,225,0,0.2)] active:scale-[0.98] transition-all duration-300 ease-out"
            >
              <KakaoIcon />
              <span>카카오톡으로 5분만에 신청하기</span>
            </CTALink>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={0.3}>
          <p className="text-sm text-[#64748B] mt-8 leading-relaxed tracking-wide">
            <span className="inline-flex items-center gap-2 max-sm:flex-col max-sm:gap-1">
              <span>소량/대량 상관없이</span>
              <span className="w-1 h-1 rounded-full bg-[#475569] max-sm:hidden" />
              <span>평일/주말/공휴일 상관없이</span>
            </span>
            <br />
            언제든 편하게 문의하세요
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
