-- 백오피스 조회 요청 테이블 (Supabase Realtime 브릿지)
-- Vercel ↔ 로컬 Puppeteer 스크래퍼 간 통신용 임시 테이블

CREATE TABLE backoffice_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | error
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- RLS 활성화: service_role만 접근
ALTER TABLE backoffice_requests ENABLE ROW LEVEL SECURITY;

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE backoffice_requests;

-- 인덱스: status로 빠른 조회
CREATE INDEX idx_backoffice_requests_status ON backoffice_requests (status);

-- 인덱스: 오래된 행 cleanup용
CREATE INDEX idx_backoffice_requests_created_at ON backoffice_requests (created_at);
