-- ============================================================
-- orders 테이블 최종 스키마 (방문수거)
-- 기존 내부 bookings + 외부 커버링 DB → 단일 테이블 통합
-- ============================================================

CREATE TABLE orders (
  -- ■ 식별
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number      TEXT NOT NULL UNIQUE,     -- 대문자 영숫자 8자리 (예: "A3K9X2B7")
  session_id        TEXT,                     -- 채팅 세션 연결 (nullable)
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),

  -- ■ 상태 (4가지)
  --   confirmed:         일정확정 (기본값)
  --   cancelled:         예약취소
  --   payment_requested: 결제요청
  --   completed:         완료 (결제완료 포함)
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled', 'payment_requested', 'completed')),

  -- ■ 고객 정보
  customer_name     TEXT NOT NULL,
  phone             TEXT NOT NULL,            -- 항상 하이픈 포맷: 010-7199-7626
  address           TEXT NOT NULL DEFAULT '',  -- 전체 주소 한 줄

  -- ■ 일정
  date              TEXT NOT NULL,            -- YYYY-MM-DD
  time_slot         TEXT DEFAULT '',          -- HH:MM 또는 HH:MM~HH:MM

  -- ■ 현장 조건
  floor             INTEGER,
  has_elevator      BOOLEAN DEFAULT false,
  has_parking       BOOLEAN DEFAULT false,
  has_ground_access BOOLEAN DEFAULT true,     -- 지상 출입 가능 여부
  need_ladder       BOOLEAN DEFAULT false,
  ladder_fee        INTEGER DEFAULT 0,
  crew_size         INTEGER DEFAULT 1,

  -- ■ 품목 & 금액
  items             JSONB DEFAULT '[]',       -- [{category, name, displayName, price, quantity, volume}]
  total_volume      NUMERIC(8,3) DEFAULT 0,   -- 총 부피 (m³)
  total_price       INTEGER DEFAULT 0,        -- 전체 가격 (정산 기준)

  -- ■ 결제 (복수 결제 ID 지원)
  --   발송할 때마다 배열에 추가, 조회 시 전체 순회하여 하나라도 tid/paidAt 있으면 결제완료
  payment_ids       JSONB DEFAULT '[]',       -- [{reqId, payUrl, sentAt, tid?, paidAt?}]

  -- ■ 메모 & 사진
  memo              TEXT DEFAULT '',
  photos            JSONB DEFAULT '[]'
);

-- 인덱스
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_session_id ON orders(session_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(date);
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();
