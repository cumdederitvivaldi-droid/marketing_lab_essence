-- ============================================================
-- 방문수거 관리자 대시보드 (admin_dashboard_spec.md)
--   1) dashboard_settings — KR 목표값·임계값·하드코딩 등 운영 설정
--
-- 모든 집계는 conversations / orders 테이블에서 동적 산출하므로
-- 별도 funnel snapshot 테이블은 두지 않는다 (필요 시 후속 추가).
-- ============================================================

-- ─── 1. dashboard_settings ──────────────────────────────────
-- KR 목표값, Health Check 임계값, KR2/KR3 하드코딩 등 운영 중 변경 가능한 설정

CREATE TABLE dashboard_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_dashboard_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dashboard_settings_updated_at
  BEFORE UPDATE ON dashboard_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_settings_updated_at();

ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for dashboard_settings"
  ON dashboard_settings FOR ALL USING (true) WITH CHECK (true);

-- ─── 초기 시드 ──────────────────────────────────────────────
INSERT INTO dashboard_settings (key, value, description) VALUES
  -- KR 1: 월 매출 (실값 산출, orders.status='completed')
  ('kr1_target',                  '300000000'::jsonb,  'KR1 월 매출 목표 (원)'),

  -- KR 2: 월 처리 가능 매출 (현재값은 하드코딩, 후속 산출 로직 구현 후 use_hardcoded=false 로 전환)
  ('kr2_target',                  '500000000'::jsonb,  'KR2 월 처리 가능 매출 목표 (원)'),
  ('kr2_use_hardcoded',           'true'::jsonb,       'KR2 하드코딩 사용 여부 (산출 구현 후 false)'),
  ('kr2_current_hardcoded',       '0'::jsonb,          'KR2 현재값 (하드코딩, 단위: 원). 0이면 "—" 표시'),

  -- KR 3: 커버링앱 외 트래픽 매출 비중 (설문 파이프라인 구현 후 use_hardcoded=false 전환)
  ('kr3_target',                  '50'::jsonb,         'KR3 커버링앱 외 트래픽 매출 비중 목표 (%)'),
  ('kr3_use_hardcoded',           'true'::jsonb,       'KR3 하드코딩 사용 여부 (설문 파이프라인 구현 후 false)'),
  ('kr3_current_hardcoded',       '0'::jsonb,          'KR3 현재값 (하드코딩, %). 0%면 "—" 표시'),

  -- 이탈/재진입 판정
  ('churn_window_hours',          '24'::jsonb,         '이탈 판정 — Phase 진입 후 N시간 무전이'),
  ('reentry_window_days',         '14'::jsonb,         '재진입률 — 이탈 후 N일 이내 동일 user_key/phone 재발화'),

  -- Health Check 임계값
  ('health_no_pickup_threshold',  '3.0'::jsonb,        'Health Check 미수거율 임계값 (%)'),
  ('health_cancel_threshold',     '3.0'::jsonb,        'Health Check 취소율 임계값 (%) — 고객/기사 통합'),
  ('health_no_payment_threshold', '2.0'::jsonb,        'Health Check 미결제율 임계값 (%)'),
  ('health_complaint_threshold',  '5'::jsonb,          'Health Check 고객 불만 임계값 (건)'),
  ('health_nps_threshold',        '60'::jsonb,         'Health Check NPS 임계값 (pt)')
ON CONFLICT (key) DO NOTHING;
