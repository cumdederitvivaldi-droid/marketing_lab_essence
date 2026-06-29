-- 백오피스 주문 상세 스크래핑 지원 (실패 사유, 방문 이미지 등)
ALTER TABLE backoffice_requests ADD COLUMN request_type TEXT NOT NULL DEFAULT 'user_lookup';
ALTER TABLE backoffice_requests ADD COLUMN url TEXT;
ALTER TABLE backoffice_requests ALTER COLUMN phone DROP NOT NULL;
