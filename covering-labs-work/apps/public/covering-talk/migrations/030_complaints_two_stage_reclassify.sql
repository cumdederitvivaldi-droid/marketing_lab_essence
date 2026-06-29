-- 030_complaints_two_stage_reclassify.sql
-- 2단계 분류 도입 — 1차 컴플레인 yes/no, 2차 카테고리.
-- 모델 변경이므로 기존 캐시 무효화하여 재분류 트리거.
TRUNCATE TABLE dashboard_complaints;
