-- 런치 대화에 AI 초안 + Phase 필드 추가
ALTER TABLE lunch_conversations ADD COLUMN IF NOT EXISTS ai_draft TEXT;
ALTER TABLE lunch_conversations ADD COLUMN IF NOT EXISTS ai_phase TEXT DEFAULT 'idle';
