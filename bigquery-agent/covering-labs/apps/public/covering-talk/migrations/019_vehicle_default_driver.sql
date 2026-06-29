-- 019: 차량 고정 기사 매핑
-- 특정 차량을 항상 타는 기사가 있는 경우 자동배차 시 같이 배정되도록 연결.
-- 해제는 NULL로.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS default_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_default_driver
  ON vehicles(default_driver_id)
  WHERE default_driver_id IS NOT NULL;
