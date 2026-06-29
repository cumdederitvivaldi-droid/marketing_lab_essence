-- 031_complaints_stage1_strict_reclassify.sql
-- Stage 1 프롬프트 강화 — 톤 판단 강조 + 칭찬·정보·정정·취소 명시 false.
-- 모델 변경이므로 기존 캐시 무효화하여 재분류 트리거.
TRUNCATE TABLE dashboard_complaints;
