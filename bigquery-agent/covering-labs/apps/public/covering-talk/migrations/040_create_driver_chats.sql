-- 040_create_driver_chats.sql
-- 기사님 채팅 세션 — 메인 conversations 큐에서 제외하고 별도 도크에서 관리.
-- 운영자가 add/delete 가능. 추가된 session_id 는 /api/conversations 목록·업데이트에서 빠짐.

CREATE TABLE IF NOT EXISTS driver_chats (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  driver_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_chats_active ON driver_chats(active) WHERE active = true;

INSERT INTO driver_chats (session_id, driver_name) VALUES
  ('327819165', '우정훈'),
  ('327818792', '김송근'),
  ('327818778', '김장극')
ON CONFLICT (session_id) DO NOTHING;
