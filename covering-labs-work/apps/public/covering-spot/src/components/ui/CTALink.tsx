"use client";

import { type MouseEvent, type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { KAKAO_BIZ_CHAT_URL } from "@/lib/constants";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    wcs?: {
      trans: (conv: Record<string, unknown>) => void;
      inflow: (domain: string) => void;
    };
    wcs_add?: Record<string, string>;
    wcs_do?: () => void;
  }
}

interface Props {
  location:
    | "hero"
    | "price"
    | "floating"
    | "bottom"
    | "nav"
    | "funnel"
    | "consult"
    | "after_consult";
  children: ReactNode;
  className?: string;
}

// fbq image beacon 발사 시간 확보용 지연.
// target="_blank" 즉시 navigate 시 페이지 백그라운드 전환으로 비콘이 끊기는 이슈 회피.
const TRACKING_DELAY_MS = 200;

// 광고 인입 시 카카오 비즈메시지에 보낼 extra 식별값.
// AnalyticsProvider 가 fbclid/utm_source 감지 시 sessionStorage 에 spot_inflow_source=meta_ad 저장,
// utm_campaign 이 있으면 spot_inflow_campaign 도 함께 저장 → 카카오 콘솔에서 광고별 매칭 가능.
//   광고 + utm_campaign:  web_ad_{campaign}  (예: web_ad_ad1)
//   광고 + utm_campaign 없음: web_ad         (fallback)
//   일반/직접 진입:        web_{location}    (web_hero, web_price, ...)
function resolveExtra(location: string): string {
  try {
    if (sessionStorage.getItem("spot_inflow_source") === "meta_ad") {
      const campaign = sessionStorage.getItem("spot_inflow_campaign");
      return campaign ? `web_ad_${campaign}` : "web_ad";
    }
  } catch { /* sessionStorage 차단 환경 무시 */ }
  return `web_${location}`;
}

export function CTALink({ location, children, className }: Props) {
  // SSR 시점에는 sessionStorage 접근 불가 → 기본값(web_{location})으로 렌더하고,
  // 클릭 시점에 분기. 우클릭 → "새 탭으로 링크 열기" 시에는 SSR href 그대로 가며 광고 인입 식별 못 함 (미세 케이스).
  const defaultHref = `${KAKAO_BIZ_CHAT_URL}?extra=web_${location}`;

  const fireTracking = () => {
    track("[CLICK] SpotHomeScreen_cta", { location });
    if (location === "funnel") {
      track("[CLICK] SpotBookingScreen_kakaoBtn", { location });
    }
    // 메타 표준 이벤트 'Contact'(한국어 UI 표시: "문의") — 광고 캠페인의 전환 이벤트
    // 매칭에 맞춰 'Lead'(잠재고객) 대신 사용. 카카오 상담 신청 흐름에 적합.
    window.fbq?.("track", "Contact", { location });
    try {
      window.wcs?.trans({ type: "lead" });
    } catch { /* Naver CTS 미로드/차단 환경 무시 */ }
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    fireTracking();

    // 새 탭 열기 modifier 키는 브라우저 기본 동작에 위임 — 트래킹만 발화하고 종료.
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    // 클릭 시점에 광고 인입 여부 확인하여 extra 분기.
    const targetHref = `${KAKAO_BIZ_CHAT_URL}?extra=${resolveExtra(location)}`;

    // 트래킹 비콘이 안전하게 발사될 시간 확보 후 navigate.
    event.preventDefault();
    window.setTimeout(() => {
      window.open(targetHref, "_blank", "noopener,noreferrer");
    }, TRACKING_DELAY_MS);
  };

  return (
    <a
      href={defaultHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
