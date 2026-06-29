-- 028_complaint_none_category.sql
-- 컴플레인 분류 — 'none' (비컴플레인) 카테고리 추가 + 기존 캐시 TRUNCATE (프롬프트 강화로 재분류 필요)
--
-- 027 기준 결과: 파손훼손/누락실수만 진짜 컴플레인이고 일정변경·가격·결제·기타는
-- 사실상 단순 문의/감사/후속 대화. 프롬프트를 엄격화 후 기존 캐시는 무효화.

ALTER TABLE dashboard_complaints
  DROP CONSTRAINT IF EXISTS dashboard_complaints_category_check;

ALTER TABLE dashboard_complaints
  ADD CONSTRAINT dashboard_complaints_category_check
  CHECK (category IN ('파손훼손', '일정변경', '누락실수', '가격추가비용', '응대태도', '결제문제', '기타', 'none'));

-- 기존 캐시 무효화 — 새 프롬프트로 재분류 트리거
TRUNCATE TABLE dashboard_complaints;
