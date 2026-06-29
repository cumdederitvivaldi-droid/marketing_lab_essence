-- 032_cs_presence_log.sql
-- 상담사 온라인(근무) 시간 추적 — 1분 heartbeat 기반 출석 로그.
--
-- 클라이언트(useCsRealtimePresence) 가 운영시간(KST 10–22시) + 활성 상태
-- (5분 이내 활동) + 탭 visible 일 때만 1분마다 INSERT.
-- 오늘 근무시간 = COUNT(DISTINCT 분-단위 bucket) WHERE recorded_at ∈ [오늘 10:00 KST, NOW].
-- (멀티 탭으로 같은 분에 2번 들어와도 distinct 분 카운트라 중복 가산 없음)

CREATE TABLE IF NOT EXISTS cs_presence_log (
  id BIGSERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  page TEXT,
  system TEXT
);

CREATE INDEX IF NOT EXISTS idx_cs_presence_log_user_recorded
  ON cs_presence_log(user_name, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_presence_log_recorded
  ON cs_presence_log(recorded_at DESC);

ALTER TABLE cs_presence_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for cs_presence_log"
  ON cs_presence_log
  FOR ALL USING (true) WITH CHECK (true);
