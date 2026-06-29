-- 013: 배차 관리 필드 추가 + 기사 테이블 생성
-- 2026-04-10

-- (A) orders 테이블에 배차 컬럼 추가
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS driver_id     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_name   TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_phone  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS route_order   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_dispatched BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- (B) lunch_orders에 배차 컬럼 추가
ALTER TABLE lunch_orders
  ADD COLUMN IF NOT EXISTS driver_name   TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_phone  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS driver_memo   TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_dispatched BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

-- (C) 기사 테이블
CREATE TABLE IF NOT EXISTS drivers (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  vehicle    TEXT NOT NULL DEFAULT '',
  max_cube   NUMERIC NOT NULL DEFAULT 0,
  memo       TEXT NOT NULL DEFAULT '',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_dispatched ON orders(is_dispatched, date);
CREATE INDEX IF NOT EXISTS idx_lunch_orders_dispatched ON lunch_orders(is_dispatched, date);
CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(is_active) WHERE is_active = true;
