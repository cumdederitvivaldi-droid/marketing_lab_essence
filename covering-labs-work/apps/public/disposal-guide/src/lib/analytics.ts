import mixpanel from 'mixpanel-browser';
import type { AppState, ScreenId } from '../types';
import { BASE_PATH } from '../utils/basePath';
import { normalizeItemSearchKeyword } from './itemSearchKeyword';

export { normalizeItemSearchKeyword } from './itemSearchKeyword';

const PUBLIC_MIXPANEL_TOKEN = 'b39d7d89c68e7ebf1d5ff67d396f4802';
const TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN || PUBLIC_MIXPANEL_TOKEN;
const APP_NAME = 'disposal-guide';
const GUIDE_NAME = 'service_recommendation';
const GUIDE_TITLE = '서비스 추천';
const SESSION_KEY = 'disposal_guide_sid';
const CONTEXT_KEYS = [
  'source',
  'surface',
  'campaign',
  'variant',
  'from',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;
const USER_ID_QUERY_KEYS = ['app_user_id', 'user_id', 'uid', 'appUserId'] as const;
const MIXPANEL_API_ROUTES = {
  track: 'track/',
  engage: 'engage/',
  groups: 'groups/',
  record: 'record/',
  flags: 'flags/',
  settings: 'settings/',
};

type AnalyticsProps = Record<string, unknown>;

type ScreenMeta = {
  screen_name: string;
  screen_title: string;
  funnel_step: string;
  step_index?: number;
};

const SCREEN_META: Record<ScreenId, ScreenMeta> = {
  intro: {
    screen_name: 'GuideServiceRecommendationIntroScreen',
    screen_title: '서비스 추천 시작',
    funnel_step: 'intro',
  },
  step_category: {
    screen_name: 'GuideServiceRecommendationCategoryScreen',
    screen_title: '품목 선택',
    funnel_step: 'category',
    step_index: 1,
  },
  step_food_waste: {
    screen_name: 'GuideServiceRecommendationFoodWasteScreen',
    screen_title: '음식물 포함 여부',
    funnel_step: 'food_waste',
    step_index: 2,
  },
  step_item_description: {
    screen_name: 'GuideServiceRecommendationItemDescriptionScreen',
    screen_title: '물품 설명',
    funnel_step: 'item_description',
  },
  step_length: {
    screen_name: 'GuideServiceRecommendationLengthScreen',
    screen_title: '길이 선택',
    funnel_step: 'length',
  },
  step_weight: {
    screen_name: 'GuideServiceRecommendationWeightScreen',
    screen_title: '예상 무게 선택',
    funnel_step: 'weight',
  },
  step_perceived_weight: {
    screen_name: 'GuideServiceRecommendationPerceivedWeightScreen',
    screen_title: '체감 무게 선택',
    funnel_step: 'perceived_weight',
  },
  step_splittable: {
    screen_name: 'GuideServiceRecommendationSplittableScreen',
    screen_title: '나눠 담기 가능 여부',
    funnel_step: 'splittable',
  },
  result: {
    screen_name: 'GuideServiceRecommendationResultScreen',
    screen_title: '추천 결과',
    funnel_step: 'result',
  },
};

let initialized = false;

function compactProps(props: AnalyticsProps) {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

export function getMixpanelApiHost() {
  return `${BASE_PATH}/api/mixpanel`;
}

function getSessionId() {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;

    const next =
      typeof window.crypto?.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `anon_${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return `anon_${Math.random().toString(36).slice(2)}`;
  }
}

function getFirstQueryValue(params: URLSearchParams, keys: readonly string[]) {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return { key, value };
  }

  return null;
}

function getQueryContext() {
  if (typeof window === 'undefined') return {} as AnalyticsProps;

  const params = new URLSearchParams(window.location.search);
  const context: Record<string, unknown> = {
    app_name: APP_NAME,
    environment: process.env.NODE_ENV ?? 'development',
    guide_name: GUIDE_NAME,
    guide_title: GUIDE_TITLE,
    session_id: getSessionId(),
    view_path: window.location.pathname,
  };

  CONTEXT_KEYS.forEach((key) => {
    const value = params.get(key)?.trim();
    if (value) context[key] = value;
  });

  const userIdentity = getFirstQueryValue(params, USER_ID_QUERY_KEYS);
  if (userIdentity) {
    context.app_user_id = userIdentity.value;
    context.user_id = userIdentity.value;
    context.$user_id = userIdentity.value;
    context.user_id_source = userIdentity.key;
  }

  return context;
}

function getDistinctId(props: AnalyticsProps) {
  const subjectId = props.app_user_id ?? props.user_id ?? props.$user_id;
  const normalized = String(subjectId || '').trim();
  return normalized || null;
}

export function getScreenMeta(screen: ScreenId): ScreenMeta {
  return SCREEN_META[screen];
}

export function routeEventName(screen: ScreenId) {
  return `[ROUTE] ${SCREEN_META[screen].screen_name}`;
}

export function clickEventName(screen: ScreenId, action: string) {
  return `[CLICK] ${SCREEN_META[screen].screen_name}_${action}`;
}

export function viewEventName(screen: ScreenId, content: string) {
  return `[VIEW] ${SCREEN_META[screen].screen_name}_${content}`;
}

export function buildGuideStateProps(state: AppState): AnalyticsProps {
  return compactProps({
    categories: state.categories,
    category_count: state.categories.length,
    has_food_waste: state.hasFoodWaste,
    has_item_description: Boolean(state.itemDescription.trim()),
    item_description_length: state.itemDescription.trim().length || undefined,
    item_search_keyword: normalizeItemSearchKeyword(state.itemDescription),
    length_cm: state.lengthCm,
    length_range: state.lengthRange,
    weight_range: state.weightRange,
    perceived_weight: state.perceivedWeight,
    splittable_status: state.splittableStatus,
    recommendation: state.resultId,
  });
}

export function initAnalytics() {
  if (!TOKEN || initialized || typeof window === 'undefined') return;

  mixpanel.init(TOKEN, {
    api_host: getMixpanelApiHost(),
    api_routes: MIXPANEL_API_ROUTES,
    track_pageview: false,
    property_blacklist: ['$current_url'],
  });
  initialized = true;

  const context = getQueryContext();
  const distinctId = getDistinctId(context);

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
    url: `${window.location.origin}${window.location.pathname}`,
  });

  if (!initialized) {
    initAnalytics();
  }

  if (initialized) {
    mixpanel.track(event, eventProps);
  }
}
