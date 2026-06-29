-- 런치 AI 파싱된 주문 데이터 저장 컬럼
ALTER TABLE lunch_conversations ADD COLUMN IF NOT EXISTS ai_order_data TEXT;
