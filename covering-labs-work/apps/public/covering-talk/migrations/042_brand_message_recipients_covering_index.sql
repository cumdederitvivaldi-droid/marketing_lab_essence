-- 042_brand_message_recipients_covering_index.sql
-- brand_message_campaign_stats RPC 가 6+초 걸리는 원인 — campaign_id index 만으로는
-- COUNT FILTER 시 heap fetch 발생. 자주 쓰는 컬럼 4개 (sent_at, result_code,
-- converted_at) 를 INCLUDE 컬럼으로 묶어 covering index 로 만들면 index-only scan.

DROP INDEX IF EXISTS idx_brand_message_recipients_campaign_id;

CREATE INDEX IF NOT EXISTS idx_bmr_campaign_stats
  ON brand_message_recipients(campaign_id)
  INCLUDE (sent_at, result_code, converted_at);

ANALYZE brand_message_recipients;
