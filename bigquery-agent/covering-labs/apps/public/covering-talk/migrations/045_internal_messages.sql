-- 045_internal_messages.sql — 방문수거 세션별 내부대화 + @멘션
-- 채널톡 isInternal 패턴을 우리 DB 에 옮긴 형태. messages 테이블 재사용 + 새 컬럼 2개.
-- 외부 send 경로는 is_internal=false 만 SELECT → 고객에게 절대 노출 안 됨.

-- messages 에 내부대화/멘션 컬럼 추가
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mentioned_user_ids INTEGER[] NOT NULL DEFAULT '{}';

-- 멘션 조회 인덱스 (GIN — 배열 element 검색, partial 로 storage 절약)
CREATE INDEX IF NOT EXISTS idx_messages_mentioned
  ON messages USING GIN (mentioned_user_ids)
  WHERE is_internal = TRUE;

-- 내부대화 세션별 조회 인덱스 (partial)
CREATE INDEX IF NOT EXISTS idx_messages_internal_session
  ON messages (session_id, created_at)
  WHERE is_internal = TRUE;

-- 멘션 확인 시각 — per-user-per-session
CREATE TABLE IF NOT EXISTS internal_mention_reads (
  user_id      INTEGER     NOT NULL,
  session_id   TEXT        NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_mention_reads_user
  ON internal_mention_reads (user_id, last_read_at DESC);
