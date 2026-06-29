/**
 * 공통 재시도 유틸리티
 * API 호출 시 429(Rate Limit) / 529(Overloaded) 에러에 대해 자동 재시도
 */

interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** 커스텀 재시도 조건. 미지정 시 429/529만 재시도 */
  retryOn?: (err: unknown) => boolean;
}

const DEFAULT_RETRY_ON = (err: unknown): boolean => {
  const status = (err as { status?: number }).status;
  return status === 429 || status === 529;
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const { maxAttempts = 4, baseDelayMs = 2000, retryOn = DEFAULT_RETRY_ON } = options ?? {};

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const shouldRetry = retryOn(err);
      if (!shouldRetry || attempt === maxAttempts - 1) throw err;
      // 지수 백오프: 2s, 4s, 8s...
      const delay = baseDelayMs * Math.pow(2, attempt);
      const status = (err as { status?: number }).status;
      console.warn(`[withRetry] attempt ${attempt + 1} 실패 (status=${status}), ${delay}ms 후 재시도`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
