import type { FormData } from '../types';
import { apiUrl } from '../lib/path';
import { getTrackingContext } from '../lib/analytics';

export const RECENT_APPLICATION_BLOCKED_CODE = 'RECENT_APPLICATION_BLOCKED';

export type SubmitApiError = Error & {
  code?: string;
  submittedAt?: string | null;
};

export async function submitToSheets(data: FormData): Promise<void> {
  const response = await fetch(apiUrl('/api/submit'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...data,
      trackingContext: getTrackingContext(),
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const error = new Error(err.error || `제출 실패: ${response.status}`) as SubmitApiError;
    error.code = err.code;
    error.submittedAt = err.submittedAt || null;
    throw error;
  }
}

export async function checkRecentBagApplication(phone: string): Promise<boolean> {
  const response = await fetch(apiUrl('/api/check-recent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      trackingContext: getTrackingContext(),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `신청 여부 확인 실패: ${response.status}`);
  }

  return Boolean(payload.blocked);
}
