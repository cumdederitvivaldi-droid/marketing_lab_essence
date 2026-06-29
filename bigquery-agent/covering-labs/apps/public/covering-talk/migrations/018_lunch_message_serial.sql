-- 런치 메시지 중복 방지용 serial_number 컬럼
ALTER TABLE lunch_messages ADD COLUMN IF NOT EXISTS serial_number TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lunch_messages_serial ON lunch_messages(serial_number) WHERE serial_number IS NOT NULL;
