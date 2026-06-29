import { GoogleAuth } from 'google-auth-library';

export const SHEET_ID = '1om1j9IHFfzwc4Zmlu7oSfP4wW1hAmyd6QiiV9TuNOkQ';
export const SHEET_NAME = 'Walla Response';
export const RECENT_APPLICATION_BLOCKED_CODE = 'RECENT_APPLICATION_BLOCKED';

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SETUP_ERROR = '지금은 신청 접수가 준비되지 않았습니다. 관리자 설정 후 다시 시도해주세요.';

type PublicError = Error & {
  statusCode?: number;
  publicMessage?: string;
  code?: string;
  submittedAt?: string | null;
  cause?: unknown;
};

export function createPublicError(
  message: string,
  statusCode = 500,
  cause?: unknown,
  extras: Record<string, unknown> = {},
) {
  const error = new Error(message) as PublicError;
  error.statusCode = statusCode;
  error.publicMessage = message;
  error.cause = cause;
  Object.assign(error, extras);
  return error;
}

export async function getAccessToken(scope: string | string[], defaultErrorMessage: string) {
  try {
    const scopedAuth = new GoogleAuth({ scopes: scope });
    const client = await scopedAuth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;

    if (!token) {
      throw new Error('Empty access token');
    }

    return token;
  } catch (cause) {
    throw createPublicError(defaultErrorMessage || DEFAULT_SETUP_ERROR, 500, cause);
  }
}

export function normalizeDeliveryPhone(value: unknown) {
  let phone = String(value || '').trim().replace(/[-\s]/g, '');

  if (phone.indexOf('+82') === 0) {
    phone = `0${phone.slice(3)}`;
  }

  return phone;
}

export function isValidDeliveryPhone(phone: string) {
  return /^0\d{9,10}$/.test(String(phone || '').trim());
}

function parseSubmittedAt(value: unknown) {
  const timestamp = String(value || '').trim();
  if (!timestamp) return null;

  const kstMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timestamp);
  if (kstMatch) {
    const [, year, month, day, hour, minute, second] = kstMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 9, Number(minute), Number(second));
  }

  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function evaluateRecentApplication(rows: string[][], phone: string, nowMs = Date.now()) {
  const normalizedPhone = normalizeDeliveryPhone(phone);

  if (!isValidDeliveryPhone(normalizedPhone)) {
    throw createPublicError('정확한 휴대폰 번호를 입력해주세요.', 400);
  }

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const rowPhone = normalizeDeliveryPhone(row?.[4]);

    if (rowPhone !== normalizedPhone) continue;

    const submittedAt = String(row?.[0] || '').trim();
    const submittedAtMs = parseSubmittedAt(submittedAt);

    if (submittedAtMs === null) continue;

    return {
      blocked: nowMs - submittedAtMs < SEVEN_DAYS_IN_MS,
      submittedAt,
      normalizedPhone,
    };
  }

  return {
    blocked: false,
    submittedAt: null,
    normalizedPhone,
  };
}

export async function getRecentApplicationStatus(token: string, phone: string, defaultErrorMessage: string) {
  let sheetsRes: Response;
  let sheetsData: { values?: string[][] };

  try {
    sheetsRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${SHEET_NAME}!A2:E`)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    sheetsData = await sheetsRes.json();
  } catch (cause) {
    throw createPublicError(defaultErrorMessage, 502, cause);
  }

  if (!sheetsRes.ok) {
    throw createPublicError(defaultErrorMessage, 502, sheetsData);
  }

  return evaluateRecentApplication(sheetsData.values || [], phone);
}

export function createRecentApplicationBlockedError(submittedAt: string | null) {
  return createPublicError(
    '대형 커버링 봉투는 마지막 신청일 기준 7일 뒤에 다시 신청 가능해요.',
    409,
    null,
    {
      code: RECENT_APPLICATION_BLOCKED_CODE,
      submittedAt,
    },
  );
}

export function formatKstTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}
