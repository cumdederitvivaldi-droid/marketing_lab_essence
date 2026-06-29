"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReferralRouteData } from '@/utils/types';
import { BASE_PATH } from '@/utils/basePath';
import ReferralRouteState from '@/components/ReferralRouteState';
import { initAnalytics, trackInviteeView, trackInviteeSignupClick, trackInviteeLinkResolved, trackInviteeSupportClick } from '@/utils/analytics';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const SUPPORT_URL = 'https://covering-app.channel.io/home';
const IOS_DOWNLOAD_URL = 'https://apps.apple.com/kr/app/id1598592066';
const CTA_RESTORE_DELAY_MS = 200;
const CTA_TRANSITION_MS = 600;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface ReferralInviteeProps {
  route: ReferralRouteData;
}

export default function ReferralInvitee({ route }: ReferralInviteeProps) {
  const [signupPending, setSignupPending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ctaHidden, setCtaHidden] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- scroll-hide floating CTA (스펙 5-1~5-5) ---- */
  useEffect(() => {
    function handleScroll() {
      setCtaHidden(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        setCtaHidden(false);
        scrollTimerRef.current = null;
      }, CTA_RESTORE_DELAY_MS);
    }

    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  /* ---- analytics (mount 1회만 실행 — route는 SSR 시점에 확정되어 변하지 않음) ---- */
  useEffect(() => {
    initAnalytics();
    trackInviteeView(route);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- lock body scroll when help modal is open ---- */
  useEffect(() => {
    if (!helpOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [helpOpen]);

  /* ---- signup handler ---- */
  const handleSignup = useCallback(async () => {
    if (signupPending || !route.inviteCode) return;
    setSignupPending(true);
    trackInviteeSignupClick(route);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const requestUrl = new URL(`${BASE_PATH}/api/referral-link`, window.location.origin);
      requestUrl.searchParams.set('code', route.inviteCode);
      if (route.inviterName) requestUrl.searchParams.set('name', route.inviterName);
      if (route.variant) requestUrl.searchParams.set('variant', route.variant);
      if (route.from) requestUrl.searchParams.set('from', route.from);
      if (route.campaign) requestUrl.searchParams.set('campaign', route.campaign);

      const response = await fetch(requestUrl.toString(), { method: 'GET', signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      const linkMode = body.mode === 'airbridge' ? 'airbridge' as const : 'fallback' as const;

      if (
        !response.ok ||
        typeof body.link !== 'string' ||
        body.link.length === 0
      ) {
        trackInviteeLinkResolved(route, 'fallback', false);
        throw new Error('tracking link unavailable');
      }

      trackInviteeLinkResolved(route, linkMode, response.ok);
      window.location.assign(body.link);
    } catch (error) {
      console.error('invitee signup link failed:', error);
      window.location.assign(IOS_DOWNLOAD_URL);
      setSignupPending(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [signupPending, route]);

  /* ---- error state ---- */
  if (route.mode === 'live' && route.invalidReason) {
    return (
      <ReferralRouteState
        banner="친구초대 링크가 만료되었거나 잘못되었어요"
        title="혜택 링크를 다시 확인해 주세요"
        description={
          route.invalidReason === 'missingCode'
            ? '친구초대 코드가 없는 링크예요.\n친구가 보낸 메시지의 원본 링크를 다시 열어 주세요.'
            : '친구초대 코드 형식이 올바르지 않아요.\n만료되었거나 잘못된 링크일 수 있어요.'
        }
        primaryLabel="친구초대 소개 보기"
        onPrimary={() => window.location.assign(`${BASE_PATH}/?referral=invitee`)}
        secondaryLabel="커버링 홈으로 가기"
        onSecondary={() => window.location.assign('/')}
      />
    );
  }

  /* ---- main render ---- */
  return (
    <div className="bg-white">
      <div className="relative mx-auto w-full max-w-[727px] bg-white text-[#434A56]" data-referral-root="true">
        {/* Sticky banner (image) */}
        <div className="sticky top-0 z-30 shadow-[0_8px_20px_rgba(0,138,229,0.18)]">
          <img
            src={`${BASE_PATH}/assets/figma/invitee/sticky-banner.png`}
            alt="쿠폰은 해당 페이지를 통해 앱을 들어와야 받을 수 있어요"
            className="block h-auto w-full"
          />
        </div>

        <div
          className="relative w-full"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 120px)' }}
        >
          <img src={`${BASE_PATH}/assets/figma/invitee/section-hero.png`} alt="집정리 지원금이 도착했어요 — 신규 가입 30,000원, 기존 가입 3,000원" className="block h-auto w-full" />
          <img src={`${BASE_PATH}/assets/figma/invitee/section-about.png`} alt="커버링이란? 쓰레기 수거 대행 서비스 — 봉투 수거, 방문 수거" className="block h-auto w-full" />
          <img src={`${BASE_PATH}/assets/figma/invitee/section-benefits.png`} alt="지금 가입하면 쏟아지는 혜택 — 집정리 할인 쿠폰 + 방문 요금 할인 쿠폰 + 일반 봉투 지급" className="block h-auto w-full" />
          <img src={`${BASE_PATH}/assets/figma/invitee/section-howto.png`} alt="쿠폰 적용 방법 4단계 — 정리 지원금 받기 클릭, 수거 신청, 카드 등록, 쿠폰 적용" className="block h-auto w-full" />
          <img src={`${BASE_PATH}/assets/figma/invitee/section-service.png`} alt="커버링에 이런 서비스도 있어요 — 대형 커버링 봉투, 방문 수거" className="block h-auto w-full" />
          <img src={`${BASE_PATH}/assets/figma/invitee/section-notice.png`} alt="유의사항" className="block h-auto w-full" />
        </div>
      </div>

      {/* Floating bottom CTA - scroll-hide */}
      <div className="pointer-events-none fixed bottom-0 left-1/2 z-40 w-full max-w-[727px] -translate-x-1/2">
        <div
          data-referral-bottom-bar="true"
          className="pointer-events-auto relative w-full bg-white px-[5.56%] py-[2.22%]"
          style={{
            paddingBottom: 'calc(2.22% + env(safe-area-inset-bottom, 0px))',
            transform: (ctaHidden || helpOpen) ? 'translateY(120%)' : 'translateY(0px)',
            transition: `transform ${CTA_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            willChange: 'transform',
          }}
        >
          <button
            type="button"
            aria-label="가입하고 정리 지원금 받기"
            onClick={handleSignup}
            disabled={signupPending}
            className="block w-full active:opacity-80"
          >
            <img
              src={`${BASE_PATH}/assets/figma/invitee/cta-filled.png`}
              alt="가입하고 정리 지원금 받기"
              className="block h-auto w-full"
            />
          </button>
          <button
            type="button"
            aria-label="지원금을 받지 못했어요"
            onClick={() => { trackInviteeSupportClick(route); setHelpOpen(true); }}
            className="mt-[2.22%] block w-full active:opacity-60"
          >
            <img
              src={`${BASE_PATH}/assets/figma/invitee/cta-ghost.png`}
              alt="지원금을 받지 못했어요"
              className="block h-auto w-full"
            />
          </button>
        </div>
      </div>

      {/* Help modal (스펙 6: dim white 50%) */}
      {helpOpen && (
        <>
          {/* Backdrop - white 50% dim */}
          <div
            className="fixed inset-0 z-50"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
              animation: 'dim-fadein 0.2s ease forwards',
            }}
            onClick={() => setHelpOpen(false)}
          />
          {/* Sheet */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto w-full max-w-[727px] overflow-hidden rounded-t-[24px] bg-white shadow-[0_0_16px_rgba(22,25,29,0.08)]"
            style={{ animation: 'bottomsheet-up 0.25s ease-out forwards' }}
          >
            <div className="flex justify-center px-[24px] py-[16px]">
              <div className="h-[4px] w-[80px] rounded-[3px] bg-[#C0C7D8]" />
            </div>

            <div className="px-[20px] pb-[16px]">
              <h3 id="help-modal-title" className="m-0 text-[18px] font-semibold leading-[26px] tracking-[-0.2px] text-[#16191D]">
                쿠폰 발급까지 최대 24시간이 걸려요
              </h3>
              <p className="m-0 mt-[12px] text-[16px] leading-[24px] text-[#434A56]">
                가입했는 지 내부적으로 검토하는데 24시간 정도가 걸려요. 24시간이 지났는데도 쿠폰이 발급이 되지 않으면,
                아래 1:1 문의하기로 알려주세요.
              </p>

              <button
                type="button"
                onClick={() => window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer')}
                className="mt-[16px] p-0 text-[16px] font-semibold leading-[24px] text-[#1AA3FF] underline"
              >
                1:1 문의하기
              </button>
            </div>

            <div className="px-[20px] py-[8px] pb-[calc(8px+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="min-h-[50px] w-full rounded-[8px] bg-[#1AA3FF] px-[20px] text-[18px] font-semibold leading-[26px] text-white active:bg-[#1490E6]"
              >
                확인했어요
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
