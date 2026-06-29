import mixpanel from 'mixpanel-browser';
import type { ReferralRouteData } from './types';

let initialized = false;
const PUBLIC_INVITE_CODE = 'public';
const PUBLIC_VARIANT = 'friend_invite_v1_public';

export function initAnalytics() {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token || initialized) return;
  mixpanel.init(token, { track_pageview: false, persistence: 'localStorage' });
  initialized = true;
}

/** route.mode === 'live'일 때만 이벤트 발사 */
function shouldTrack(route: ReferralRouteData): boolean {
  return route.mode === 'live' && initialized;
}

/** 모든 이벤트에 붙는 공통 props */
function commonProps(route: ReferralRouteData) {
  const inviteMode =
    route.variant === PUBLIC_VARIANT ||
    route.inviteCode?.toLowerCase() === PUBLIC_INVITE_CODE
      ? 'public'
      : 'personal';

  return {
    invite_code: route.inviteCode ?? undefined,
    variant: route.variant ?? undefined,
    from: route.from ?? undefined,
    invite_mode: inviteMode,
    has_inviter_name: !!route.inviterName,
    environment: process.env.NODE_ENV,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: Date.now(),
  };
}

/* ------------------------------------------------------------------ */
/*  초대자 이벤트                                                      */
/* ------------------------------------------------------------------ */

export function trackInviterView(route: ReferralRouteData) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[ROUTE] ReferralInviterScreen', {
    ...commonProps(route),
    invalid_reason: route.invalidReason ?? undefined,
  });
}

export function trackInviterShareClick(
  route: ReferralRouteData,
  shareTarget: 'kakao' | 'web_share' | 'clipboard',
) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[CLICK] ReferralInviterScreen_shareButton', {
    ...commonProps(route),
    share_target: shareTarget,
  });
}

export function trackInviterCopyFallback(
  route: ReferralRouteData,
  fallbackReason: string,
) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[CLICK] ReferralInviterScreen_copyFallback', {
    ...commonProps(route),
    fallback_reason: fallbackReason,
  });
}

/* ------------------------------------------------------------------ */
/*  피초대자 이벤트                                                     */
/* ------------------------------------------------------------------ */

export function trackInviteeView(route: ReferralRouteData) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[ROUTE] ReferralInviteeScreen', {
    ...commonProps(route),
    invalid_reason: route.invalidReason ?? undefined,
  });
}

export function trackInviteeSignupClick(route: ReferralRouteData) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[CLICK] ReferralInviteeScreen_signupButton', {
    ...commonProps(route),
  });
}

export function trackInviteeLinkResolved(
  route: ReferralRouteData,
  linkMode: 'airbridge' | 'fallback',
  httpOk: boolean,
) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[EVENT] ReferralLinkResolved', {
    ...commonProps(route),
    link_mode: linkMode,
    http_ok: httpOk,
  });
}

export function trackInviteeSupportClick(route: ReferralRouteData) {
  if (!shouldTrack(route)) return;
  mixpanel.track('[CLICK] ReferralInviteeScreen_supportButton', {
    ...commonProps(route),
  });
}
