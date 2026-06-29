import mixpanel from 'mixpanel-browser';

let initialized = false;

export interface RouteContext {
  variant: string | null;
  from: string | null;
  campaign: string | null;
}

export function initAnalytics() {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  if (!token || initialized) return;
  mixpanel.init(token, { track_pageview: false, persistence: 'localStorage' });
  initialized = true;
}

function track(event: string, ctx: RouteContext, extra?: Record<string, unknown>) {
  if (!initialized) return;
  mixpanel.track(event, {
    variant: ctx.variant ?? undefined,
    from: ctx.from ?? undefined,
    campaign: ctx.campaign ?? undefined,
    environment: process.env.NODE_ENV,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    timestamp: Date.now(),
    ...extra,
  });
}

export function trackLandingView(ctx: RouteContext) {
  track('[ROUTE] FirstFreeLandingScreen', ctx);
}

export function trackPrimaryCtaClick(ctx: RouteContext, linkMode: 'onelink' | 'fallback') {
  track('[CLICK] FirstFreeLandingScreen_primaryCta', ctx, { link_mode: linkMode });
}

export function trackNormalBagNoticeClick(ctx: RouteContext) {
  track('[CLICK] FirstFreeLandingScreen_normalBagNoticeButton', ctx);
}

export function trackLargeBagNoticeClick(ctx: RouteContext) {
  track('[CLICK] FirstFreeLandingScreen_largeBagNoticeButton', ctx);
}
