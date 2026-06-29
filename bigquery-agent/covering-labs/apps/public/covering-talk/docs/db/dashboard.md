# 대시보드 DB 스키마

> 신규 관리자 대시보드(`/new_dashboard`) 전용 테이블.
> 분석·메모·AI 인사이트 캐시·실시간 출석.

## 테이블 한눈

| 테이블 | 용도 | Migration |
|---|---|---|
| `dashboard_settings` | KR 목표값·임계값 등 운영 중 변경 가능한 설정 (key/value JSONB) | 021 |
| `dashboard_notes` | 셀(section + cell_key) 메모/토론 + 해결 플래그 | 022 |
| `dashboard_insights` | Customer Journey Map AI 인사이트 캐시 | 023 |
| `dashboard_p5_reasons` | P5 넛지 이탈 사유 분류 캐시 | 024 |
| `dashboard_churn_reasons` | Phase 2/4/5/8 이탈 사유 분류 캐시 | 025 |
| `dashboard_complaints` | 고객 불만 분류 (pre/post + 2단계 reclassify) | 027~031 |
| `cs_presence_log` | 1분 heartbeat — 상담사 출석 / 근무시간 산출 | 032 |

---

## 1. `dashboard_settings` (m021)

KR 목표값, Health Check 임계값, 하드코딩 값 등 운영 중 조정.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| key | TEXT PK | | (예: `kr1_target`, `churn_window_hours`) |
| value | JSONB NOT NULL | | 숫자/불리언/객체 모두 허용 |
| description | TEXT | | 운영자용 설명 |
| updated_at | TIMESTAMPTZ | now() | 트리거 자동 갱신 |

**시드 키 (m021 INSERT 블록과 동기화):**
- `kr1_target` (300_000_000): KR1 월 매출 목표
- `kr2_target` / `kr2_use_hardcoded` / `kr2_current_hardcoded`: 처리 가능 매출
- `kr3_target` / `kr3_use_hardcoded` / `kr3_current_hardcoded`: 커버링앱 외 트래픽 매출 비중
- `churn_window_hours` (24): Phase 진입 후 N시간 무전이 → 이탈 판정
- `reentry_window_days` (14): 이탈 후 N일 이내 재발화 → 재진입
- `health_no_pickup_threshold` (3.0%) / `health_cancel_threshold` (3.0%) / `health_no_payment_threshold` (2.0%) / `health_complaint_threshold` (5건) / `health_nps_threshold` (60pt)

## 2. `dashboard_notes` (m022)

셀 단위 다중 메모 — 노션 댓글 스타일.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | | |
| section | TEXT NOT NULL | | `journey` / `kr` / `health` / `traffic` |
| cell_key | TEXT NOT NULL | | 셀 식별자 (예: `phase_4:conversion`, `kr1`, `no_pickup`) |
| content | TEXT NOT NULL | | |
| author | TEXT NOT NULL | | |
| resolved | BOOLEAN | FALSE | |
| resolved_by | TEXT | | |
| resolved_at | TIMESTAMPTZ | | |
| created_at / updated_at | TIMESTAMPTZ | now() | |

**인덱스**: `idx_dashboard_notes_cell` (section, cell_key, created_at DESC), `idx_dashboard_notes_unresolved` partial (resolved=false).

**cell_key 컨벤션**:
- Journey Map: `<phase>:<metric>` (예: `phase_4:conversion`, `phase_2:churn_keyword`)
- KR 카드: `<id>` (예: `kr1`, `kr2`, `kr3`)
- Health Check: `<metric>` (예: `no_pickup`, `cancel`, `nps`)
- Traffic: `global`

## 3. `dashboard_insights` (m023)

매 요청마다 Sonnet 호출 비용 줄이기 위해 (period_key + journey_hash) 별 결과 캐싱.

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | UUID PK | | |
| period_key | TEXT NOT NULL | | 예: `thisMonth_2026-04-01_2026-04-24` |
| journey_hash | TEXT NOT NULL | | journeyMap 핵심 데이터 sha256 16자 |
| insight_text | TEXT NOT NULL | | AI 생성 본문 |
| generated_at | TIMESTAMPTZ | now() | |

**제약**: `UNIQUE (period_key, journey_hash)` · **인덱스**: `idx_dashboard_insights_period` (period_key, generated_at DESC).

## 4. `dashboard_p5_reasons` (m024)

P5 (넛지) 단계 이탈 사유 분류 — Haiku on-demand. 대시보드 진입 시 캐시 hit.

컬럼 상세는 [`migrations/024_dashboard_p5_reasons.sql`](../../migrations/024_dashboard_p5_reasons.sql) 참조.

## 5. `dashboard_churn_reasons` (m025)

Phase 2 / 4 / 5 / 8 이탈 사유 분류 — 동일 패턴.

컬럼 상세는 [`migrations/025_dashboard_churn_reasons.sql`](../../migrations/025_dashboard_churn_reasons.sql) 참조.

## 6. `dashboard_complaints` / `complaint_classifications` (m027~031)

고객 불만 사전 분류 캐시. 5번의 점진 마이그레이션:
- m027 — 초기 분류 (`dashboard_complaints` 또는 `complaint_classifications`)
- m028 — `none` 카테고리 추가 (false positive unmark)
- m029 — pre/post 분리 (예약 전 vs 예약 후 불만)
- m030 — 2단계 reclassify (Stage1 strict + Stage2 detail)
- m031 — Stage1 strict reclassify

**Cron**: `cron/classify-complaints` (5분) — 최근 7일 user 메시지 중 미분류만 Haiku 배치 분류 후 UPSERT.

컬럼 상세는 각 migration SQL 참조.

## 7. `cs_presence_log` (m032)

상담사 1분 heartbeat 기록. 운영시간 KST 10–22 내 distinct 분 = 근무시간(분).

| 컬럼 | 타입 | 기본 | 설명 |
|------|------|------|------|
| id | BIGSERIAL PK | | |
| user_name | TEXT NOT NULL | | |
| page | TEXT | | 클라이언트가 보낸 pathname |
| system | TEXT | | `visit` / `lunch` / `channeltalk` / `admin` |
| recorded_at | TIMESTAMPTZ | now() | |

**기록 조건** (클라이언트 측 `useCsRealtimePresence`):
- 운영시간 KST 10–22 내
- `document.visibilityState === "visible"`
- 최근 5분 내 mouse/keyboard/click 활동
- → `/api/cs-realtime/heartbeat` POST (1분 timer)

---

## 관련 마이그레이션

| 번호 | 파일 | 영향 |
|---|---|---|
| 021 | `021_admin_dashboard.sql` | dashboard_settings 신규 + KR/Health 시드 |
| 022 | `022_dashboard_notes.sql` | dashboard_notes |
| 023 | `023_dashboard_insights.sql` | Customer Journey AI 캐시 |
| 024 | `024_dashboard_p5_reasons.sql` | P5 이탈 사유 분류 |
| 025 | `025_dashboard_churn_reasons.sql` | Phase 이탈 사유 분류 |
| 027 | `027_dashboard_complaints.sql` | 불만 분류 초기 |
| 028 | `028_complaint_none_category.sql` | none 카테고리 추가 |
| 029 | `029_complaints_split_pre_post.sql` | pre/post 분리 |
| 030 | `030_complaints_two_stage_reclassify.sql` | 2단계 분류 |
| 031 | `031_complaints_stage1_strict_reclassify.sql` | Stage1 strict |
| 032 | `032_cs_presence_log.sql` | 출석 로그 |
