"use client";

import { useEffect, useState } from "react";
import { CTALink } from "@/components/ui/CTALink";
import { KakaoIcon } from "@/components/ui/KakaoIcon";

export function FloatingCTA() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handle = () => {
      const heroCta = document.getElementById("hero-cta");
      const hero = document.getElementById("hero");
      const cta = document.getElementById("cta");
      if (!hero || !cta) return;

      // Hero CTA 버튼이 뷰포트에서 사라지면 즉시 표시
      const heroCtaGone = heroCta
        ? heroCta.getBoundingClientRect().bottom < 0
        : hero.getBoundingClientRect().bottom < 0;
      const ctaVisible = cta.getBoundingClientRect().top < window.innerHeight;
      // 페이지 하단 300px 이내면 숨김 (푸터/앱다운로드 영역)
      const nearBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 300;
      setShow(heroCtaGone && !ctaVisible && !nearBottom);
    };

    window.addEventListener("scroll", handle, { passive: true });
    handle();
    return () => window.removeEventListener("scroll", handle);
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[900] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        show
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0 pointer-events-none"
      }`}
    >
      {/* 모바일: 풀 와이드 */}
      <div className="md:hidden p-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] bg-white/70 backdrop-blur-2xl border-t border-border-light/60">
        <div className="flex gap-2">
          <CTALink
            location="floating"
            className="flex-1 flex items-center justify-center gap-2 bg-kakao text-text-primary text-[15px] font-bold py-3.5 rounded-md hover:bg-kakao-hover active:scale-[0.98] transition-all"
          >
            <KakaoIcon />
            <span>카톡으로 신청하기</span>
          </CTALink>
        </div>
      </div>

      {/* PC: 중앙 플로팅 바 */}
      <div className="hidden md:flex justify-center pb-6">
        <div className="flex items-center gap-3 p-3 bg-white/70 backdrop-blur-2xl rounded-lg shadow-lg border border-border-light/60">
          <CTALink
            location="floating"
            className="flex items-center gap-2.5 bg-kakao text-text-primary text-[15px] font-bold py-3 px-6 rounded-md hover:bg-kakao-hover hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
          >
            <KakaoIcon />
            <span>카카오톡으로 5분만에 신청하기</span>
          </CTALink>
        </div>
      </div>
    </div>
  );
}
