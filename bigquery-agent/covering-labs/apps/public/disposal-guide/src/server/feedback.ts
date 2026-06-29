import type {
  Category,
  LengthRange,
  PerceivedWeight,
  Recommendation,
  SplittableStatus,
  WeightRange,
} from '../types';
import type {
  FeedbackContext,
  FeedbackSentiment,
  FeedbackStateSnapshot,
  FeedbackSubmissionPayload,
} from '../lib/feedback';

const DEFAULT_TABLE = 'disposal_guide_feedback';
const DEFAULT_SLACK_CHANNEL = 'C0B2TRG6DCK';
const REQUEST_TIMEOUT_MS = 5000;

const CATEGORIES: Category[] = [
  'GENERAL_FOOD_RECYCLE',
  'APPLIANCE_FURNITURE',
  'BEDDING_CLOTHES_MISC',
  'ETC',
];
const LENGTH_RANGES: LengthRange[] = [
  'UNDER_80',
  'AROUND_80',
  'OVER_80_UNDER_140',
  'OVER_140_UNDER_150',
  'OVER_150',
];
const WEIGHT_RANGES: WeightRange[] = ['UNDER_15', 'OVER_15_UNDER_25', 'OVER_25', 'UNKNOWN'];
const PERCEIVED_WEIGHTS: PerceivedWeight[] = ['EASY_TO_LIFT', 'HARD_TO_HOLD_LONG', 'HARD_TO_LIFT'];
const SPLITTABLE_STATUSES: SplittableStatus[] = ['CAN_SPLIT', 'CANNOT_SPLIT', 'UNKNOWN'];
const RECOMMENDATIONS: Recommendation[] = [
  'VISIT_PICKUP',
  'LARGE_COVERING_BAG',
  'GENERAL_BAG_MULTIPLE',
  'GENERAL_BAG_SINGLE',
];

const CATEGORY_LABELS: Record<Category, string> = {
  GENERAL_FOOD_RECYCLE: '재활용 · 음식물 · 일반 쓰레기',
  APPLIANCE_FURNITURE: '가전 · 가구',
  BEDDING_CLOTHES_MISC: '이불 · 의류 · 잡화',
  ETC: '기타',
};

const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  VISIT_PICKUP: '커버링 방문 수거',
  LARGE_COVERING_BAG: '대형 커버링 봉투',
  GENERAL_BAG_MULTIPLE: '일반 커버링 봉투 여러 장',
  GENERAL_BAG_SINGLE: '일반 커버링 봉투',
};

const WEIGHT_LABELS: Record<WeightRange, string> = {
  UNDER_15: '15kg 이하',
  OVER_15_UNDER_25: '15kg 초과 ~ 25kg 미만',
  OVER_25: '25kg 이상',
  UNKNOWN: '잘 모르겠어요',
};

const PERCEIVED_WEIGHT_LABELS: Record<PerceivedWeight, string> = {
  EASY_TO_LIFT: '어렵지 않게 들 수 있음',
  HARD_TO_HOLD_LONG: '들 수는 있지만 오래 들기 어려움',
  HARD_TO_LIFT: '혼자 들기 어려움',
};

const SPLITTABLE_LABELS: Record<SplittableStatus, string> = {
  CAN_SPLIT: '여러 봉투에 나눠 담을 수 있음',
  CANNOT_SPLIT: '하나로만 버려야 함',
  UNKNOWN: '잘 모르겠어요',
};

type FeedbackMeta = {
  userAgent?: string;
  referer?: string;
};

type SlackStatus = {
  ok: boolean;
  status: 'sent' | 'skipped_missing_config' | 'failed';
  ts?: string;
  error?: string;
};

type SupabaseConfig = {
  url: string;
  key: string;
  table: string;
};

type SupabaseFeedbackRow = {
  id?: string;
};

export class FeedbackSubmissionError extends Error {
  status: number;
  code: string;

  /**
   * Carries a client-safe error code and HTTP status for feedback API failures.
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    Object.setPrototypeOf(this, FeedbackSubmissionError.prototype);
    this.status = status;
    this.code = code;
  }
}

/**
 * Checks that an unknown value is a plain object suitable for payload validation.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Narrows an unknown string to one of the allowed domain enum values.
 */
function includesValue<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

/**
 * Trims and bounds optional text fields before they reach Supabase or Slack.
 */
function cleanString(value: unknown, maxLength = 300) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * Accepts only bounded http(s) URLs for request context fields.
 */
function cleanUrlString(value: unknown, maxLength = 1000) {
  const cleaned = cleanString(value, maxLength);
  if (!cleaned || !/^https?:\/\/\S+$/i.test(cleaned)) return undefined;
  return cleaned;
}

/**
 * Coerces non-boolean payload values to false for conservative storage.
 */
function cleanBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

/**
 * Rounds and clamps numeric payload fields to the supported guide range.
 */
function cleanNumber(value: unknown, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Keeps only recognized disposal categories from an untrusted payload.
 */
function cleanCategories(value: unknown): Category[] {
  if (!Array.isArray(value)) return [];
  return value.filter((category): category is Category => includesValue(CATEGORIES, category));
}

/**
 * Normalizes browser attribution fields while forcing the expected guide identity.
 */
function cleanContext(value: unknown): FeedbackContext {
  const record = isRecord(value) ? value : {};

  return {
    appName: 'disposal-guide',
    guideName: 'service_recommendation',
    guideTitle: '서비스 추천',
    environment: cleanString(record.environment, 40),
    sessionId: cleanString(record.sessionId, 120),
    viewPath: cleanString(record.viewPath, 300),
    url: cleanUrlString(record.url, 1000),
    source: cleanString(record.source, 120),
    surface: cleanString(record.surface, 120),
    campaign: cleanString(record.campaign, 120),
    variant: cleanString(record.variant, 120),
    from: cleanString(record.from, 120),
    utmSource: cleanString(record.utmSource, 120),
    utmMedium: cleanString(record.utmMedium, 120),
    utmCampaign: cleanString(record.utmCampaign, 120),
    utmContent: cleanString(record.utmContent, 120),
    utmTerm: cleanString(record.utmTerm, 120),
    appUserId: cleanString(record.appUserId, 160),
    userIdSource: cleanString(record.userIdSource, 80),
  };
}

/**
 * Normalizes guide answers into the same constrained shape enforced by the DB.
 */
function cleanState(value: unknown, recommendation: Recommendation): FeedbackStateSnapshot {
  const record = isRecord(value) ? value : {};
  const lengthRange = includesValue(LENGTH_RANGES, record.lengthRange)
    ? record.lengthRange
    : 'UNDER_80';
  const weightRange = includesValue(WEIGHT_RANGES, record.weightRange)
    ? record.weightRange
    : 'UNKNOWN';

  return {
    categories: cleanCategories(record.categories),
    hasFoodWaste: cleanBoolean(record.hasFoodWaste),
    hasItemDescription: cleanBoolean(record.hasItemDescription),
    itemDescriptionLength: cleanNumber(record.itemDescriptionLength, 0, 200),
    lengthCm: cleanNumber(record.lengthCm, 10, 160),
    lengthRange,
    weightRange,
    perceivedWeight: includesValue(PERCEIVED_WEIGHTS, record.perceivedWeight)
      ? record.perceivedWeight
      : undefined,
    splittableStatus: includesValue(SPLITTABLE_STATUSES, record.splittableStatus)
      ? record.splittableStatus
      : undefined,
    recommendation,
  };
}

/**
 * Validates the public API payload and strips any fields outside the feedback schema.
 */
export function normalizeFeedbackPayload(input: unknown): FeedbackSubmissionPayload {
  if (!isRecord(input)) {
    throw new FeedbackSubmissionError(400, 'invalid_payload', '피드백 요청 형식이 올바르지 않습니다.');
  }

  if (!includesValue(['positive', 'negative'] as const, input.sentiment)) {
    throw new FeedbackSubmissionError(400, 'invalid_sentiment', '피드백 선택값이 올바르지 않습니다.');
  }

  if (!includesValue(RECOMMENDATIONS, input.recommendation)) {
    throw new FeedbackSubmissionError(400, 'invalid_recommendation', '추천 결과값이 올바르지 않습니다.');
  }

  return {
    sentiment: input.sentiment,
    recommendation: input.recommendation,
    message: cleanString(input.message, 500),
    state: cleanState(input.state, input.recommendation),
    context: cleanContext(input.context),
  };
}

/**
 * Reads Supabase REST settings required for storing feedback rows.
 */
function getSupabaseConfig(): SupabaseConfig {
  const url = cleanString(
    process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.COVERING_SUPABASE_URL,
    1000,
  );
  const key = cleanString(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.COVERING_SUPABASE_KEY,
    4000,
  );
  const table = cleanString(process.env.DISPOSAL_GUIDE_FEEDBACK_TABLE, 80) || DEFAULT_TABLE;

  if (!url || !key) {
    throw new FeedbackSubmissionError(
      503,
      'supabase_not_configured',
      'Supabase 저장 설정이 없습니다.',
    );
  }

  return { url: url.replace(/\/$/, ''), key, table };
}

/**
 * Reads Slack settings, returning null when feedback should be stored without notification.
 */
function getSlackConfig() {
  const token = cleanString(process.env.SLACK_BOT_TOKEN, 4000);
  const channel =
    cleanString(process.env.DISPOSAL_GUIDE_FEEDBACK_SLACK_CHANNEL, 200) || DEFAULT_SLACK_CHANNEL;

  if (!token || !channel) return null;
  return { token, channel };
}

/**
 * Runs outbound REST calls with a short timeout so submissions do not hang.
 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Builds Supabase REST headers for insert and status patch requests.
 */
function supabaseHeaders(config: SupabaseConfig, prefer = 'return=representation') {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

/**
 * Maps the validated payload and request metadata to the feedback table schema.
 */
function buildInsertRow(payload: FeedbackSubmissionPayload, meta: FeedbackMeta) {
  return {
    sentiment: payload.sentiment,
    recommendation: payload.recommendation,
    message: payload.message ?? null,
    app_state: payload.state,
    context: payload.context,
    source: payload.context.source,
    url: payload.context.url,
    user_agent: cleanString(meta.userAgent, 1000),
    referer: cleanUrlString(meta.referer, 1000),
    slack_status: 'pending',
  };
}

/**
 * Inserts the feedback row before attempting Slack delivery.
 */
async function insertFeedback(
  config: SupabaseConfig,
  payload: FeedbackSubmissionPayload,
  meta: FeedbackMeta,
): Promise<SupabaseFeedbackRow> {
  const response = await fetchWithTimeout(`${config.url}/rest/v1/${config.table}`, {
    method: 'POST',
    headers: supabaseHeaders(config),
    body: JSON.stringify(buildInsertRow(payload, meta)),
  });

  if (!response.ok) {
    throw new FeedbackSubmissionError(
      502,
      'supabase_insert_failed',
      `Supabase 저장 실패: ${response.status}`,
    );
  }

  const rows = (await response.json().catch(() => [])) as SupabaseFeedbackRow[];
  return Array.isArray(rows) && rows[0] ? rows[0] : {};
}

/**
 * Records Slack delivery outcome on the existing feedback row.
 */
async function updateSlackStatus(
  config: SupabaseConfig,
  id: string | undefined,
  slack: SlackStatus,
) {
  if (!id) return;

  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/${config.table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(config, 'return=minimal'),
      body: JSON.stringify({
        slack_status: slack.status,
        slack_ts: slack.ts,
        slack_error: slack.error,
      }),
    },
  );

  if (!response.ok) {
    console.error(`disposal-guide feedback slack status update failed: ${response.status}`);
  }
}

/**
 * Converts the stored sentiment code into the Slack-facing Korean label.
 */
function sentimentLabel(sentiment: FeedbackSentiment) {
  return sentiment === 'positive' ? '만족해요' : '별로에요';
}

/**
 * Formats selected categories for the Slack summary without exposing raw item names.
 */
function formatCategories(categories: Category[]) {
  if (!categories.length) return '없음';
  return categories.map((category) => CATEGORY_LABELS[category]).join(', ');
}

/**
 * Drops absent Slack message lines while preserving the intended order.
 */
function compactLines(lines: Array<string | undefined>) {
  return lines.filter((line): line is string => Boolean(line));
}

/**
 * Converts thrown Slack transport errors into a bounded machine-readable token.
 */
function errorToken(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    cleanString(message, 120)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown'
  );
}

/**
 * Builds the Slack notification text from sanitized feedback data only.
 */
export function buildSlackText(payload: FeedbackSubmissionPayload, feedbackId?: string) {
  const state = payload.state;
  const context = payload.context;

  return compactLines([
    `링퀴즈 피드백: ${sentimentLabel(payload.sentiment)}`,
    `추천 결과: ${RECOMMENDATION_LABELS[payload.recommendation]}`,
    `선택 품목: ${formatCategories(state.categories)}`,
    state.lengthCm ? `길이: ${state.lengthCm}cm (${state.lengthRange})` : undefined,
    `무게: ${WEIGHT_LABELS[state.weightRange]}`,
    state.perceivedWeight ? `체감 무게: ${PERCEIVED_WEIGHT_LABELS[state.perceivedWeight]}` : undefined,
    state.splittableStatus ? `나눠 담기: ${SPLITTABLE_LABELS[state.splittableStatus]}` : undefined,
    state.hasFoodWaste ? '음식물: 포함' : undefined,
    state.hasItemDescription
      ? `품목명 입력: 있음 (${state.itemDescriptionLength ?? 0}자, 원문 미저장)`
      : '품목명 입력: 없음',
    payload.message ? `추가 의견: ${payload.message}` : undefined,
    context.source || context.campaign || context.utmSource
      ? `유입: ${compactLines([context.source, context.campaign, context.utmSource]).join(' / ')}`
      : undefined,
    context.appUserId ? `사용자 ID: ${context.appUserId}` : undefined,
    context.sessionId ? `세션: ${context.sessionId}` : undefined,
    feedbackId ? `피드백 ID: ${feedbackId}` : undefined,
  ]).join('\n');
}

/**
 * Sends the Slack notification and normalizes all Slack failures into row status.
 */
async function postSlack(payload: FeedbackSubmissionPayload, feedbackId?: string): Promise<SlackStatus> {
  const config = getSlackConfig();
  if (!config) {
    return { ok: false, status: 'skipped_missing_config', error: 'SLACK_BOT_TOKEN missing' };
  }

  try {
    const response = await fetchWithTimeout('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: config.channel,
        text: buildSlackText(payload, feedbackId),
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    if (!response.ok) {
      return { ok: false, status: 'failed', error: `slack_http_${response.status}` };
    }

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      ts?: string;
      error?: string;
    } | null;
    if (!data?.ok) {
      return { ok: false, status: 'failed', error: data?.error || 'slack_unknown_error' };
    }

    return { ok: true, status: 'sent', ts: data.ts };
  } catch (error) {
    return { ok: false, status: 'failed', error: `slack_transport_${errorToken(error)}` };
  }
}

/**
 * Stores a feedback submission, sends Slack when configured, and persists delivery status.
 */
export async function handleFeedbackSubmission(input: unknown, meta: FeedbackMeta = {}) {
  const payload = normalizeFeedbackPayload(input);
  const supabase = getSupabaseConfig();
  const inserted = await insertFeedback(supabase, payload, meta);
  const slack = await postSlack(payload, inserted.id);
  await updateSlackStatus(supabase, inserted.id, slack);

  return {
    ok: true,
    id: inserted.id,
    slack: {
      ok: slack.ok,
      status: slack.status,
    },
  };
}
