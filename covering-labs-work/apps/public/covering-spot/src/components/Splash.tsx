"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { BASE_PATH } from "@/lib/constants";

const STORAGE_KEY = "spot_splash_shown";

export function Splash({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"check" | "splash" | "done">("check");

  useEffect(() => {
    // sessionStorage는 Safari 개인정보보호 모드 등에서 throw 가능
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) {
        setPhase("done");
        return;
      }
    } catch {
      setPhase("done");
      return;
    }

    // splash 표시
    setPhase("splash");

    // 0.8s fade-in + 0.3s fade-out = 1.1s 후 완료
    const timer = setTimeout(() => {
      try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch { /* 무시 */ }
      setPhase("done");
    }, 1100);

    return () => clearTimeout(timer);
  }, []);

  // 초기 체크 중에는 아무것도 안 보여줌 (깜빡임 방지)
  if (phase === "check") {
    return null;
  }

  return (
    <>
      {phase === "splash" && (
        <div className="splash-overlay" aria-hidden="true">
          <div className="splash-content">
            <Image
              src={`${BASE_PATH}/images/logo.png`}
              alt="커버링"
              width={56}
              height={56}
              className="splash-logo"
              priority
            />
            <span className="splash-text">5분만에 수거신청 완료</span>
          </div>
        </div>
      )}
      <div
        className={phase === "done" ? "splash-main-visible" : "splash-main-hidden"}
      >
        {children}
      </div>

      <style jsx global>{`
        /* ═══ Splash screen animations ═══ */
        @keyframes splash-fade-scale-in {
          0% {
            opacity: 0;
            transform: scale(0.92);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes splash-fade-out {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        .splash-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
          animation:
            splash-fade-scale-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards,
            splash-fade-out 0.3s ease-in 0.8s forwards;
          pointer-events: none;
        }

        .splash-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          animation: splash-fade-scale-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .splash-logo {
          width: 56px;
          height: 56px;
        }

        .splash-text {
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: var(--color-text-primary, #16191D);
          letter-spacing: -0.02em;
        }

        .splash-main-hidden {
          opacity: 0;
        }

        .splash-main-visible {
          opacity: 1;
          animation: splash-fade-scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </>
  );
}
