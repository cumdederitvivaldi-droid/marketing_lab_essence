-- 039_drop_webhook_debug_log.sql
-- 진단 끝났으니 임시 테이블 정리. m038 에서 추가한 webhook_debug_log 삭제.

DROP TABLE IF EXISTS webhook_debug_log;
