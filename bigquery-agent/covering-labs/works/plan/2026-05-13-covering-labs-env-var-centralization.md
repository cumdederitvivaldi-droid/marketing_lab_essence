# 환경변수 중앙화 및 누락 변수 수정 플랜

> 유형: 플랜
> 작성일: 2026-05-13
> 상태: 완료

## 목표

covering-labs 전체 앱의 환경변수를 점검하고, API 키·공통 변수를 `/shared/.env`에서 중앙 관리하며, 누락된 환경변수로 인한 장애를 해소한다.

---

## 현황 분석 (2026-05-13 기준)

### VM 상태 요약 (작업 완료 후)

| VM | `/shared/.env` 키 수 | 앱별 `.env` |
|---|---|---|
| private (covering-labs-instance) | 23개 (+GCP_PROJECT, AIRBRIDGE_APP, AIRBRIDGE_TOKEN) | 없음 (모두 shared.env 의존) |
| public (covering-labs-public) | 34개 (+30개 공통 API 키) | covering-invite, covering-talk(.env.local 신규 생성) |

### 🔴 Critical 장애 현황 (해소 결과)

#### 1. airbridge-ads-cost-sync — AIRBRIDGE_TOKEN 누락 ✅ 해소
- **조치**: covering-invite `.env`에서 값 확인 후 private `/shared/.env`에 `AIRBRIDGE_TOKEN=0dd7b240...` 추가
- **결과**: 다음 실행(09:45)부터 정상 동작 예상

#### 2. covering-spot (chatbot) — .env 파일 완전 부재 ⚠️ 부분 해소
- **조치**: 공통 API 키 30개를 public `/shared/.env`에 추가 (ANTHROPIC_API_KEY, NICEPAY_*, CHANNELTALK_ACCESS_KEY/SECRET, HT_*, KAKAO_*, BOLTA_*, SWEETTRACKER_*, DHERO_API_URL, GOOGLE_OAuth/Sheets, COVERING_SUPABASE_*)
- **미해결**: covering-spot 앱별 vars(SUPABASE_URL, JWT_SECRET, CHANNELTALK_APP_ID, DHERO_TOKEN/SPOT_CODE, SENDER_KEY, CRON_SECRET 등) 값을 아직 미파악 → 사용자 확인 필요

#### 3. covering-talk — .env 파일 없음 ✅ 해소
- **조치**: `/shared/apps/covering-talk/.env.local` 신규 생성 (사용자 제공 env.local 기반, 20개 앱별 vars)
- **결과**: covering-talk 리빌드 후 정상 동작 예상

### 🟡 코드 개선 필요

#### BIGQUERY_PROJECT_ID → GCP_PROJECT 중복 제거
- `covering-invite-batch/src/config.py:24`: `os.environ.get("BIGQUERY_PROJECT_ID", "covering-app-ccd23")`
- 나머지 앱들은 `GCP_PROJECT`를 하드코딩(`covering-app-ccd23`)
- → `GCP_PROJECT` 환경변수로 통일, private `/shared/.env`에 추가

---

## 작업 범위 결정 기준

| 조건 | 처리 방법 |
|---|---|
| 여러 앱이 동일 값 사용 | `/shared/.env` 공통 등록 |
| 앱 전용이지만 secret 성격 | 해당 앱 디렉토리 `.env` 관리 |
| 스프레드시트 ID, 앱별 채널 ID 등 | 각 앱에서 개별 관리 (변경 없음) |
| NEXT_PUBLIC_* | Next.js 빌드 시점 필요 → 앱 `.env`에 유지 |

---

## 구현 계획

### Phase 1 — 코드 변경 ✅ 완료

- [x] `covering-invite-batch/src/config.py`: `BIGQUERY_PROJECT_ID` → `GCP_PROJECT`
- [x] `apps/AGENTS.md`: 누락 환경변수 레지스트리 추가 + 서비스 재사용 가이드 추가 + public VM 공통 변수 섹션 + covering-talk 전용 섹션
- [x] `apps/CLAUDE.md`: apps/AGENTS.md와 동기화

### Phase 2 — Private VM `/shared/.env` 추가 ✅ 완료

- [x] `GCP_PROJECT=covering-app-ccd23`
- [x] `AIRBRIDGE_APP=coveringprod`
- [x] `AIRBRIDGE_TOKEN=[REDACTED]` (covering-invite/.env에서 확인)

### Phase 3 — Public VM 환경변수 설정 ✅ 부분 완료

| 변수 | 위치 | 상태 |
|---|---|---|
| 30개 공통 API 키 | public `/shared/.env` | ✅ 추가 완료 |
| covering-talk 전체 env (20개) | `/shared/apps/covering-talk/.env.local` | ✅ 생성 완료 (사용자 제공 기반) |
| covering-spot 앱별 vars | `/shared/apps/covering-spot/.env` | ⚠️ 미완료 — SUPABASE_URL/KEY/SERVICE_ROLE_KEY, JWT_SECRET, CHANNELTALK_APP_ID/APP_SECRET/DESK_COOKIE, DHERO_TOKEN, DHERO_SPOT_CODE, SENDER_KEY, CRON_SECRET 등 사용자 확인 필요 |

### Phase 4 — PR 생성 ⏳ 대기 중

코드 변경 사항 PR 생성 예정

---

## 완료 기준

- [x] `airbridge-ads-cost-sync` 장애 해소 (AIRBRIDGE_TOKEN 추가 완료, 다음 실행 확인 예정)
- [ ] `covering-spot` 재시작 없이 안정 동작 (앱별 env 미완료)
- [x] `covering-talk` `.env.local` 생성 완료, 리빌드 후 정상 동작
- [x] `covering-invite-batch` `GCP_PROJECT` 환경변수 사용
- [x] `apps/AGENTS.md` 레지스트리 완전 업데이트
- [x] 서비스 재사용 가이드 문서화
- [ ] PR 생성 완료

---

## ⚠️ 절대 금지 사항

- 기존 동작 중인 환경변수 키 이름 변경 (배포 없이 즉시 장애)
- `/shared/.env` 파일 덮어쓰기 (append만 허용)
- 값 모르는 상태로 빈 값 추가 (앱 기능 파괴)
