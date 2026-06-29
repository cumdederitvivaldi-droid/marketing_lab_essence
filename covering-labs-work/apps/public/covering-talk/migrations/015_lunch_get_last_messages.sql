-- 런치 대화별 마지막 메시지 1건 조회 RPC
-- 방문수거 get_last_messages와 동일한 패턴
CREATE OR REPLACE FUNCTION get_lunch_last_messages(session_ids TEXT[])
RETURNS SETOF lunch_messages AS $$
  SELECT DISTINCT ON (session_id) *
  FROM lunch_messages
  WHERE session_id = ANY(session_ids)
  ORDER BY session_id, created_at DESC;
$$ LANGUAGE sql STABLE;
