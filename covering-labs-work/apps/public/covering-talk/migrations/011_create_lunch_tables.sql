-- ============================================================
-- 런치 테이블 스키마 (지점 마스터 + 주문)
-- Google Sheets(단건_수거 + 단건_정산) → Supabase 이관
-- ============================================================

-- ■ 1. lunch_vendors — 지점(레스토랑) 마스터
CREATE TABLE lunch_vendors (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,           -- 지점명 (= 신청자)
  address         TEXT NOT NULL DEFAULT '',        -- 기본 수거주소
  owner_phone     TEXT NOT NULL DEFAULT '',        -- 사장님 연락처 (= 결제자)
  settlement_type TEXT NOT NULL DEFAULT 'link_pay'
                  CHECK (settlement_type IN ('link_pay', 'monthly_invoice', 'tax_invoice')),
  memo            TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lunch_vendors_name ON lunch_vendors(name);
CREATE INDEX idx_lunch_vendors_active ON lunch_vendors(is_active) WHERE is_active = true;

-- ■ 2. lunch_orders — 주문 (수거 + 정산 통합)
CREATE TABLE lunch_orders (
  -- 식별
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number    TEXT NOT NULL UNIQUE,            -- 8자리 영숫자
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 상태 (orders와 동일 4가지)
  status          TEXT NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed', 'cancelled', 'payment_requested', 'completed')),

  -- 지점
  vendor_id       UUID REFERENCES lunch_vendors(id),
  vendor_name     TEXT NOT NULL,                   -- 비정규화 (표시용)

  -- 주문 정보
  date            TEXT NOT NULL,                   -- YYYY-MM-DD
  pickup_time     TEXT NOT NULL DEFAULT '',         -- 수거시간
  box_count       TEXT NOT NULL DEFAULT '',         -- 도시락 개수 ("2봉지", "144" 등)
  pickup_address  TEXT NOT NULL DEFAULT '',         -- 수거주소
  site_contact    TEXT NOT NULL DEFAULT '',         -- 현장 담당자
  notes           TEXT NOT NULL DEFAULT '',         -- 특이사항/비고

  -- 수거
  is_picked_up    BOOLEAN NOT NULL DEFAULT false,

  -- 가격
  sorting_price   INTEGER NOT NULL DEFAULT 0,      -- 선별가격
  total_amount    INTEGER NOT NULL DEFAULT 0,      -- 최종정산금액 (= 운송가격, 부가세 포함)

  -- 정산
  settlement_type TEXT NOT NULL DEFAULT 'link_pay'
                  CHECK (settlement_type IN ('link_pay', 'monthly_invoice', 'tax_invoice')),
  invoice_issued  BOOLEAN NOT NULL DEFAULT false,  -- 매출발행 여부

  -- 결제 (PaymentEntry 배열, orders와 동일 패턴)
  payment_ids     JSONB NOT NULL DEFAULT '[]',     -- [{reqId, payUrl?, sentAt?, tid?, paidAt?}]

  -- 연동 (향후 커버링톡)
  session_id      TEXT
);

-- 인덱스
CREATE INDEX idx_lunch_orders_order_number ON lunch_orders(order_number);
CREATE INDEX idx_lunch_orders_date ON lunch_orders(date);
CREATE INDEX idx_lunch_orders_status ON lunch_orders(status);
CREATE INDEX idx_lunch_orders_vendor_id ON lunch_orders(vendor_id);
CREATE INDEX idx_lunch_orders_vendor_name ON lunch_orders(vendor_name);
CREATE INDEX idx_lunch_orders_created_at ON lunch_orders(created_at DESC);
CREATE INDEX idx_lunch_orders_settlement ON lunch_orders(settlement_type);
CREATE INDEX idx_lunch_orders_session_id ON lunch_orders(session_id) WHERE session_id IS NOT NULL;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_lunch_vendors_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lunch_vendors_updated_at
  BEFORE UPDATE ON lunch_vendors
  FOR EACH ROW
  EXECUTE FUNCTION update_lunch_vendors_updated_at();

CREATE OR REPLACE FUNCTION update_lunch_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lunch_orders_updated_at
  BEFORE UPDATE ON lunch_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_lunch_orders_updated_at();

-- RLS
ALTER TABLE lunch_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE lunch_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for lunch_vendors" ON lunch_vendors FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for lunch_orders" ON lunch_orders FOR ALL USING (true) WITH CHECK (true);
