import type {
  AppState,
  Category,
  LengthRange,
  PerceivedWeight,
  Recommendation,
  SplittableStatus,
  WeightRange,
} from '../types';

export type FeedbackSentiment = 'positive' | 'negative';

export interface FeedbackStateSnapshot {
  categories: Category[];
  hasFoodWaste: boolean;
  hasItemDescription: boolean;
  itemDescriptionLength?: number;
  lengthCm?: number;
  lengthRange: LengthRange;
  weightRange: WeightRange;
  perceivedWeight?: PerceivedWeight;
  splittableStatus?: SplittableStatus;
  recommendation: Recommendation;
}

export interface FeedbackContext {
  appName: 'disposal-guide';
  guideName: 'service_recommendation';
  guideTitle: '서비스 추천';
  environment?: string;
  sessionId?: string;
  viewPath?: string;
  url?: string;
  source?: string;
  surface?: string;
  campaign?: string;
  variant?: string;
  from?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  appUserId?: string;
  userIdSource?: string;
}

export interface FeedbackSubmissionPayload {
  sentiment: FeedbackSentiment;
  recommendation: Recommendation;
  message?: string;
  state: FeedbackStateSnapshot;
  context: FeedbackContext;
}

const SESSION_KEY = 'disposal_guide_sid';

const CONTEXT_KEYS = [
  ['source', 'source'],
  ['surface', 'surface'],
  ['campaign', 'campaign'],
  ['variant', 'variant'],
  ['from', 'from'],
  ['utm_source', 'utmSource'],
  ['utm_medium', 'utmMedium'],
  ['utm_campaign', 'utmCampaign'],
  ['utm_content', 'utmContent'],
  ['utm_term', 'utmTerm'],
] as const;

const USER_ID_QUERY_KEYS = ['app_user_id', 'user_id', 'uid', 'appUserId'] as const;

/**
 * Returns a stable anonymous browser session id for grouping feedback attempts.
 */
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

/**
 * Finds the first non-empty query parameter among equivalent identity keys.
 */
function getFirstQueryValue(params: URLSearchParams, keys: readonly string[]) {
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return { key, value };
  }

  return null;
}

/**
 * Removes empty values so the feedback payload stores only observed context.
 */
function compact<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  ) as Partial<T>;
}

/**
 * Builds browser context for feedback attribution without persisting raw user input.
 */
export function buildFeedbackContext(): FeedbackContext {
  const base: FeedbackContext = {
    appName: 'disposal-guide',
    guideName: 'service_recommendation',
    guideTitle: '서비스 추천',
    environment: process.env.NODE_ENV ?? 'development',
  };

  if (typeof window === 'undefined') return base;

  const params = new URLSearchParams(window.location.search);
  const context: Record<string, unknown> = {
    ...base,
    sessionId: getSessionId(),
    viewPath: window.location.pathname,
    url: `${window.location.origin}${window.location.pathname}`,
  };

  CONTEXT_KEYS.forEach(([queryKey, contextKey]) => {
    const value = params.get(queryKey)?.trim();
    if (value) context[contextKey] = value;
  });

  const userIdentity = getFirstQueryValue(params, USER_ID_QUERY_KEYS);
  if (userIdentity) {
    context.appUserId = userIdentity.value;
    context.userIdSource = userIdentity.key;
  }

  return {
    ...base,
    ...(compact(context) as Partial<FeedbackContext>),
  };
}

/**
 * Converts the current guide state into the bounded snapshot saved with feedback.
 */
export function buildFeedbackStateSnapshot(
  state: AppState,
  recommendation: Recommendation,
): FeedbackStateSnapshot {
  return compact({
    categories: state.categories,
    hasFoodWaste: state.hasFoodWaste,
    hasItemDescription: Boolean(state.itemDescription.trim()),
    itemDescriptionLength: state.itemDescription.trim().length || undefined,
    lengthCm: state.lengthCm,
    lengthRange: state.lengthRange,
    weightRange: state.weightRange,
    perceivedWeight: state.perceivedWeight,
    splittableStatus: state.splittableStatus,
    recommendation,
  }) as FeedbackStateSnapshot;
}

/**
 * Creates the API payload submitted when a user rates a recommendation.
 */
export function buildFeedbackSubmissionPayload(
  sentiment: FeedbackSentiment,
  recommendation: Recommendation,
  state: AppState,
  message?: string,
): FeedbackSubmissionPayload {
  return {
    sentiment,
    recommendation,
    ...(message ? { message } : {}),
    state: buildFeedbackStateSnapshot(state, recommendation),
    context: buildFeedbackContext(),
  };
}
