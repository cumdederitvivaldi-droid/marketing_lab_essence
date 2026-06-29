-- 백오피스 조회 결과 24시간 캐시
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS backoffice_cache (
  phone TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backoffice_cache_cached_at ON backoffice_cache(cached_at);
