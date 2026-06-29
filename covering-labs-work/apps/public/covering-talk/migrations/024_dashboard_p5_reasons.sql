-- ============================================================
-- 관리자 대시보드 — P5 넛지 이탈 사유 분류 캐시
--   넛지 도달 후 예약까지 안 간 conversation 의 마지막 고객 발화를
--   Haiku 로 분류 ("비싸다" / "일정안맞음" / "무응답" / "기타").
--   conversation 1개 = 1행. 분류 한 번 하면 영구 캐시.
-- ============================================================

CREATE TABLE dashboard_p5_reasons (
  session_id      TEXT PRIMARY KEY,
  reason_keyword  TEXT NOT NULL,                  -- "비싸다" / "일정안맞음" / "무응답" / "기타"
  last_user_message TEXT,                         -- 분류 근거가 된 마지막 고객 발화 (디버깅용)
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dashboard_p5_reasons_keyword
  ON dashboard_p5_reasons(reason_keyword, processed_at DESC);

ALTER TABLE dashboard_p5_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for dashboard_p5_reasons"
  ON dashboard_p5_reasons FOR ALL USING (true) WITH CHECK (true);
