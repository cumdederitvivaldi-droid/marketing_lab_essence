"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReferralRouteData } from '@/utils/types';
import { buildInviteeTitle } from '@/utils/referralMeta';
import { BASE_PATH } from '@/utils/basePath';
import ReferralRouteState from '@/components/ReferralRouteState';
import { initAnalytics, trackInviterView, trackInviterShareClick, trackInviterCopyFallback } from '@/utils/analytics';

/* ------------------------------------------------------------------ */
/*  Kakao SDK type declarations                                       */
/* ------------------------------------------------------------------ */

interface KakaoShareFeedContent {
  title: string;
  description?: string;
  imageUrl: string;
  link: { mobileWebUrl: string; webUrl: string };
}

interface KakaoShareFeedButton {
  title: string;
  link: { mobileWebUrl: string; webUrl: string };
}

interface KakaoShareSendDefaultParams {
  objectType: 'feed';
  content: KakaoShareFeedContent;
  buttons: KakaoShareFeedButton[];
}

interface KakaoShare {
  sendDefault: (params: KakaoShareSendDefaultParams) => void;
}

interface KakaoStatic {
  init: (appKey: string) => void;
  isInitialized: () => boolean;
  Share: KakaoShare;
}

declare global {
  interface Window {
    Kakao?: KakaoStatic;
  }
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_VARIANT = 'friend_invite_v1';
const PUBLIC_INVITE_CODE = 'public';
const PUBLIC_VARIANT = 'friend_invite_v1_public';
const PUBLIC_FROM = 'public_share';
const KAKAO_IMAGE_PATH = `${BASE_PATH}/assets/figma/referral-og-card.png?v=2`;
const KAKAO_SDK_URL = 'https://developers.kakao.com/sdk/js/kakao.min.js';
const KAKAO_SDK_READY_TIMEOUT_MS = 3000;
const KAKAO_SDK_READY_POLL_MS = 50;
const CTA_RESTORE_DELAY_MS = 200;
const CTA_TRANSITION_MS = 600;
const HERO_ROLL_INTERVAL_MS = 2200;
const HERO_ROLL_TRANSITION_MS = 520;
const HERO_ROLL_MESSAGES = [
  '아이가 있는',
  '이사 직전인',
  '배달을 많이 먹는',
  '냉장고 청소 필요한',
  '야근으로 바쁜',
  '혼자 사는',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function buildInviteeLandingUrl(route: ReferralRouteData) {
  if (route.mode !== 'live' || !route.inviteCode) {
    const url = new URL(window.location.origin);
    url.pathname = `${BASE_PATH}/r/${PUBLIC_INVITE_CODE}`;
    url.searchParams.set('variant', PUBLIC_VARIANT);
    url.searchParams.set('from', PUBLIC_FROM);
    if (route.campaign) url.searchParams.set('campaign', route.campaign);
    return url.toString();
  }
  const url = new URL(window.location.origin);
  url.pathname = `${BASE_PATH}/r/${encodeURIComponent(route.inviteCode)}`;
  url.searchParams.set('variant', route.variant ?? DEFAULT_VARIANT);
  url.searchParams.set('from', route.from ?? 'share');
  if (route.campaign) url.searchParams.set('campaign', route.campaign);
  if (route.inviterName) url.searchParams.set('name', route.inviterName);
  return url.toString();
}

function loadKakaoSdk(): Promise<KakaoStatic> {
  return new Promise((resolve, reject) => {
    if (window.Kakao?.Share) {
      resolve(window.Kakao);
      return;
    }

    let poll: ReturnType<typeof setInterval> | undefined;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${KAKAO_SDK_URL}"]`,
    );
    if (!existingScript) {
      const script = document.createElement('script');
      script.src = KAKAO_SDK_URL;
      script.async = true;
      script.onerror = () => {
        if (poll) clearInterval(poll);
        reject(new Error('Failed to load Kakao SDK script'));
      };
      document.head.appendChild(script);
    }

    const start = Date.now();
    poll = setInterval(() => {
      if (window.Kakao?.Share) {
        clearInterval(poll);
        const kakao = window.Kakao;
        const appKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY || '0ba5c665d80291b4a8d9afa0f6bd7129';
        if (appKey && !kakao.isInitialized()) {
          kakao.init(appKey);
        }
        resolve(kakao);
      } else if (Date.now() - start > KAKAO_SDK_READY_TIMEOUT_MS) {
        clearInterval(poll);
        reject(new Error('Kakao SDK ready timeout'));
      }
    }, KAKAO_SDK_READY_POLL_MS);
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface ReferralInviterProps {
  route: ReferralRouteData;
}

export default function ReferralInviter({ route }: ReferralInviterProps) {
  /* ---- rolling text state (원본 방식: translateY 트랙 스크롤) ---- */
  const [rollingIndex, setRollingIndex] = useState(0);
  const [rollingTransition, setRollingTransition] = useState(true);
  const rollingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- CTA visibility ---- */
  const [ctaVisible, setCtaVisible] = useState(true);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- toast ---- */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- rolling text effect (원본 방식 재현) ---- */
  useEffect(() => {
    const interval = setInterval(() => {
      setRollingTransition(true);
      setRollingIndex((prev) => prev + 1);
    }, HERO_ROLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (rollingResetRef.current) clearTimeout(rollingResetRef.current);
    };
  }, []);

  useEffect(() => {
    if (rollingIndex !== HERO_ROLL_MESSAGES.length) return;

    rollingResetRef.current = setTimeout(() => {
      setRollingTransition(false);
      setRollingIndex(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setRollingTransition(true);
        });
      });
      rollingResetRef.current = null;
    }, HERO_ROLL_TRANSITION_MS);

    return () => {
      if (rollingResetRef.current) {
        clearTimeout(rollingResetRef.current);
        rollingResetRef.current = null;
      }
    };
  }, [rollingIndex]);

  /* ---- scroll-hide CTA ---- */
  useEffect(() => {
    function handleScroll() {
      setCtaVisible(false);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        setCtaVisible(true);
        scrollTimerRef.current = null;
      }, CTA_RESTORE_DELAY_MS);
    }

    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  /* ---- toast helper ---- */
  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* ---- share handler ---- */
  const handlePrimaryShare = useCallback(async () => {
    const landingUrl = buildInviteeLandingUrl(route);
    const shareTitle = buildInviteeTitle(route.inviterName);

    /* 1. Native Web Share (OS 공유) - 우선 */
    if (typeof navigator.share === 'function') {
      try {
        trackInviterShareClick(route, 'web_share');
        await navigator.share({ title: shareTitle, url: landingUrl });
        return;
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        /* fall through to kakao or clipboard */
      }
    }

    /* 2. Kakao Share (native share 미지원 환경 fallback) */
    try {
      const kakao = await loadKakaoSdk();
      const imageUrl = new URL(KAKAO_IMAGE_PATH, window.location.origin).toString();
      trackInviterShareClick(route, 'kakao');
      kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: shareTitle,
          imageUrl,
          link: { mobileWebUrl: landingUrl, webUrl: landingUrl },
        },
        buttons: [
          {
            title: '지원금 받으러 가기',
            link: { mobileWebUrl: landingUrl, webUrl: landingUrl },
          },
        ],
      });
      return;
    } catch {
      /* fall through to clipboard */
    }

    /* 3. Clipboard fallback */
    try {
      await navigator.clipboard.writeText(landingUrl);
      trackInviterCopyFallback(route, 'kakao_failed');
      showToast('친구에게 보낼 링크를 복사했어요');
    } catch {
      trackInviterCopyFallback(route, 'clipboard_failed');
      window.open(landingUrl, '_blank', 'noopener,noreferrer');
    }
  }, [route, showToast]);

  /* ---- analytics + preload Kakao SDK (mount 1회만 실행 — route는 SSR 시점에 확정되어 변하지 않음) ---- */
  useEffect(() => {
    initAnalytics();
    trackInviterView(route);
    loadKakaoSdk().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- error state ---- */
  if (route.mode === 'live' && route.invalidReason) {
    return (
      <ReferralRouteState
        banner="친구초대 링크 정보를 다시 확인해 주세요"
        title="친구초대 정보를 불러오지 못했어요"
        description={
          route.invalidReason === 'missingCode'
            ? '메시지에 포함된 친구초대 코드를 찾지 못했어요.\n보내 받은 링크를 다시 열어 주세요.'
            : '친구초대 코드 형식이 올바르지 않아요.\n발송된 원본 링크를 다시 열어 주세요.'
        }
        primaryLabel="친구초대 화면 보기"
        onPrimary={() => window.location.assign(`${BASE_PATH}/?referral=inviter`)}
        secondaryLabel="커버링 홈으로 가기"
        onSecondary={() => window.location.assign('/')}
      />
    );
  }

  /* ---- main render ---- */
  return (
    <div className="bg-white" data-referral-screen="inviter">
      {/* Toast */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-[20px] z-[60] -translate-x-1/2 rounded-full bg-[#16191D] px-[16px] py-[10px] text-[13px] font-semibold leading-[18px] text-white shadow-[0_12px_24px_rgba(22,25,29,0.18)]">
          {toast}
        </div>
      )}

      <div className="relative mx-auto w-full max-w-[727px] bg-white text-[#434A56]" data-referral-root="true">
        <div
          className="relative w-full bg-white"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 66px)' }}
        >
          {/* Hero section (image + rolling text overlay on empty pill) */}
          <section className="relative w-full">
            <img
              src={`${BASE_PATH}/assets/figma/inviter/hero.png`}
              alt="친구에게 커버링 추천하고 최대 3만원 정리 지원금 보내요"
              className="block h-auto w-full"
            />
            {/* Rolling text inside the empty white pill area — same position as original coded hero */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: '7.778%',
                top: '12.434%',
                width: '46.94%',
                aspectRatio: '169 / 40',
                borderRadius: 'clamp(8px, 2.222vw, 16px)',
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-[inherit] px-[clamp(8px,2.222vw,16px)]">
                <div
                  className="referral-rolling-track"
                  style={{
                    transform: `translateY(-${rollingIndex * 100}%)`,
                    transition: rollingTransition
                      ? `transform ${HERO_ROLL_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`
                      : 'none',
                  }}
                >
                  {[...HERO_ROLL_MESSAGES, HERO_ROLL_MESSAGES[0]].map((message, index) => (
                    <div
                      key={`${message}-${index}`}
                      className="referral-rolling-slide text-center text-[#1AA3FF]"
                      style={{
                        fontSize: 'clamp(18px, 5vw, 36px)',
                        fontWeight: 600,
                        lineHeight: 'clamp(26px, 7.22vw, 52px)',
                      }}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section>
            <img src={`${BASE_PATH}/assets/figma/inviter/benefits-card.png`} alt="가입 여부와 상관없이 초대 받는 모두에게 혜택을 드려요" className="block h-auto w-full" />
          </section>
          <section>
            <img src={`${BASE_PATH}/assets/figma/inviter/steps.png`} alt="공유 방법 1. 집정리 지원금 보내기 버튼 클릭 2. 링크로 가입 또는 앱 접속 3. 할인 쿠폰 발급 완료" className="block h-auto w-full" />
          </section>
          <section>
            <img src={`${BASE_PATH}/assets/figma/inviter/warning.png`} alt="이 페이지에서 공유한 경우에만 쿠폰이 발급돼요" className="block h-auto w-full" />
          </section>
          <section>
            <img src={`${BASE_PATH}/assets/figma/inviter/service.png`} alt="커버링 신규 서비스 — 대형 커버링 봉투, 방문 수거" className="block h-auto w-full" />
          </section>
          <section>
            <img src={`${BASE_PATH}/assets/figma/inviter/notice.png`} alt="친구 초대 이벤트 유의사항" className="block h-auto w-full" />
          </section>
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div className="pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-[727px] -translate-x-1/2">
        <div
          data-referral-bottom-bar="true"
          className="pointer-events-auto w-full bg-white px-[5.56%] py-[2.22%]"
          style={{
            paddingBottom: 'calc(2.22% + env(safe-area-inset-bottom, 0px))',
            transform: ctaVisible ? 'translateY(0px)' : 'translateY(120%)',
            transition: `transform ${CTA_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            willChange: 'transform',
          }}
        >
          <button
            type="button"
            aria-label="집정리 지원금 보내기"
            onClick={() => void handlePrimaryShare()}
            className="block w-full active:opacity-80"
          >
            <img
              src={`${BASE_PATH}/assets/figma/inviter/cta-button.png`}
              alt="집정리 지원금 보내기"
              className="block h-auto w-full"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
