-- 014: 기사/차량 분리 — drivers에서 차량 정보 분리 → vehicles 테이블 신규
-- 2026-04-10

-- (A) vehicles 테이블 생성
CREATE TABLE IF NOT EXISTS vehicles (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plate_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL,             -- '2.5톤' | '1톤 탑차' | '1톤 저상탑차'
  max_cube     NUMERIC NOT NULL DEFAULT 0,
  memo         TEXT NOT NULL DEFAULT '',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_active ON vehicles(is_active) WHERE is_active = true;

-- (B) drivers 테이블에서 차량 컬럼 제거
ALTER TABLE drivers DROP COLUMN IF EXISTS vehicle;
ALTER TABLE drivers DROP COLUMN IF EXISTS max_cube;

-- (C) orders에 vehicle_id 추가
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS vehicle_id TEXT DEFAULT '';

-- (D) lunch_orders에 vehicle_id 추가
ALTER TABLE lunch_orders
  ADD COLUMN IF NOT EXISTS vehicle_id TEXT DEFAULT '';

-- (E) 기존 차량 데이터 이전 (seed)
INSERT INTO vehicles (plate_number, vehicle_type, max_cube, memo) VALUES
  ('840모4269', '2.5톤',       10, '메인 (우정훈)'),
  ('97구7569',  '1톤 탑차',     7, '단건1'),
  ('815두5598', '1톤 탑차',     7, '단건2'),
  ('88노4951',  '1톤 탑차',     7, '단건3'),
  ('875수2984', '1톤 탑차',     7, '단건4'),
  ('85오0706',  '1톤 저상탑차',  7, '단건5'),
  ('95조7058',  '1톤 저상탑차',  7, '단건6')
ON CONFLICT (plate_number) DO NOTHING;
