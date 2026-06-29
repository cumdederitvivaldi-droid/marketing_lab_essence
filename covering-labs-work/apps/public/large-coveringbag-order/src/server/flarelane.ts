const TRACK_API_BASE = 'https://api.flarelane.com/v1/projects';
const PRODUCT_CODE = 'LARGE_COVERING_BAG';
const PRODUCT_NAME = 'large_coveringbag';

export const FLARELANE_CLIENT_EVENT_NAMES = new Set([
  '[ROUTE] ProductPurchaseScreen',
  '[ROUTE] ProductPurchaseCompleteScreen',
]);

type FlareLaneProps = Record<string, unknown>;

type FlareLaneResult = {
  ok: boolean;
  skipped?: true;
  reason?: string;
  status?: number;
};

const BLOCKED_DATA_KEYS = new Set([
  'name',
  'phone',
  'address',
  'addressDetail',
  'entryDetail',
  'request',
  'url',
  'current_url',
  '$current_url',
  '$user_id',
]);

function getEnvValue(name: string) {
  return (process.env[name] || '').replace(/\\n/g, '').trim();
}

export function getFlareLaneSubjectId(props: FlareLaneProps) {
  const subjectId = props.app_user_id ?? props.user_id ?? props.$user_id;
  const normalized = String(subjectId || '').trim();

  return normalized || null;
}

function normalizeDataValue(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(',');
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

function buildEventData(props: FlareLaneProps, source: string) {
  const subjectId = getFlareLaneSubjectId(props);
  const base: FlareLaneProps = {
    app_name: 'large-coveringbag-order',
    product_code: PRODUCT_CODE,
    product_name: PRODUCT_NAME,
    product_volume_l: 220,
    funnel_name: 'large_coveringbag_order',
    userId: subjectId || undefined,
    ...props,
    flarelane_source: source,
  };

  return Object.fromEntries(
    Object.entries(base)
      .filter(([key]) => !BLOCKED_DATA_KEYS.has(key))
      .map(([key, value]) => [key, normalizeDataValue(value)])
      .filter(([, value]) => value !== null),
  );
}

export async function sendFlareLaneEvent(
  eventName: string,
  props: FlareLaneProps,
  source: string,
): Promise<FlareLaneResult> {
  const projectId = getEnvValue('FLARELANE_PROJECT_ID');
  const apiKey = getEnvValue('FLARELANE_API_KEY');
  const subjectId = getFlareLaneSubjectId(props);

  if (!subjectId) {
    return { ok: true, skipped: true, reason: 'missing_subject_id' };
  }

  if (!projectId || !apiKey) {
    return { ok: true, skipped: true, reason: 'missing_flarelane_env' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(`${TRACK_API_BASE}/${projectId}/track`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        events: [
          {
            subjectType: 'user',
            subjectId,
            type: eventName,
            data: buildEventData(props, source),
          },
        ],
      }),
    });

    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, reason: 'request_failed' };
  } finally {
    clearTimeout(timeoutId);
  }
}
