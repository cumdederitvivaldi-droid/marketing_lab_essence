-- 035_orders_channel.sql
-- 유입 채널 (orders.channel) — 예약확정 후 고객이 직접 선택. 4 옵션:
--   "블로그/카페" / "커버링앱" / "SNS" / "지인 추천"
-- 같은 phone 의 이전 주문에 channel 있으면 다시 묻지 않음 → 자동 상속.
-- new_dashboard analytics traffic 섹션이 이 컬럼을 카운트.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel) WHERE channel IS NOT NULL;
