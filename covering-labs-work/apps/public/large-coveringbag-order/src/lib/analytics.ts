import mixpanel from 'mixpanel-browser';
import { apiUrl } from './path';

const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const APP_NAME = 'large-coveringbag-order';
const PRODUCT_CODE = 'LARGE_COVERING_BAG';
const PRODUCT_NAME = 'large_coveringbag';
const CONTEXT_KEYS = ['source', 'surface', 'banner_id', 'campaign', 'bridge_flow_id', 'variant', 'from'] as const;
const USER_ID_QUERY_KEYS = ['app_user_id', 'user_id', 'uid', 'appUserId'] as const;
const FLARELANE_CLIENT_EVENT_NAMES = new Set([
  '[ROUTE] ProductPurchaseScreen',
  '[ROUTE] ProductPurchaseCompleteScreen',
]);

let initialized = false;

type AnalyticsProps = Record<string, unknown>;

function buildViewPath(source?: string, surface?: string) {
  if (source && surface) return `${source}:${surface}`;
  if (source) return source;
  if (typeof window === 'undefined') return 'large_coveringbag_order_web';

  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  return pathname === '/' ? 'large_coveringbag_order_web' : `large_coveringbag_order:${pathname}`;
}

function getFirstQueryValue(params: URLSearchParams, keys: readonly string[]) {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return { key, value };
  }

  return null;
}

function getQueryContext() {
  if (typeof window === 'undefined') return {} as Record<string, string>;

  const params = new URLSearchParams(window.location.search);
  const context: Record<string, string> = {
    app_name: APP_NAME,
    environment: process.env.NODE_ENV ?? 'development',
    product_code: PRODUCT_CODE,
    product_name: PRODUCT_NAME,
  };

  CONTEXT_KEYS.forEach((key) => {
    const value = params.get(key)?.trim();
    if (value) {
      context[key] = value;
    }
  });

  const userIdentity = getFirstQueryValue(params, USER_ID_QUERY_KEYS);
  if (userIdentity) {
    context.app_user_id = userIdentity.value;
    context.user_id = userIdentity.value;
    context.$user_id = userIdentity.value;
    context.user_id_source = userIdentity.key;
  }

  context.view_path = buildViewPath(context.source, context.surface);

  return context;
}

function compactProps(props: AnalyticsProps) {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

function getSubjectId(props: AnalyticsProps) {
  const subjectId = props.app_user_id ?? props.user_id ?? props.$user_id;
  const normalized = String(subjectId || '').trim();

  return normalized || null;
}

function trackFlareLane(event: string, props: AnalyticsProps) {
  if (!FLARELANE_CLIENT_EVENT_NAMES.has(event)) return;
  if (props.product_code !== PRODUCT_CODE) return;
  if (!getSubjectId(props)) return;

  window.fetch(apiUrl('/api/flarelane-track'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, props }),
    keepalive: true,
  }).catch(() => undefined);
}

export function getTrackingContext() {
  return getQueryContext();
}

export function initAnalytics() {
  if (!TOKEN || initialized || typeof window === 'undefined') return;

  mixpanel.init(TOKEN, { track_pageview: false });
  initialized = true;

  const context = getQueryContext();
  const distinctId = context.app_user_id;

  if (distinctId) {
    mixpanel.identify(distinctId);
  }

  mixpanel.register(context);
}

export function track(event: string, props?: AnalyticsProps) {
  if (typeof window === 'undefined') return;
  const context = getQueryContext();
  const eventProps = compactProps({
    ...context,
    ...props,
    timestamp: Date.now(),
    url: window.location.href,
  });

  trackFlareLane(event, eventProps);

  if (!initialized) {
    initAnalytics();
  }

  if (initialized) {
    mixpanel.track(event, eventProps);
  }
}
