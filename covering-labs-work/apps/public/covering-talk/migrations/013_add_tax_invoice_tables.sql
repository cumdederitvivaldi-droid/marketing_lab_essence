-- ============================================================
-- 세금계산서 발행 스키마
-- (1) lunch_vendors에 사업자 정보 컬럼 추가
-- (2) lunch_invoices 테이블 신규 (월별 발행 이력)
-- ============================================================

-- ■ 1. lunch_vendors — 세금계산서 발행용 사업자 정보 추가
ALTER TABLE lunch_vendors
  ADD COLUMN business_number     TEXT DEFAULT '',   -- 사업자등록번호 (10자리, 하이픈 없이)
  ADD COLUMN representative_name TEXT DEFAULT '',   -- 대표자명
  ADD COLUMN tax_email           TEXT DEFAULT '',   -- 세금계산서 수신 이메일
  ADD COLUMN tax_phone           TEXT DEFAULT '',   -- 세금계산서용 연락처 (비어있으면 owner_phone 사용)
  ADD COLUMN business_type       TEXT DEFAULT '',   -- 업태 (예: 음식)
  ADD COLUMN business_item       TEXT DEFAULT '',   -- 종목 (예: 한식)
  ADD COLUMN business_cert_url  TEXT DEFAULT '';   -- 사업자등록증 이미지/PDF URL

-- ■ 2. lunch_invoices — 세금계산서 발행 이력
--   invoice_type:
--     'single'  = 단건 발행 (정산방식=세금계산서) — 주문 1건 = 발행 1건
--     'monthly' = 월말 합산 발행 (정산방식=월말정산) — 해당 월 N건 → 발행 1건
CREATE TABLE lunch_invoices (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id         UUID NOT NULL REFERENCES lunch_vendors(id),
  vendor_name       TEXT NOT NULL,                    -- 비정규화 (표시용)

  -- 발행 유형
  invoice_type      TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (invoice_type IN ('single', 'monthly')),

  -- 발행 기간 (monthly: YYYY-MM, single: 해당 주문 날짜)
  period            TEXT NOT NULL,                    -- YYYY-MM or YYYY-MM-DD

  -- 금액
  supply_cost       INTEGER NOT NULL DEFAULT 0,       -- 공급가액 (세전)
  tax               INTEGER NOT NULL DEFAULT 0,       -- 세액
  total_amount      INTEGER NOT NULL DEFAULT 0,       -- 합계 (공급가액 + 세액)
  order_count       INTEGER NOT NULL DEFAULT 0,       -- 포함된 주문 건수

  -- 볼타 API 연동
  issuance_key      TEXT,                             -- 볼타 발행 식별 키
  nts_transaction_id TEXT,                            -- 국세청 승인번호
  bolta_customer_key TEXT,                            -- 볼타 고객 키 (공급자)

  -- 상태
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'issued', 'failed', 'cancelled')),
  issued_at         TIMESTAMPTZ,                      -- 발행 완료 시각
  error_message     TEXT,                             -- 실패 시 에러 메시지

  -- 메모
  description       TEXT DEFAULT '',                  -- 세금계산서 비고

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 월말정산은 동일 벤더+월 중복 방지 (단건은 제한 없음)
CREATE UNIQUE INDEX idx_lunch_invoices_monthly_unique
  ON lunch_invoices (vendor_id, period)
  WHERE invoice_type = 'monthly';

CREATE INDEX idx_lunch_invoices_vendor_id ON lunch_invoices(vendor_id);
CREATE INDEX idx_lunch_invoices_period    ON lunch_invoices(period);
CREATE INDEX idx_lunch_invoices_status    ON lunch_invoices(status);

-- ■ 3. lunch_orders ↔ lunch_invoices 연결
ALTER TABLE lunch_orders
  ADD COLUMN invoice_id UUID REFERENCES lunch_invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_lunch_orders_invoice_id ON lunch_orders(invoice_id) WHERE invoice_id IS NOT NULL;

-- ■ 4. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_lunch_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lunch_invoices_updated_at
  BEFORE UPDATE ON lunch_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_lunch_invoices_updated_at();

-- ■ 5. RLS
ALTER TABLE lunch_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for lunch_invoices" ON lunch_invoices FOR ALL USING (true) WITH CHECK (true);
