-- app_settings: 전역 앱 설정 (자동모드 등)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본값 삽입
INSERT INTO app_settings (key, value) VALUES ('auto_mode', 'false')
ON CONFLICT (key) DO NOTHING;