-- ============================================================
-- 런치 채팅 테이블 스키마
-- 방문수거(conversations/messages)와 완전 분리된 런치 전용 채팅
-- 해피톡 채널 공유, DB는 독립
-- ============================================================

-- ■ 1. lunch_conversations — 런치 채팅 세션 (벤더 기준)
CREATE TABLE lunch_conversations (
  -- 식별 (해피톡 세션 ID를 PK로 사용, conversations와 동일 패턴)
  session_id    TEXT PRIMARY KEY,
  user_key      TEXT NOT NULL,       -- 해피톡 userKey
  sender_key    TEXT NOT NULL,       -- 해피톡 senderKey

  -- 벤더 연결
  vendor_id     UUID REFERENCES lunch_vendors(id) ON DELETE SET NULL,
  vendor_name   TEXT NOT NULL DEFAULT '',  -- 비정규화 (표시용)
  phone         TEXT DEFAULT '',           -- 사장님 연락처

  -- 상태 관리
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'closed', 'needs_check')),
  assignee      TEXT,               -- 담당 상담사
  tags          TEXT[] NOT NULL DEFAULT '{}',
  memo          TEXT NOT NULL DEFAULT '',
  unread_count  INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lunch_conv_vendor_id   ON lunch_conversations(vendor_id);
CREATE INDEX idx_lunch_conv_status      ON lunch_conversations(status);
CREATE INDEX idx_lunch_conv_updated_at  ON lunch_conversations(updated_at DESC);
CREATE INDEX idx_lunch_conv_phone       ON lunch_conversations(phone) WHERE phone IS NOT NULL AND phone != '';

-- ■ 2. lunch_messages — 런치 채팅 메시지
CREATE TABLE lunch_messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES lunch_conversations(session_id) ON DELETE CASCADE,
  role          TEXT NOT NULL,         -- user / assistant / system
  content       TEXT NOT NULL,
  message_type  TEXT NOT NULL DEFAULT 'text',   -- text / image / file
  image_url     TEXT,
  sent_by       TEXT,                  -- 발신 상담사명
  is_edited     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lunch_msg_session_id  ON lunch_messages(session_id);
CREATE INDEX idx_lunch_msg_created_at  ON lunch_messages(session_id, created_at ASC);

-- ■ 3. lunch_orders.session_id → lunch_conversations FK (옵션, NULL 허용)
--    이미 컬럼은 존재하므로 FK 제약만 추가
ALTER TABLE lunch_orders
  ADD CONSTRAINT fk_lunch_orders_session
  FOREIGN KEY (session_id) REFERENCES lunch_conversations(session_id)
  ON DELETE SET NULL;

-- ■ 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_lunch_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lunch_conversations_updated_at
  BEFORE UPDATE ON lunch_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_lunch_conversations_updated_at();

-- ■ 5. RLS
ALTER TABLE lunch_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lunch_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for lunch_conversations" ON lunch_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for lunch_messages"      ON lunch_messages      FOR ALL USING (true) WITH CHECK (true);
