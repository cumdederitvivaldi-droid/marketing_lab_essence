"use client";

import { useState, useEffect } from "react";
import { CTALink } from "@/components/ui/CTALink";
import { KakaoIcon } from "@/components/ui/KakaoIcon";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { BASE_PATH } from "@/lib/constants";

/* ── Wave Background CSS (inline keyframes) ── */
const waveStyles = `
@keyframes hero-wave-drift {
  0%   { transform: translateX(0) translateY(0); }
  50%  { transform: translateX(-40px) translateY(-12px); }
  100% { transform: translateX(0) translateY(0); }
}
@keyframes hero-wave-drift2 {
  0%   { transform: translateX(0) translateY(0); }
  50%  { transform: translateX(30px) translateY(-8px); }
  100% { transform: translateX(0) translateY(0); }
}
@keyframes hero-wave-drift3 {
  0%   { transform: translateX(0) translateY(0) scale(1); }
  50%  { transform: translateX(-20px) translateY(-16px) scale(1.03); }
  100% { transform: translateX(0) translateY(0) scale(1); }
}
@keyframes hero-text-reveal {
  0%   { opacity: 0; transform: translateY(24px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes hero-emphasis-glow {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
`;

/* ── 타이핑 인디케이터 ── */
function TypingIndicator() {
  return (
    <div className="flex items-end gap-1.5">
      <div className="px-4 py-3 bg-bg-warm2 rounded-[16px_16px_16px_4px] shadow-sm">
        <div className="flex gap-1 items-center h-[21px]">
          <span className="w-[6px] h-[6px] rounded-full bg-text-muted/60 animate-[typing_1.4s_ease-in-out_infinite]" />
          <span className="w-[6px] h-[6px] rounded-full bg-text-muted/60 animate-[typing_1.4s_ease-in-out_0.2s_infinite]" />
          <span className="w-[6px] h-[6px] rounded-full bg-text-muted/60 animate-[typing_1.4s_ease-in-out_0.4s_infinite]" />
        </div>
      </div>
    </div>
  );
}

/* ── 메시지 래퍼 (등장 애니메이션) ── */
function ChatMessage({
  children,
  visible,
  align = "left",
  delay = 0,
}: {
  children: React.ReactNode;
  visible: boolean;
  align?: "left" | "right";
  delay?: number;
}) {
  return (
    <div
      className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3"
      } ${align === "right" ? "flex justify-end items-end gap-1.5" : "flex items-end gap-1.5"}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ── Animated Wave Layer ── */
function WaveLayer({
  d,
  opacity,
  animationName,
  duration,
  top,
}: {
  d: string;
  opacity: number;
  animationName: string;
  duration: string;
  top: string;
}) {
  return (
    <svg
      viewBox="0 0 1440 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute w-[160%] left-[-30%]"
      preserveAspectRatio="none"
      style={{
        top,
        height: "320px",
        animation: `${animationName} ${duration} ease-in-out infinite`,
        opacity,
      }}
    >
      <path d={d} fill="#1AA3FF" />
    </svg>
  );
}

export function Hero() {
  const { ref: leftRef, visible: leftVisible } = useScrollReveal(0, true);
  const { ref: rightRef, visible: rightVisible } = useScrollReveal(0, true);

  /* ── 텍스트 등장 애니메이션 ── */
  const [textReady, setTextReady] = useState(false);

  useEffect(() => {
    if (leftVisible && !textReady) {
      setTextReady(true);
    }
  }, [leftVisible, textReady]);

  /* ── 채팅 애니메이션 시퀀스 ── */
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!rightVisible) return;
    // step 0: 카드 보임
    // step 1: 첫 유저 메시지 (0.4s)
    // step 2: 타이핑 인디케이터 (1.0s)
    // step 3: 봇 견적 응답 (2.0s)
    // step 4: 유저 감탄 메시지 (3.2s)
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 1000),
      setTimeout(() => setStep(3), 2000),
      setTimeout(() => setStep(4), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [rightVisible]);

  return (
    <section className="relative pt-[160px] pb-32 overflow-hidden max-md:pt-[128px] max-md:pb-24">
      {/* Inline keyframes */}
      <style dangerouslySetInnerHTML={{ __html: waveStyles }} />

      {/* Gradient Background - CDS brand tint */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#F8FAFB] to-[#E5F4FF] -z-10" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#1AA3FF]/[0.04] rounded-full blur-[120px] -z-10 translate-x-1/3 -translate-y-1/4" />

      {/* ── Animated Wave Background ── */}
      <div className="absolute inset-0 -z-[5] overflow-hidden pointer-events-none">
        {/* Wave 1 - 상단 넓은 파도 */}
        <WaveLayer
          d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,149.3C672,139,768,149,864,170.7C960,192,1056,224,1152,218.7C1248,213,1344,171,1392,149.3L1440,128L1440,320L0,320Z"
          opacity={0.06}
          animationName="hero-wave-drift"
          duration="8s"
          top="20%"
        />
        {/* Wave 2 - 중간 파도 */}
        <WaveLayer
          d="M0,224L48,213.3C96,203,192,181,288,186.7C384,192,480,224,576,234.7C672,245,768,235,864,208C960,181,1056,139,1152,133.3C1248,128,1344,160,1392,176L1440,192L1440,320L0,320Z"
          opacity={0.08}
          animationName="hero-wave-drift2"
          duration="10s"
          top="30%"
        />
        {/* Wave 3 - 하단 파도 */}
        <WaveLayer
          d="M0,256L48,261.3C96,267,192,277,288,272C384,267,480,245,576,240C672,235,768,245,864,261.3C960,277,1056,299,1152,293.3C1248,288,1344,256,1392,240L1440,224L1440,320L0,320Z"
          opacity={0.10}
          animationName="hero-wave-drift3"
          duration="12s"
          top="40%"
        />
      </div>

      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        <div className="grid grid-cols-[1fr_400px] items-center gap-16 max-lg:grid-cols-[1fr_360px] max-lg:gap-10 max-md:grid-cols-1 max-md:text-center">
          {/* Left: Text */}
          <div
            ref={leftRef}
            className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              leftVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white border border-border-light rounded-full px-4 py-2 text-sm font-semibold text-text-sub mb-8 shadow-sm">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-semantic-green opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-semantic-green" />
              </span>
              서울 · 경기 · 인천 전 지역 | 주 7일 운영
            </div>

            {/* Heading - Staggered Animation */}
            <h1 className="text-[56px] font-extrabold leading-[1.15] tracking-[-2.5px] mb-8 max-lg:text-[48px] max-lg:tracking-[-2px] max-md:text-[40px] max-md:tracking-[-1.5px] max-sm:text-[32px] max-sm:tracking-[-1px]">
              <span
                className="block overflow-hidden"
                style={{
                  opacity: 0,
                  animation: textReady
                    ? "hero-text-reveal 0.7s cubic-bezier(0.16,1,0.3,1) forwards"
                    : "none",
                }}
              >
                냉장고, 장롱, 이사 쓰레기도,
              </span>
              <span
                className="block overflow-hidden"
                style={{
                  opacity: 0,
                  animation: textReady
                    ? "hero-text-reveal 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s forwards"
                    : "none",
                }}
              >
                <span
                  className="text-primary inline-block"
                  style={{
                    backgroundImage: textReady
                      ? "linear-gradient(90deg, #1AA3FF 0%, #4DB5FF 40%, #80CAFF 50%, #4DB5FF 60%, #1AA3FF 100%)"
                      : "none",
                    backgroundSize: "200% 100%",
                    backgroundClip: "text",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: textReady ? "transparent" : undefined,
                    animation: textReady
                      ? "hero-emphasis-glow 4s ease-in-out 1.2s infinite"
                      : "none",
                  }}
                >
                  5분만에 수거신청 완료
                </span>
              </span>
            </h1>

            {/* Subtitle - Improved typography */}
            <div
              className="mb-10 max-w-[480px] max-md:max-w-none space-y-3"
              style={{
                opacity: 0,
                animation: textReady
                  ? "hero-text-reveal 0.7s cubic-bezier(0.16,1,0.3,1) 0.45s forwards"
                  : "none",
              }}
            >
              <p className="text-[20px] text-text-primary font-semibold leading-[1.6] max-md:text-[18px]">
                소량부터 대량까지, 카톡 한 번이면 끝
              </p>
              <p className="text-[17px] text-text-sub leading-[1.7] max-md:text-[15px]">
                사전 견적 = 최종 금액, 추가 비용 없는 투명한 가격
              </p>
            </div>

            {/* CTA Buttons */}
            <div
              id="hero-cta"
              className="flex gap-3 max-md:justify-center max-md:flex-col max-md:items-center"
              style={{
                opacity: 0,
                animation: textReady
                  ? "hero-text-reveal 0.7s cubic-bezier(0.16,1,0.3,1) 0.6s forwards"
                  : "none",
              }}
            >
              <CTALink
                location="hero"
                className="group inline-flex items-center gap-2.5 bg-kakao text-text-primary text-base font-bold py-[16px] px-8 rounded-lg shadow-sm hover:shadow-md hover:bg-kakao-hover hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 transition-all duration-200 max-md:w-full max-md:max-w-[320px] max-md:justify-center"
              >
                <KakaoIcon />
                <span>카카오톡으로 5분만에 신청하기</span>
              </CTALink>
            </div>
          </div>

          {/* Right: Chat Mockup with Live Animation */}
          <div
            ref={rightRef}
            className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              rightVisible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
            style={{ transitionDelay: "0.15s" }}
          >
            <div className="w-full max-w-[400px] bg-white rounded-lg shadow-lg overflow-hidden max-md:max-w-[340px] max-md:mx-auto border border-white/80 ring-1 ring-black/[0.04]">
              {/* Chat Header */}
              <div className="bg-gradient-to-r from-bg-warm to-white px-6 py-5 flex items-center gap-3.5 border-b border-border-light">
                <img src={`${BASE_PATH}/images/logo.png`} alt="커버링" className="w-10 h-10 rounded-md" />
                <div>
                  <div className="text-[15px] font-bold text-text-primary">
                    커버링 방문수거
                  </div>
                  <div className="text-[11px] text-semantic-green font-medium mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-semantic-green" />
                    10:00~22:00 주 7일 응답
                  </div>
                </div>
              </div>

              {/* Chat Messages - Animated Sequence */}
              <div className="p-5 flex flex-col gap-3 bg-gradient-to-b from-white to-bg-warm/40 h-[420px] max-sm:h-[390px]">
                {/* 1. User: 수거 문의 */}
                <ChatMessage visible={step >= 1} align="right">
                  <span className="text-[11px] text-text-muted shrink-0">
                    오후 2:03
                  </span>
                  <div className="max-w-[240px] px-4 py-3 text-[13px] leading-[1.6] break-keep bg-kakao rounded-[16px_16px_4px_16px] shadow-sm">
                    내일 오전 11시에 침대, 책상,
                    <br />
                    냉장고, 세탁기 수거 가능한가요?
                  </div>
                </ChatMessage>

                {/* 2. Typing indicator */}
                {step === 2 && <TypingIndicator />}

                {/* 3. Bot: 견적 응답 */}
                <ChatMessage visible={step >= 3} align="left">
                  <div className="max-w-[240px] px-4 py-3 text-[13px] leading-[1.6] break-keep bg-bg-warm2 rounded-[16px_16px_16px_4px] shadow-sm">
                    네! 가능합니다. 바로 견적 드릴게요 😊
                    <br />
                    <br />
                    <div className="space-y-0.5">
                      <div className="flex justify-between gap-4">
                        <span className="text-text-sub">침대 싱글 SET</span>
                        <span className="font-medium tabular-nums">50,000원</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-sub">책상</span>
                        <span className="font-medium tabular-nums">32,000원</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-sub">냉장고</span>
                        <span className="font-medium tabular-nums">35,000원</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-sub">세탁기</span>
                        <span className="font-medium tabular-nums">30,000원</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-sub">출장비</span>
                        <span className="font-medium tabular-nums">45,000원</span>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-border/50 flex justify-between gap-4">
                      <span className="font-bold">합계</span>
                      <span className="font-bold text-primary tabular-nums">192,000원</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-text-muted shrink-0">오후 2:05</span>
                </ChatMessage>

                {/* 4. User: 감탄 */}
                <ChatMessage visible={step >= 4} align="right" delay={0}>
                  <span className="text-[11px] text-text-muted shrink-0">
                    오후 2:06
                  </span>
                  <div className="max-w-[240px] px-4 py-3 text-[13px] leading-[1.6] break-keep bg-kakao rounded-[16px_16px_4px_16px] shadow-sm">
                    타 업체보다 훨씬 저렴하네요.
                    <br />
                    내일 바로 방문해주세요!
                  </div>
                </ChatMessage>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wave Divider */}
      <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-[0] -z-0">
        <svg
          viewBox="0 0 1440 56"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative block w-full h-[56px] max-md:h-[40px]"
          preserveAspectRatio="none"
        >
          <path
            d="M0 56V28C240 4 480 4 720 28C960 52 1200 52 1440 28V56H0Z"
            fill="white"
          />
        </svg>
      </div>
    </section>
  );
}
