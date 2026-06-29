-- 036_nps_responses.sql
-- NPS (Net Promoter Score) 응답 — 방문수거 결제완료 (orders.status='completed') 다음날 12:00 발송.
-- phone 기준 평생 1회 한정 (재예약 고객도 한 번만 묻기) → phone UNIQUE.
-- 4 버튼: "1~2점" / "3점" / "4점" / "5점" → score_bucket 저장 후 자유 피드백 수집.

CREATE TABLE IF NOT EXISTS nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  session_id TEXT,
  customer_name TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score_bucket TEXT,        -- '1~2점' | '3점' | '4점' | '5점' | null(미응답)
  responded_at TIMESTAMPTZ,
  feedback_text TEXT,
  feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_phone ON nps_responses(phone);
CREATE INDEX IF NOT EXISTS idx_nps_sent_at ON nps_responses(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nps_score ON nps_responses(score_bucket) WHERE score_bucket IS NOT NULL;
