-- 037_conversations_referrer.sql
-- 카카오 상담톡 인입 시 해피톡 메타 webhook (reference.extra) 으로 들어오는
-- "이전 페이지" 정보 저장. 채팅 진입 직전 고객이 보고 있던 페이지 URL/메타 텍스트.
-- referrer_at: 메타 수신 시각 (인입 시점 추정).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS referrer_at TIMESTAMPTZ;

-- pending_referrers: metadata webhook 이 첫 user 메시지보다 먼저 도착할 때
-- conversation row 가 아직 없으니 user_key 로 임시 보관. 첫 메시지 webhook 이
-- conversation 생성 후 이 테이블에서 user_key 로 lookup → referrer 옮긴 뒤 row 삭제.
CREATE TABLE IF NOT EXISTS pending_referrers (
  user_key TEXT PRIMARY KEY,
  sender_key TEXT NOT NULL,
  referrer TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_referrers_received_at ON pending_referrers(received_at DESC);
