-- 043_prepayment_feature_flag.sql
-- 100% 선결제 정책(§6.1) feature flag. OFF 상태로 배포 후 검증 통과 시 ON.
--   ON: 예약 확정 즉시 NicePay 링크 발송, payment-sync 가 결제완료 시 status=prepaid,
--       방문 12h 전 미결제 → cancelled (auto-cancel cron).
--   OFF: 기존 흐름 그대로 (20시 auto-payment cron → payment_requested → completed).

INSERT INTO app_settings (key, value)
VALUES ('prepayment_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
