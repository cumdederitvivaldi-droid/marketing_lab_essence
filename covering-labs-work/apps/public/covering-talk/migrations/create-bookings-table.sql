-- bookings 테이블: 수거 예약 관리
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT,
  slack_thread_ts TEXT,

  -- 고객 정보
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  address_detail TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]',
  has_elevator BOOLEAN NOT NULL DEFAULT false,
  has_parking BOOLEAN NOT NULL DEFAULT false,
  latitude NUMERIC,
  longitude NUMERIC,

  -- 수거 일정
  date TEXT NOT NULL,
  time_slot TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT '',
  confirmed_time TEXT,
  confirmed_duration INTEGER,
  completion_photos JSONB NOT NULL DEFAULT '[]',

  -- 품목 & 견적
  items JSONB NOT NULL DEFAULT '[]',
  total_loading_cube NUMERIC NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  estimate_min INTEGER NOT NULL DEFAULT 0,
  estimate_max INTEGER NOT NULL DEFAULT 0,
  final_price INTEGER,
  need_ladder BOOLEAN NOT NULL DEFAULT false,
  ladder_type TEXT,
  ladder_hours INTEGER,
  ladder_price INTEGER NOT NULL DEFAULT 0,
  crew_size INTEGER NOT NULL DEFAULT 1,

  -- 기사 배차
  driver_id TEXT,
  driver_name TEXT,
  route_order INTEGER,
  unloading_stop_after TEXT,

  -- 어드민
  admin_memo TEXT NOT NULL DEFAULT '',

  -- 연결 (채팅 → 예약)
  session_id TEXT,
  nicepay_req_id TEXT,
  nicepay_tid TEXT
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_bookings_updated_at();
