-- ============================================
-- 상담 태그 마스터 테이블
-- 채널톡 상담 태그를 DB에서 관리 (자동 태깅 연동용)
-- ============================================

CREATE TABLE IF NOT EXISTS consultation_tags (
  id SERIAL PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,           -- 태그명 (예: "미수거/누락")
  description TEXT DEFAULT '',        -- 상세 설명
  category TEXT DEFAULT '',           -- 상위 카테고리 (예: "미수거")
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultation_tags_category ON consultation_tags(category);
CREATE INDEX IF NOT EXISTS idx_consultation_tags_active ON consultation_tags(is_active);

ALTER TABLE consultation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for consultation_tags" ON consultation_tags FOR ALL USING (true) WITH CHECK (true);
