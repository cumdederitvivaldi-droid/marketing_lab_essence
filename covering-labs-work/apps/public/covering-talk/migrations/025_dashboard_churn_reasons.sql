-- ============================================================
-- 관리자 대시보드 — Phase 별 이탈 사유 분류 캐시 (통합)
--   기존 dashboard_p5_reasons 를 일반화 해서 phase 컬럼 추가.
--   phase 별 모집단 정의는 코드에 있고, 여기는 (session_id, phase) PK 캐시만.
-- ============================================================

-- 1. 기존 P5 전용 테이블을 통합 테이블로 변경
ALTER TABLE dashboard_p5_reasons RENAME TO dashboard_churn_reasons;

-- 2. phase 컬럼 추가 (기존 데이터는 모두 P5 였으므로 default 'phase_5')
ALTER TABLE dashboard_churn_reasons
  ADD COLUMN phase TEXT NOT NULL DEFAULT 'phase_5';

-- 3. PK 변경 — (session_id, phase) composite
ALTER TABLE dashboard_churn_reasons
  DROP CONSTRAINT dashboard_p5_reasons_pkey;
ALTER TABLE dashboard_churn_reasons
  ADD PRIMARY KEY (session_id, phase);

-- 4. RLS 정책 이름 갱신 (기존 정책은 따라옴)
DROP POLICY IF EXISTS "Allow all for dashboard_p5_reasons" ON dashboard_churn_reasons;
CREATE POLICY "Allow all for dashboard_churn_reasons"
  ON dashboard_churn_reasons FOR ALL USING (true) WITH CHECK (true);

-- 5. 인덱스 갱신
DROP INDEX IF EXISTS idx_dashboard_p5_reasons_keyword;
CREATE INDEX idx_dashboard_churn_reasons_phase_keyword
  ON dashboard_churn_reasons(phase, reason_keyword, processed_at DESC);
