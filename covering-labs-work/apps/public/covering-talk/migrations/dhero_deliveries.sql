-- 두발히어로 배송 이력 캐시 테이블
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS dhero_deliveries (
  id BIGSERIAL PRIMARY KEY,
  book_id TEXT NOT NULL,
  order_id TEXT,
  received_date TIMESTAMPTZ,
  pickup_date TIMESTAMPTZ,
  release_date TIMESTAMPTZ,
  delivered_date TIMESTAMPTZ,
  receiver_name TEXT,
  receiver_phone TEXT,
  receiver_address TEXT,
  product_name TEXT,
  status TEXT,
  fail_reason TEXT,
  cancel_date TIMESTAMPTZ,
  cancel_reason TEXT,
  accident_date TIMESTAMPTZ,
  accident_reason TEXT,
  return_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id)
);

CREATE INDEX IF NOT EXISTS idx_dhero_receiver_phone ON dhero_deliveries(receiver_phone);
CREATE INDEX IF NOT EXISTS idx_dhero_received_date ON dhero_deliveries(received_date);
CREATE INDEX IF NOT EXISTS idx_dhero_status ON dhero_deliveries(status);
