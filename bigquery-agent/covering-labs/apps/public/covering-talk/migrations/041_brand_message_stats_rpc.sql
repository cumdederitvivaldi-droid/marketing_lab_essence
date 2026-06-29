-- 041_brand_message_stats_rpc.sql
-- 캠페인 별 발송/성공/실패/전환 카운트를 한 번의 GROUP BY 로 산출.
--   기존: 캠페인당 5개 count(exact, head) 쿼리 = 50 캠페인 × 5 = 250 쿼리.
--   개선: ANY(campaign_ids) IN-list 1쿼리 → 단일 인덱스 스캔.

CREATE OR REPLACE FUNCTION brand_message_campaign_stats(campaign_ids uuid[])
RETURNS TABLE(
  campaign_id uuid,
  total bigint,
  sent bigint,
  failed bigint,
  pending bigint,
  converted bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    r.campaign_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE r.sent_at IS NOT NULL AND r.result_code IN ('K000', 'M000')) AS sent,
    COUNT(*) FILTER (WHERE r.sent_at IS NOT NULL AND r.result_code IS NOT NULL AND r.result_code NOT IN ('K000', 'M000')) AS failed,
    COUNT(*) FILTER (WHERE r.sent_at IS NULL) AS pending,
    COUNT(*) FILTER (WHERE r.converted_at IS NOT NULL) AS converted
  FROM brand_message_recipients r
  WHERE r.campaign_id = ANY(campaign_ids)
  GROUP BY r.campaign_id;
$$;

-- service_role / authenticated 사용 권한
GRANT EXECUTE ON FUNCTION brand_message_campaign_stats(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION brand_message_campaign_stats(uuid[]) TO authenticated;

-- recipients(campaign_id) 인덱스 — 이미 있으면 무시
CREATE INDEX IF NOT EXISTS idx_brand_message_recipients_campaign_id
  ON brand_message_recipients(campaign_id);
