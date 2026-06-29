-- 038_webhook_debug_log.sql
-- 임시 디버그 테이블 — referrer webhook 진단용. 어떤 path/body 가 들어오는지 확인 후
-- 진단 끝나면 ALTER 로 비활성화 또는 테이블 DROP.

CREATE TABLE IF NOT EXISTS webhook_debug_log (
  id BIGSERIAL PRIMARY KEY,
  path TEXT NOT NULL,
  user_key TEXT,
  sender_key TEXT,
  body JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_debug_received ON webhook_debug_log(received_at DESC);
