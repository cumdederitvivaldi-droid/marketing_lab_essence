-- 커버링톡 내부 알림 테이블 (멘션, 배정 등)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient TEXT NOT NULL,           -- 알림 받는 상담사 이름 (users.name)
  sender TEXT NOT NULL,              -- 알림 보낸 상담사 이름
  type TEXT NOT NULL DEFAULT 'mention', -- mention, assign, system
  chat_id TEXT,                      -- 채널톡 chatId (클릭 시 이동용)
  message_preview TEXT,              -- 메시지 미리보기 (100자)
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스: 상담사별 읽지않은 알림 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read
  ON notifications (recipient, read, created_at DESC);
