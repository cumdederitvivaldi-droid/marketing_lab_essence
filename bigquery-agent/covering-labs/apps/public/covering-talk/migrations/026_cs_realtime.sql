-- 026_cs_realtime.sql
-- CS Realtime 섹션 인프라 — 처리속도 / AI 분류 / 큐 깊이 측정
--
-- 시스템별 분리 원칙 (방문수거 ≠ 런치 ≠ 채널톡)
-- - 방문수거: messages 테이블에 reply_kind / responded_in_ms 컬럼 추가 (사후 계산)
-- - 런치: lunch_messages 테이블에 동일 컬럼 추가
-- - 채널톡: 외부 cases API가 시간 메트릭을 제공하므로 우리는 AI 분류만 별도 테이블에 기록
--
-- reply_kind 정의:
--   ai_auto    — AI draft 그대로 송신 (수정 0%)
--   ai_assist  — AI draft 일부 수정 (1~30%)
--   human      — AI draft 미사용 또는 30%+ 수정
-- draft_char_overlap: AI draft 대비 송신 메시지의 문자 일치 비율 (0.0 ~ 1.0)

-- ─── 방문수거 messages ──────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_kind TEXT
    CHECK (reply_kind IN ('ai_auto', 'ai_assist', 'human')),
  ADD COLUMN IF NOT EXISTS responded_in_ms INT,
  ADD COLUMN IF NOT EXISTS draft_char_overlap REAL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_kind
  ON messages(reply_kind, created_at DESC)
  WHERE reply_kind IS NOT NULL;

-- ─── 런치 lunch_messages ────────────────────────
ALTER TABLE lunch_messages
  ADD COLUMN IF NOT EXISTS reply_kind TEXT
    CHECK (reply_kind IN ('ai_auto', 'ai_assist', 'human')),
  ADD COLUMN IF NOT EXISTS responded_in_ms INT,
  ADD COLUMN IF NOT EXISTS draft_char_overlap REAL;

CREATE INDEX IF NOT EXISTS idx_lunch_messages_reply_kind
  ON lunch_messages(reply_kind, created_at DESC)
  WHERE reply_kind IS NOT NULL;

-- ─── 채널톡 reply 로그 (AI 분류 전용) ─────────────
-- 시간 메트릭은 채널톡 cases API에서 가져오므로 여기엔 저장하지 않음
CREATE TABLE IF NOT EXISTS channeltalk_reply_logs (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  reply_kind TEXT NOT NULL CHECK (reply_kind IN ('ai_auto', 'ai_assist', 'human')),
  draft_char_overlap REAL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ct_reply_logs_sent_at
  ON channeltalk_reply_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_reply_logs_manager
  ON channeltalk_reply_logs(manager_name, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_reply_logs_chat
  ON channeltalk_reply_logs(chat_id, sent_at DESC);

ALTER TABLE channeltalk_reply_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for channeltalk_reply_logs"
  ON channeltalk_reply_logs
  FOR ALL USING (true) WITH CHECK (true);
