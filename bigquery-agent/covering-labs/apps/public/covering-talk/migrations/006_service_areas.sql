-- 006: 서비스 지역 테이블
-- CSV 원본: "커버링 B2C 서비스 지역 - 서비스지역 (26.2.10 Update).csv"

CREATE TABLE IF NOT EXISTS service_areas (
  id SERIAL PRIMARY KEY,
  province TEXT NOT NULL,           -- 도/광역시/특별시 (예: 서울 특별시, 경기도)
  city TEXT NOT NULL,               -- 시/구 (예: 전지역, 군포시, 남동구)
  pickup_days TEXT NOT NULL,        -- 수거 요일 (예: 월 화 수 목 금 토 일)
  unavailable_dongs TEXT DEFAULT '', -- 수거 불가능 행정동 (콤마 구분)
  available_dongs TEXT DEFAULT '',   -- 수거 가능 행정동 (콤마 구분, "전 지역" 가능)
  note TEXT DEFAULT '',              -- 기타 메모
  opened_at TEXT DEFAULT '',         -- 지역 오픈일
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 검색용 인덱스
CREATE INDEX IF NOT EXISTS idx_service_areas_province_city ON service_areas (province, city);
CREATE INDEX IF NOT EXISTS idx_service_areas_active ON service_areas (is_active) WHERE is_active = true;
