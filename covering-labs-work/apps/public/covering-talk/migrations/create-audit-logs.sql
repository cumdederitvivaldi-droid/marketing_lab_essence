-- 수정 이력(Audit Log) 테이블
-- 예약/품목/템플릿/상담 등 주요 변경 사항을 기록

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 대상
  entity_type TEXT NOT NULL,        -- 'booking','product','macro','conversation'
  entity_id TEXT NOT NULL,          -- 해당 레코드 ID

  -- 변경 내용
  action TEXT NOT NULL,             -- 'create','update','delete','status_change'
  changes JSONB NOT NULL DEFAULT '{}',  -- { field: { old, new } }
  description TEXT,                 -- 사람이 읽을 수 있는 요약

  -- 누가
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
