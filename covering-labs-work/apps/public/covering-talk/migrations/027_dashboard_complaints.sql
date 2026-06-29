-- 027_dashboard_complaints.sql
-- 고객 불만(컴플레인) 분류 캐시 — 예약 확정 후 user 메시지 중 컴플레인성 발화를 카테고리로 분류.
--
-- 모집단:
--   orders.status IN ('confirmed', 'payment_requested', 'completed')   ← cancelled 제외
--   AND messages 중 booking confirm 메시지 (role='assistant' + content includes 시그니처) 이후 user 메시지
--   AND length(content) > 5
--
-- 카테고리 7종: 파손훼손 / 일정변경 / 누락실수 / 가격추가비용 / 응대태도 / 결제문제 / 기타
-- 캐시 키: (session_id, message_id) — 같은 메시지 재분류 안 함, period 변경에도 캐시 재사용

CREATE TABLE IF NOT EXISTS dashboard_complaints (
  session_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  message_content TEXT NOT NULL,
  message_created_at TIMESTAMPTZ NOT NULL,
  booking_confirmed_at TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('파손훼손', '일정변경', '누락실수', '가격추가비용', '응대태도', '결제문제', '기타')),
  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (session_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_complaints_category
  ON dashboard_complaints (category, message_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dashboard_complaints_created
  ON dashboard_complaints (message_created_at DESC);

ALTER TABLE dashboard_complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for dashboard_complaints"
  ON dashboard_complaints FOR ALL USING (true) WITH CHECK (true);
