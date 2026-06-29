-- ============================================================
-- 관리자 대시보드 — AI 인사이트 캐시
--   매 요청마다 Sonnet 호출 비용 줄이기 위해 (period_key + journey_hash) 별 캐싱.
--   journey_hash 가 같으면 데이터 변화 없음 → 재생성 안 함.
-- ============================================================

CREATE TABLE dashboard_insights (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  period_key    TEXT NOT NULL,            -- 예: "thisMonth_2026-04-01_2026-04-24"
  journey_hash  TEXT NOT NULL,            -- journeyMap 핵심 데이터의 sha256 16자
  insight_text  TEXT NOT NULL,            -- AI 생성 인사이트 본문

  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (period_key, journey_hash)
);

CREATE INDEX idx_dashboard_insights_period
  ON dashboard_insights(period_key, generated_at DESC);

ALTER TABLE dashboard_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for dashboard_insights"
  ON dashboard_insights FOR ALL USING (true) WITH CHECK (true);
