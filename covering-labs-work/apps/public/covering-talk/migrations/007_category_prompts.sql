-- 007: 채널톡 카테고리별 프롬프트 테이블 (해피톡과 완전 분리)
-- 각 카테고리의 전문 프롬프트를 DB에서 관리하여 런타임 수정 가능

CREATE TABLE IF NOT EXISTS category_prompts (
  id              SERIAL PRIMARY KEY,
  category_id     TEXT NOT NULL UNIQUE,       -- 예: "이용_배출품목", "구독_관리"
  category_name   TEXT NOT NULL,              -- 표시명: "배출방법/수거품목/수거시간"
  parent_category TEXT,                       -- 상위 그룹: "이용", "배송", "미수거" 등
  prompt_rules    TEXT NOT NULL,              -- 카테고리별 프롬프트 규칙 (<100줄)
  policy_sections TEXT[] DEFAULT '{}',        -- 참조할 정책 섹션명 배열
  ai_scope_note   TEXT,                       -- AI 답변 가능/불가 범위 설명 (내부 참고)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  updated_by      TEXT
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_category_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_category_prompts_updated_at
  BEFORE UPDATE ON category_prompts
  FOR EACH ROW
  EXECUTE FUNCTION update_category_prompts_updated_at();
