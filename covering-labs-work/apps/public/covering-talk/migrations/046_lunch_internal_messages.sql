-- 046_lunch_internal_messages.sql — 런치 도메인 세션별 내부대화 + @멘션
-- 045 (방문수거) 와 동일 패턴. lunch_messages 테이블 재사용 + 새 컬럼 2개.

ALTER TABLE lunch_messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mentioned_user_ids INTEGER[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_lunch_messages_mentioned
  ON lunch_messages USING GIN (mentioned_user_ids)
  WHERE is_internal = TRUE;

CREATE INDEX IF NOT EXISTS idx_lunch_messages_internal_session
  ON lunch_messages (session_id, created_at)
  WHERE is_internal = TRUE;

CREATE TABLE IF NOT EXISTS lunch_internal_mention_reads (
  user_id      INTEGER     NOT NULL,
  session_id   TEXT        NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_lunch_internal_mention_reads_user
  ON lunch_internal_mention_reads (user_id, last_read_at DESC);
