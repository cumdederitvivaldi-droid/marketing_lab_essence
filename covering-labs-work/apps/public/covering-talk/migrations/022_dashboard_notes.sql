-- ============================================================
-- 관리자 대시보드 — 셀 단위 메모/토론 (노션 댓글 스타일)
--   - 각 셀(섹션 + cell_key) 마다 다중 메모 누적 가능
--   - 작성자/시각/내용 + 해결(resolved) 플래그
-- ============================================================

CREATE TABLE dashboard_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 셀 위치 — section + cell_key 조합으로 유니크하게 식별
  --   예) section='journey', cell_key='phase_4:conversion'
  --       section='kr',      cell_key='kr1'
  --       section='health',  cell_key='no_pickup'
  --       section='traffic', cell_key='global'
  section     TEXT NOT NULL,
  cell_key    TEXT NOT NULL,

  -- 메모 내용
  content     TEXT NOT NULL,
  author      TEXT NOT NULL,                    -- 작성자 이름 (auth session.user.name)

  -- 해결 처리 (스레드 닫기)
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 인덱스 ─────────────────────────────────────
-- 셀별 메모 조회 (대시보드 진입 시 한 번에 모든 셀의 카운트 + 메모 가져오기 위함)
CREATE INDEX idx_dashboard_notes_cell        ON dashboard_notes(section, cell_key, created_at DESC);
CREATE INDEX idx_dashboard_notes_unresolved  ON dashboard_notes(section, cell_key) WHERE resolved = FALSE;
CREATE INDEX idx_dashboard_notes_author      ON dashboard_notes(author);

-- ─── updated_at 자동 갱신 트리거 ────────────────
CREATE OR REPLACE FUNCTION update_dashboard_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dashboard_notes_updated_at
  BEFORE UPDATE ON dashboard_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_dashboard_notes_updated_at();

-- ─── RLS ────────────────────────────────────────
ALTER TABLE dashboard_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for dashboard_notes"
  ON dashboard_notes FOR ALL USING (true) WITH CHECK (true);
