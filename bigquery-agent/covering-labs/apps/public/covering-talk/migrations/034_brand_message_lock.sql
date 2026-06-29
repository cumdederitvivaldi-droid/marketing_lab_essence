-- 034_brand_message_lock.sql
-- 브랜드메시지 캠페인 동시 발송 lock — send-now / scheduler / resume 의 race condition 방지
--
-- 문제: send-now 가 백그라운드 발송 중일 때 1분 cron 도 동시 진입 → 같은 pending row 두 번 fetch
--   → 같은 msgid 카카오로 두 번 호출 → E109 DuplicatedMsgId 대량 발생
-- 해결: campaign-level atomic lock — 진입 시 UPDATE WHERE NOT in_flight OR stale (>2min)
--   다른 invocation 동시 진입 차단. 비정상 종료 시 2분 후 자동 해제.

ALTER TABLE brand_message_campaigns
  ADD COLUMN IF NOT EXISTS in_flight boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_invocation_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_brand_campaigns_inflight
  ON brand_message_campaigns(in_flight) WHERE in_flight = true;

COMMENT ON COLUMN brand_message_campaigns.in_flight IS
  'send-now / scheduler / resume 진입 시 atomic UPDATE 로 lock — 동시 호출 방지. true = 발송 중, false = 사용 가능';

COMMENT ON COLUMN brand_message_campaigns.last_invocation_at IS
  'in_flight 마지막 갱신 시각 — 매 100건 batch 처리 후 갱신. 2분 이상 stale 이면 비정상 종료로 간주하고 lock 자동 해제';
