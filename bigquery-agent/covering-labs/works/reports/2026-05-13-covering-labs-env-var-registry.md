> 유형: 분석
> 작성일: 2026-05-13
> 상태: 초안

# covering-labs 환경변수 전체 레지스트리

covering-labs 전체 앱(34개)에서 사용하는 환경변수 키를 전수 조사하여 저장 위치별로 정리한 문서입니다.
value는 포함하지 않으며, 신규 앱 개발 시 중복 방지와 재사용 판단 용도로 사용합니다.

---

## 저장 위치 요약

| 위치 | 설명 | 해당 앱 |
|---|---|---|
| `/shared/.env` (공통) | 여러 앱이 동일 값 공유 | vehicle-dispatch-monitor, large-bag-delivery-batch, flarelane-d7-retention |
| `/shared/.env` (앱별) | 각 앱 전용이지만 shared.env에 저장 | 나머지 대부분의 앱 |
| `/shared/apps/covering-spot-chatbot/.env` | SLACK_BOT_TOKEN 등 값 충돌 방지용 격리 | covering-spot-chatbot |
| 레지스트리 미등록 | 코드 스캔에서 발견, AGENTS.md에 미등록 | aarrr-data-slack-report, yagan-* 등 |

---

## 1. `/shared/.env` — 공통 변수 (여러 앱이 동일 값 공유)

> 값이 동일하며 한 번만 관리. 배포 스크립트(`deploy-app.sh`)가 실행 시 자동 source.

| 변수명 | 용도 | 사용 앱 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covani-pickup 봇 토큰 (채널 메시지·DM·파일 업로드) | vehicle-dispatch-monitor, large-bag-delivery-batch |
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 ID | flarelane-d7-retention, covering-invite-batch, d7-crm-monitoring, flarelane-d7-retention-monitor, flarelane-live-monitoring |
| `FLARELANE_API_KEY` | FlareLane API 키 (이벤트 트래킹용) | flarelane-d7-retention, covering-invite-batch, d7-crm-monitoring |

---

## 2. `/shared/.env` — 앱별 변수 (개별 값, 공유 파일에 저장)

> 앱마다 값이 다르거나 해당 앱 전용. 모두 `/shared/.env` 한 파일에 저장됨.

### vehicle-dispatch-monitor

| 변수명 | 용도 |
|---|---|
| `ALLOWED_HOST` | GCP VM 호스트명 — 타머신 중복 실행 방지 |
| `CHANNELTALK_ACCESS_KEY` | 채널톡 Open API 키 |
| `CHANNELTALK_ACCESS_SECRET` | 채널톡 Open API 시크릿 |
| `CHANNELTALK_TARGET_TAG` | 감지할 채널톡 태그명 (기본값: `차량등록`) |
| `BACKOFFICE_EMAIL` | 백오피스 자동 로그인 이메일 |
| `BACKOFFICE_PASSWORD` | 백오피스 자동 로그인 비밀번호 |
| `BACKOFFICE_ACCESS_TOKEN` | 백오피스 수동 토큰 (자동 로그인 대신 사용 시) |
| `BACKOFFICE_ORDER_API_VERSION` | 주문 조회 API 버전 (기본값: `v3`) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | 차량배차 감시 목록 시트 ID |
| `GOOGLE_SHEETS_KEY_FILE` | Google Sheets 서비스 계정 키 파일 경로 |
| `GOOGLE_SHEETS_WORKSHEET_NAME` | 시트 이름 (기본값: `시트1`) |
| `SLACK_CHANNEL` | 차량배차 알림 채널 (기본값: `#제품팀_cs_notifications`) |
| `SLACK_CX_TEAM_ID` | CX 팀 Slack 그룹 ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google 서비스 계정 JSON 경로 (레거시) |

### large-bag-delivery-batch

| 변수명 | 용도 |
|---|---|
| `DHERO_BASE_URL` | 두발히어로 API Base URL |
| `DHERO_TOKEN` | 두발히어로 Bearer 토큰 |
| `DHERO_SPOT_CODE` | 두발히어로 스팟 코드 |
| `DHERO_SPREADSHEET_ID` | 150L 봉투 배송 Google Sheets ID |
| `DHERO_SHEET_GID` | 배송 시트 GID |
| `SLACK_CHANNEL_ID` | 150L 배송 결과 알림 채널 ID |
| `SLACK_DM_USER_IDS` | DM 수신 유저 ID 목록 (콤마 구분) |
| `SLACK_UNSUPPORTED_MENTION_USER_ID` | 배송불가 알림 멘션 대상 유저 ID |

### flarelane-governance-sync

| 변수명 | 용도 |
|---|---|
| `FLARELANE_GOVERNANCE_SLACK_TOKEN` | FlareLane 거버넌스 알림용 Slack 봇 토큰 (`커바니_동생`) |
| `FLARELANE_GOVERNANCE_SLACK_CHANNEL` | FlareLane 거버넌스 알림 채널 ID (기본값: `#제품팀_프로덕트랩스`) |
| `GCP_PROJECT` | GCP 프로젝트 ID |

### flarelane-live-monitoring

| 변수명 | 용도 |
|---|---|
| `FLARELANE_BEARER` | FlareLane API Bearer 토큰 |
| `FLARELANE_CONSOLE_BEARER` | FlareLane 콘솔 Bearer 토큰 |
| `FLARELANE_LIVE_BEARER` | FlareLane 라이브 Bearer 토큰 |
| `FLARELANE_MONITOR_SLACK_CHANNEL` | FlareLane 모니터링 알림 채널 |
| `PRODUCT_LABS_SLACK_CHANNEL` | 제품팀 프로덕트랩스 채널 |

### flarelane-d7-retention-monitor

| 변수명 | 용도 |
|---|---|
| `ENG1559_FLARELANE_CONSOLE_BEARER` | FlareLane 콘솔 Bearer (ENG-1559 전용) |
| `ENG1559_MONITOR_SLACK_CHANNEL` | ENG-1559 모니터링 알림 채널 |
| `BQ_BIN` | BigQuery 실행 바이너리 경로 |

### covering-invite

| 변수명 | 용도 |
|---|---|
| `NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY` | 카카오 JS SDK 초기화 |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel 이벤트 트래킹 초기화 |
| `AIRBRIDGE_TOKEN` | Airbridge 트래킹 링크 API 인증 (서버사이드) |
| `AIRBRIDGE_APP` | Airbridge 앱 식별자 |

### covering-invite-batch

| 변수명 | 용도 |
|---|---|
| `BIGQUERY_PROJECT_ID` | BigQuery 프로젝트 ID |
| `INVITE_SLACK_CHANNEL_ID` | 친구초대 배치 결과 알림 채널 ID (기본값: `C0ARXKB2Y9L`) |

### event-dictionary

| 변수명 | 용도 |
|---|---|
| `EVENT_DICTIONARY_SHEET_ID` | 이벤트 딕셔너리 Google Sheet ID override |
| `EVENT_DICTIONARY_SHEET_GID` | 이벤트 딕셔너리 worksheet GID override (기본값: `1531837284`) |
| `EVENT_DICTIONARY_BQ_PROJECT` | 이벤트 발화 수 조회 BigQuery project override |
| `EVENT_DICTIONARY_BQ_TABLE` | 이벤트 발화 수 조회 BigQuery table override |
| `GOOGLE_APPLICATION_CREDENTIALS` | Google Sheets 읽기용 서비스 계정 JSON 경로 (로컬/레거시 전용) |
| `GOOGLE_APPLICATION_CREDENTIALS_BQ` | BigQuery 조회용 서비스 계정 JSON 경로 (로컬/레거시 전용) |

### disposal-guide

| 변수명 | 용도 |
|---|---|
| `NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL` | 유해물질 안내 시트 CSV URL |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel 이벤트 트래킹 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 측 Supabase 익명 키 |
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 측 Supabase URL |
| `SUPABASE_ANON_KEY` | 서버 측 Supabase 익명 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 service role (RLS 우회) |
| `SUPABASE_URL` | 서버 측 Supabase URL |

### large-coveringbag-order / request-large-covering-bag

| 변수명 | 용도 |
|---|---|
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel 이벤트 트래킹 |

---

## 3. `/shared/apps/covering-spot-chatbot/.env` — 격리 변수

> `/shared/.env` 내 동명 변수(`SLACK_BOT_TOKEN`, `DHERO_TOKEN`, `DHERO_SPOT_CODE`)와 **값이 다른 봇·다른 spot**이므로 격리 주입.
> covering-spot-chatbot 전용. 키 카탈로그 단일 원천: `.env.example`.

### 인증 / 보안

| 변수명 | 용도 |
|---|---|
| `JWT_SECRET` | 세션 토큰 서명용 (32자+, 변경 시 전체 재로그인) |
| `CRON_SECRET` | `/api/cron/*` 호출 인증 (`x-cron-secret` 헤더 검증) |
| `NODE_ENV` | 런타임 환경 |

### Supabase

| 변수명 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 측 자체 Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 브라우저 측 익명 키 |
| `SUPABASE_URL` | 서버 측 Supabase URL |
| `SUPABASE_ANON_KEY` | 서버 측 익명 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 측 service role (RLS 우회) |
| `COVERING_SUPABASE_URL` | 외부 covering DB URL (sendToCovering 단방향 동기화) |
| `COVERING_SUPABASE_KEY` | 외부 covering DB service role 키 |

### AI / LLM

| 변수명 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API (Sonnet 메인 + Haiku 톤·분류·커바니) |
| `OPENAI_API_KEY` | ChatGPT (응급용 — `ai_provider="openai"` 시 활성) |
| `VOYAGE_AI_API_KEY` | 임베딩 (voyage-2 한국어, 채널톡 RAG) |

### 해피톡 (방문수거)

| 변수명 | 용도 |
|---|---|
| `HAPPYTALK_API_HOST` | 해피톡 API 호스트 |
| `HT_CLIENT_ID` | 방문수거 클라이언트 ID |
| `HT_CLIENT_SECRET` | 방문수거 클라이언트 시크릿 |
| `SENDER_KEY` | 방문수거 카카오 채널 sender key |

### 해피톡 (런치)

| 변수명 | 용도 |
|---|---|
| `LUNCH_HAPPYTALK_API_HOST` | 해피톡 API 호스트 (런치) |
| `LUNCH_HT_CLIENT_ID` | 런치 클라이언트 ID (방문과 동일 값) |
| `LUNCH_HT_CLIENT_SECRET` | 런치 클라이언트 시크릿 (방문과 동일 값) |
| `LUNCH_SENDER_KEY` | 런치 전용 sender key (2026-04-17 운영 전환) |

### 채널톡

| 변수명 | 용도 |
|---|---|
| `CHANNELTALK_APP_ID` | Native Functions 앱 ID |
| `CHANNELTALK_APP_SECRET` | 앱 시크릿 |
| `CHANNELTALK_ACCESS_KEY` | Open API 액세스 키 |
| `CHANNELTALK_ACCESS_SECRET` | Open API 시크릿 |
| `CHANNELTALK_DESK_COOKIE` | Desk API (메시지 삭제) — **30일 로테이션 필수** |

### 카카오 / 결제 / Google

| 변수명 | 용도 |
|---|---|
| `KAKAO_REST_API_KEY` | 카카오 Local API 주소 정규화 |
| `NICEPAY_MID` | NicePay 가맹점 MID (방문/런치 공유) |
| `NICEPAY_MERCHANT_KEY` | NicePay 머천트 키 |
| `NICEPAY_USR_ID` | NicePay USER ID |
| `GOOGLE_CLIENT_ID` | Google OAuth 로그인 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 로그인 시크릿 |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Sheets API service account 이메일 |
| `GOOGLE_PRIVATE_KEY` | Sheets API service account private key (multiline) |
| `GOOGLE_SHEET_ID` | 단건_수거 + 단건_정산 시트 ID |
| `GOOGLE_SHEET_GID` | 특정 탭 GID (선택) |

### Bolta (전자세금계산서 · 런치 전용)

| 변수명 | 용도 |
|---|---|
| `BOLTA_API_KEY` | Bolta 전자세금계산서 API 키 |
| `BOLTA_CUSTOMER_KEY` | Bolta 고객 키 (우리=공급자) |
| `BOLTA_SUPPLIER_BIZ_NUMBER` | 공급자 사업자번호 |
| `BOLTA_SUPPLIER_NAME` | 공급자명 |
| `BOLTA_SUPPLIER_REP_NAME` | 공급자 대표자명 |
| `BOLTA_SUPPLIER_EMAIL` | 공급자 이메일 |

### Dhero 배송 (방문 전용, `/shared/.env`의 DHERO_*와 다른 spot)

| 변수명 | 용도 |
|---|---|
| `DHERO_API_URL` | 두발히어로 API URL |
| `DHERO_TOKEN` | Bearer 토큰 (covering-spot-chatbot 전용 spot) |
| `DHERO_SPOT_CODE` | spot 코드 (다른 앱과 다른 spot) |
| `DHERO_DEV_API_URL` | dev 환경 URL (선택) |
| `DHERO_DEV_TOKEN` | dev 토큰 (선택) |

### Slack / 스윗트래커

| 변수명 | 용도 |
|---|---|
| `SLACK_BOT_TOKEN` | 봇 토큰 (covering-spot-chatbot 전용 봇, `/shared/.env`와 다른 값) |
| `SLACK_PICKUP_CHANNEL_ID` | 방문 익일 브리핑 채널 ID (fallback `C0AENH7JW2Y`) |
| `SWEETTRACKER_PROFILE_KEY` | 스윗트래커 비즈메시지 프로필 키 (실험실 전용) |
| `SWEETTRACKER_USERID` | 스윗트래커 USER ID |

---

## 4. 레지스트리 미등록 변수 (코드 스캔 발견)

> `apps/AGENTS.md` 레지스트리에 등록되지 않았지만 실제 코드에서 사용 중인 변수들.
> 신규 앱 개발 시 이 변수들도 참고하고, 필요 시 레지스트리에 등록 권장.

### 여러 앱 공통 사용 (공통 변수 승격 검토 필요)

| 변수명 | 사용 앱 | 비고 |
|---|---|---|
| `SLACK_BOT_TOKEN` | aarrr-data-slack-report, auth-verification-monitor, covering-invite-batch, flarelane-d7-retention-monitor, flarelane-live-monitoring, growth-roi-slack-monitor, new-region-weekly-monitor, voc-monitor, yagan-* (5개) | 공식 등록은 vehicle-dispatch-monitor·large-bag-delivery-batch만. 실제 사용은 훨씬 광범위 |
| `GCP_PROJECT` | ai-productivity-scan-batch, airbridge-ads-cost-sync, d7-crm-monitoring, flarelane-governance-sync | BigQuery/GCS 접근 시 공통 필요 |
| `BQ_LOCATION` | ai-productivity-scan-batch, airbridge-ads-cost-sync | BigQuery 리전 설정 |
| `BQ_STREAMING_BUFFER_RETRIES` | ai-productivity-scan-batch, airbridge-ads-cost-sync | BQ 스트리밍 재시도 횟수 |
| `BQ_STREAMING_BUFFER_SLEEP_SECONDS` | ai-productivity-scan-batch, airbridge-ads-cost-sync | BQ 스트리밍 재시도 대기 시간 |
| `MIN_SIGNUP_DATE` | ai-productivity-scan-batch, airbridge-ads-cost-sync | 최소 가입일 필터 기준 |
| `GEMINI_API_KEY` | ai-productivity-scan-batch, voc-monitor | Gemini AI API |
| `BQ_BIN` | auth-verification-monitor, flarelane-d7-retention-monitor, new-region-weekly-monitor | BigQuery CLI 바이너리 경로 |

### 앱별 단독 사용 (미등록)

| 변수명 | 사용 앱 | 용도 |
|---|---|---|
| `AARRR_REPORT_SLACK_CHANNEL` | aarrr-data-slack-report | AARRR 리포트 알림 채널 |
| `AARRR_REPORT_STATE_FILE` | aarrr-data-slack-report | 상태 파일 경로 |
| `AI_PRODUCTIVITY_APPROVER` | ai-productivity-scan-batch | 승인자 Slack ID |
| `AI_PRODUCTIVITY_CHANNEL_ID` | ai-productivity-scan-batch | 결과 알림 채널 ID |
| `AI_PRODUCTIVITY_CHANNEL_NAME` | ai-productivity-scan-batch | 결과 알림 채널명 |
| `AIRBRIDGE_APP` | airbridge-ads-cost-sync | Airbridge 앱 식별자 |
| `AUTH_VERIFICATION_MONITOR_LOOKBACK_DAYS` | auth-verification-monitor | 인증 모니터링 조회 기간 |
| `AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL` | auth-verification-monitor | 인증 모니터링 알림 채널 |
| `D7CRM_BQ_DATASET` | d7-crm-monitoring | CRM BigQuery 데이터셋 |
| `D7CRM_PROMO_END` | d7-crm-monitoring | CRM 프로모션 종료일 |
| `D7CRM_PROMO_START` | d7-crm-monitoring | CRM 프로모션 시작일 |
| `ENG1559_FLARELANE_CONSOLE_BEARER` | flarelane-d7-retention-monitor | ENG-1559 이슈 전용 Bearer |
| `ENG1559_MONITOR_SLACK_CHANNEL` | flarelane-d7-retention-monitor | ENG-1559 모니터링 채널 |
| `FLARELANE_BEARER` | flarelane-live-monitoring | FlareLane API Bearer |
| `FLARELANE_CONSOLE_BEARER` | flarelane-live-monitoring | FlareLane 콘솔 Bearer |
| `FLARELANE_LIVE_BEARER` | flarelane-live-monitoring | FlareLane 라이브 Bearer |
| `FLARELANE_MONITOR_SLACK_CHANNEL` | flarelane-live-monitoring | 라이브 모니터링 알림 채널 |
| `PRODUCT_LABS_SLACK_CHANNEL` | flarelane-live-monitoring | 제품팀 프로덕트랩스 채널 |
| `GROWTH_ROI_MONITOR_SLACK_CHANNEL` | growth-roi-slack-monitor | ROI 모니터링 알림 채널 |
| `GROWTH_ROI_MONITOR_STATE_FILE` | growth-roi-slack-monitor | 상태 파일 경로 |
| `NEW_REGION_DASHBOARD_URL` | new-region-weekly-monitor | 신규 지역 대시보드 URL |
| `NEW_REGION_THREAD_STATE_FILE` | new-region-weekly-monitor | 스레드 상태 파일 경로 |
| `NEW_REGION_WEEKLY_MONITOR_THREAD_TS` | new-region-weekly-monitor | Slack 스레드 타임스탬프 |
| `VOC_TARGET_CHANNEL` | voc-monitor | VOC 수집 채널 ID |
| `YAGAN_SUGEO_SLACK_CHANNEL` | yagan-large-bag-daily-report, yagan-large-bag-report, yagan-rider-alert, yagan-rider-gap-alert, yagan-sugeo-report | 야간 수거 알림 채널 (5개 앱 공유) |

---

## 전체 고유 키 목록 (124개)

```
AARRR_REPORT_SLACK_CHANNEL
AARRR_REPORT_STATE_FILE
AI_PRODUCTIVITY_APPROVER
AI_PRODUCTIVITY_CHANNEL_ID
AI_PRODUCTIVITY_CHANNEL_NAME
AIRBRIDGE_APP
AIRBRIDGE_TOKEN
ALLOWED_HOST
ANTHROPIC_API_KEY
AUTH_VERIFICATION_MONITOR_LOOKBACK_DAYS
AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL
BACKOFFICE_ACCESS_TOKEN
BACKOFFICE_EMAIL
BACKOFFICE_ORDER_API_VERSION
BACKOFFICE_PASSWORD
BIGQUERY_PROJECT_ID
BOLTA_API_KEY
BOLTA_CUSTOMER_KEY
BOLTA_SUPPLIER_BIZ_NUMBER
BOLTA_SUPPLIER_EMAIL
BOLTA_SUPPLIER_NAME
BOLTA_SUPPLIER_PHONE
BOLTA_SUPPLIER_REP_NAME
BQ_BIN
BQ_LOCATION
BQ_STREAMING_BUFFER_RETRIES
BQ_STREAMING_BUFFER_SLEEP_SECONDS
CHANNELTALK_ACCESS_KEY
CHANNELTALK_ACCESS_SECRET
CHANNELTALK_APP_ID
CHANNELTALK_APP_SECRET
CHANNELTALK_DESK_COOKIE
CHANNELTALK_TARGET_TAG
COVERING_SUPABASE_KEY
COVERING_SUPABASE_URL
CRON_SECRET
D7CRM_BQ_DATASET
D7CRM_PROMO_END
D7CRM_PROMO_START
DHERO_API_URL
DHERO_BASE_URL
DHERO_DEV_API_URL
DHERO_DEV_TOKEN
DHERO_SHEET_GID
DHERO_SPOT_CODE
DHERO_SPREADSHEET_ID
DHERO_TOKEN
ENG1559_FLARELANE_CONSOLE_BEARER
ENG1559_MONITOR_SLACK_CHANNEL
ENV_FILE
EVENT_DICTIONARY_BQ_PROJECT
EVENT_DICTIONARY_BQ_TABLE
EVENT_DICTIONARY_SHEET_GID
EVENT_DICTIONARY_SHEET_ID
FLARELANE_API_KEY
FLARELANE_BEARER
FLARELANE_CONSOLE_BEARER
FLARELANE_GOVERNANCE_SLACK_CHANNEL
FLARELANE_GOVERNANCE_SLACK_TOKEN
FLARELANE_LIVE_BEARER
FLARELANE_MONITOR_SLACK_CHANNEL
FLARELANE_PROJECT_ID
GCP_PROJECT
GEMINI_API_KEY
GOOGLE_APPLICATION_CREDENTIALS
GOOGLE_APPLICATION_CREDENTIALS_BQ
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_PRIVATE_KEY
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_SHEET_GID
GOOGLE_SHEET_ID
GOOGLE_SHEETS_KEY_FILE
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SHEETS_WORKSHEET_NAME
GROWTH_ROI_MONITOR_SLACK_CHANNEL
GROWTH_ROI_MONITOR_STATE_FILE
HAPPYTALK_API_HOST
HT_CLIENT_ID
HT_CLIENT_SECRET
INVITE_SLACK_CHANNEL_ID
JWT_SECRET
KAKAO_REST_API_KEY
LUNCH_HAPPYTALK_API_HOST
LUNCH_HT_CLIENT_ID
LUNCH_HT_CLIENT_SECRET
LUNCH_SENDER_KEY
MIN_SIGNUP_DATE
NEW_REGION_DASHBOARD_URL
NEW_REGION_THREAD_STATE_FILE
NEW_REGION_WEEKLY_MONITOR_THREAD_TS
NEXT_PUBLIC_BASE_URL
NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY
NEXT_PUBLIC_KAKAO_MAP_KEY
NEXT_PUBLIC_MIXPANEL_TOKEN
NEXT_PUBLIC_PROMO_TRIP_FEE_CAP
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_URL
NICEPAY_MERCHANT_KEY
NICEPAY_MID
NICEPAY_USR_ID
NODE_ENV
OPENAI_API_KEY
PRODUCT_LABS_SLACK_CHANNEL
PROMO_TRIP_FEE_CAP
SENDER_KEY
SEND_MODE
SLACK_BOT_TOKEN
SLACK_CHANNEL
SLACK_CHANNEL_ID
SLACK_CX_TEAM_ID
SLACK_DM_USER_IDS
SLACK_PICKUP_CHANNEL_ID
SLACK_UNSUPPORTED_MENTION_USER_ID
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
SWEETTRACKER_PROFILE_KEY
SWEETTRACKER_USERID
VOC_TARGET_CHANNEL
VOYAGE_AI_API_KEY
YAGAN_SUGEO_SLACK_CHANNEL
```

---

## 주요 발견 사항

### 1. 레지스트리 등록 실태
- 공식 등록 변수: **약 50개** (AGENTS.md 레지스트리 기준)
- 코드 스캔 발견 미등록: **약 74개**
- 실제 운영 중인 변수가 레지스트리 미등록 비율이 높음

### 2. SLACK_BOT_TOKEN 다중 사용 주의
- 레지스트리에는 vehicle-dispatch-monitor, large-bag-delivery-batch만 등록
- 실제로는 15개 이상 앱에서 동일 키 참조
- `/shared/.env`는 단일 값이므로 **모든 앱이 동일 봇 토큰 공유 중**
- covering-spot-chatbot만 명시적 격리 (`/shared/apps/covering-spot-chatbot/.env`)
- yagan-* 5개 앱도 SLACK_BOT_TOKEN 사용 중이나 격리 여부 불명확

### 3. YAGAN_SUGEO_SLACK_CHANNEL 공통 패턴
- yagan-large-bag-daily-report, yagan-large-bag-report, yagan-rider-alert, yagan-rider-gap-alert, yagan-sugeo-report가 동일 변수 공유
- 공식 공통 변수로 등록 필요

### 4. BQ/GCP 변수 공통화 필요
- GCP_PROJECT, BQ_LOCATION, BQ_STREAMING_BUFFER_*, MIN_SIGNUP_DATE가 여러 batch 앱에서 동일하게 사용되나 미등록

---

## 중복 및 충돌 분석

### [충돌 위험] 같은 키, 다른 앱이 서로 다른 값을 기대하는 경우

> `/shared/.env`는 단일 파일이므로 같은 키에 값이 하나뿐. 두 앱이 서로 다른 값을 기대하면 한 쪽이 잘못된 값을 읽음.

| 변수명 | 충돌 앱 | 상황 | 조치 필요 |
|---|---|---|---|
| `CHANNELTALK_ACCESS_KEY` | vehicle-dispatch-monitor, covering-spot-chatbot | 차량배차용 Open API 키 vs 커버링스팟 채봇 Open API 키. 동일 계정이면 같은 값이지만 별도 앱이라면 다른 값 가능 | covering-spot-chatbot 격리 여부 확인 필요 |
| `CHANNELTALK_ACCESS_SECRET` | vehicle-dispatch-monitor, covering-spot-chatbot | 위와 동일 | 동일 |
| `SLACK_CHANNEL` | vehicle-dispatch-monitor, flarelane-live-monitoring | vehicle-dispatch-monitor: `#제품팀_cs_notifications` 기본값. flarelane-live-monitoring: `FLARELANE_MONITOR_SLACK_CHANNEL` → `PRODUCT_LABS_SLACK_CHANNEL` → `SLACK_CHANNEL` 순 fallback으로 읽음 | 현재는 flarelane-live-monitoring이 앞선 변수로 읽으므로 실질 충돌 없음. 단, 앞선 변수 미설정 시 vehicle-dispatch-monitor 채널로 오발송 가능 |
| `DHERO_TOKEN` | large-bag-delivery-batch, covering-spot-chatbot | 각각 다른 spot 토큰. covering-spot-chatbot은 격리됨 (`/shared/apps/covering-spot-chatbot/.env`) | covering-spot-chatbot 격리로 해결됨. large-bag-delivery-batch는 `/shared/.env` 사용 |
| `DHERO_SPOT_CODE` | large-bag-delivery-batch, covering-spot-chatbot | 위와 동일 | 동일 |

---

### [중복 관리] 다른 키, 동일한 값

> 두 개의 변수가 항상 같은 값을 가지므로 하나만 관리하면 충분하지만 현재 별도 관리 중.

| 변수 A | 변수 B | 상황 | 비고 |
|---|---|---|---|
| `GCP_PROJECT` | `BIGQUERY_PROJECT_ID` | covering-invite-batch가 `BIGQUERY_PROJECT_ID`를 읽어 내부적으로 GCP_PROJECT로 사용. 나머지 앱들은 `GCP_PROJECT`를 하드코딩(`covering-app-ccd23`)으로 처리 | 실제 값은 동일(`covering-app-ccd23`). `GCP_PROJECT`로 통일 권장 |
| `HT_CLIENT_ID` | `LUNCH_HT_CLIENT_ID` | `.env.example`에 "동일 값"으로 명시. 해피톡 방문수거·런치가 같은 자격증명 공유 | 의도적 중복. 런치/방문 분리 가능성 대비한 구조로 보임 |
| `HT_CLIENT_SECRET` | `LUNCH_HT_CLIENT_SECRET` | 위와 동일 | 동일 |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | 같은 URL, 서버/브라우저 노출 범위만 다름. Next.js 규칙상 브라우저 노출용은 `NEXT_PUBLIC_` 필수 | Next.js 규칙으로 불가피한 중복. 해소 불가 |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 위와 동일 | 동일 |
| `DHERO_BASE_URL` | `DHERO_API_URL` | large-bag-delivery-batch는 `DHERO_BASE_URL`, covering-spot-chatbot은 `DHERO_API_URL`을 사용. 둘 다 두발히어로 API Base URL이지만 spot이 달라 값이 다를 수 있음 | 변수명 불일치. 동일 목적이지만 다른 spot → 값 다름. 네이밍 불일치만 정리 권장 |

---

### [정상 격리] 의도적으로 격리된 중복 (조치 불필요)

| 변수명 | 격리 이유 | 격리 방법 |
|---|---|---|
| `SLACK_BOT_TOKEN` | covering-spot-chatbot이 전용 봇 사용, `/shared/.env` 봇과 다른 값 | `/shared/apps/covering-spot-chatbot/.env`에 별도 주입 |
| `DHERO_TOKEN` | covering-spot-chatbot 전용 spot 토큰 | 동일 |
| `DHERO_SPOT_CODE` | covering-spot-chatbot 전용 spot 코드 | 동일 |
