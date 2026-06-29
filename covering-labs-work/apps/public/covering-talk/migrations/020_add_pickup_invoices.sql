-- ============================================================
-- 방문수거 단건 세금계산서 발행 테이블
--   - 일회성 단건 발행 (vendor 개념 없음, 매번 사업자 정보 입력)
--   - 채팅 세션에서 트리거 시 session_id 자동 연결
--   - 채팅 외에서도 발행 가능하도록 session_id는 nullable
-- ============================================================

CREATE TABLE pickup_invoices (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 세션 연결 (채팅에서 발행 시 자동 채움, optional)
  session_id          TEXT,

  -- 사업자 정보 (매번 입력 → 비정규화 저장)
  email               TEXT NOT NULL,                  -- 세금계산서 수신 이메일
  business_number     TEXT NOT NULL,                  -- 사업자등록번호 (10자리, 하이픈 없이)
  business_name       TEXT NOT NULL,                  -- 사업자명/상호
  representative_name TEXT NOT NULL,                  -- 대표자명

  -- 금액
  supply_cost         INTEGER NOT NULL DEFAULT 0,     -- 공급가액 (세전)
  tax                 INTEGER NOT NULL DEFAULT 0,     -- 세액
  total_amount        INTEGER NOT NULL DEFAULT 0,     -- 합계

  -- 볼타 API 연동
  issuance_key        TEXT,                           -- 볼타 발행 식별 키
  nts_transaction_id  TEXT,                           -- 국세청 승인번호

  -- 상태
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'issued', 'failed', 'cancelled')),
  issued_at           TIMESTAMPTZ,                    -- 발행 완료 시각
  cancelled_at        TIMESTAMPTZ,                    -- 취소 완료 시각
  error_message       TEXT,                           -- 실패/취소 사유

  -- 메모
  description         TEXT DEFAULT '',                -- 세금계산서 비고

  -- 발행자 (상담사)
  created_by          TEXT,                           -- 발행 처리한 상담사 이름

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 인덱스 ─────────────────────────────────────
CREATE INDEX idx_pickup_invoices_session_id ON pickup_invoices(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_pickup_invoices_status     ON pickup_invoices(status);
CREATE INDEX idx_pickup_invoices_created_at ON pickup_invoices(created_at DESC);
CREATE INDEX idx_pickup_invoices_business_number ON pickup_invoices(business_number);

-- ─── updated_at 자동 갱신 트리거 ────────────────
CREATE OR REPLACE FUNCTION update_pickup_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pickup_invoices_updated_at
  BEFORE UPDATE ON pickup_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_pickup_invoices_updated_at();

-- ─── RLS ────────────────────────────────────────
ALTER TABLE pickup_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for pickup_invoices" ON pickup_invoices FOR ALL USING (true) WITH CHECK (true);
