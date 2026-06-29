-- 044_orders_status_prepaid.sql
-- §6.1 — orders.status CHECK 제약에 'prepaid' 추가.
--   기존 orders_status_check 가 콘솔에서 추가됐던 것으로 추정 (코드 마이그레이션 파일에 없음).
--   prepaid 로 PATCH 시 violates check constraint(23514) 발생.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('confirmed', 'payment_requested', 'prepaid', 'completed', 'cancelled'));
