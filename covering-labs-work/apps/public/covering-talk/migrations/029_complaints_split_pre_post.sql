-- 029_complaints_split_pre_post.sql
-- 예약 확정 후 / 예약 전 두 모드로 분리.
-- 모집단 기준 단순화 — orders.status / booking confirm 시그니처 매칭 제거.
-- 이름 등록 여부(conversations.name) 만으로 'post' / 'pre' 분기.
--
-- 'pre' 메시지는 예약 확정 시각이 없으므로 booking_confirmed_at NULL 허용.
-- 기존 캐시는 모집단 정의가 바뀌었으므로 무효화.

ALTER TABLE dashboard_complaints
  ALTER COLUMN booking_confirmed_at DROP NOT NULL;

TRUNCATE TABLE dashboard_complaints;
