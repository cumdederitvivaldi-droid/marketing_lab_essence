# 비개발자 API 및 인프라 접근 범위

> 대상: 비개발자 (`all@covering.app`)
> 이 문서는 covering-labs에서 비개발자가 접근할 수 있는 API와 인프라의 범위를 정의합니다.

---

## 요약

| 항목 | 허용 여부 | 조건 |
|---|---|---|
| Backoffice API | 허용 | 지정된 엔드포인트만 |
| Core API | 차단 | 사용 불가 |
| Rider API | 차단 | 사용 불가 |
| Grafana | 허용 | Private VM에서만 (VPN 필수) |
| BigQuery | 허용 | 읽기 전용, 지정 데이터셋만 |
| Google Cloud Storage | 허용 | 본인 폴더만 |
| Google Sheets | 허용 | SA에 공유된 시트만 |
| Slack API | 허용 | 봇 토큰 경유 |
| 채널톡 API | 허용 | 지정 앱에서만 |
| FlareLane API | 허용 | 지정 앱에서만 |
| 두발히어로 API | 허용 | 지정 앱에서만 |
| Airbridge API | 허용 | 서버사이드에서만, 토큰 경유 |
| Mixpanel | 허용 | 클라이언트 SDK 또는 BigQuery 데이터셋으로 접근 |

---

## 허용되는 API 및 인프라

### Backoffice API

- **URL**: `https://admin-api.covering.app`
- **접근 방식**: Private VM에서만 접근 가능 (AWS VPN 경유)
- **허용 기능**: 주문 조회, 전화번호 검증, 배송 정보 조회
- **인증**: 환경변수 `BACKOFFICE_ACCESS_TOKEN` 또는 `BACKOFFICE_EMAIL` + `BACKOFFICE_PASSWORD`
- **주의**: 쓰기/변경 작업은 별도 승인 필요. Public VM에서는 접근 불가 (VPN 미연결).

### Grafana

- **URL**: `https://grafana.covering.app`
- **용도**: BigQuery 데이터 시각화 대시보드
- **접근 방식**: Private VM에서만 접근 가능 (AWS Site-to-Site VPN 경유)
- **주의**: Public VM에서는 접근 불가.

### BigQuery

- **접근 방식**: GCP 서비스 계정으로 자동 인증 (키 파일 불필요)
- **허용**: SELECT 조회만 가능
- **차단**: INSERT, DELETE, UPDATE, CREATE TABLE 등 모든 쓰기 작업
- **접근 가능 데이터셋**:

| 데이터셋 | 내용 |
|---|---|
| `secure_dataset` | 보안 관련 데이터 |
| `ads_data` | 광고 데이터 |
| `airbridge_dataset` | Airbridge 분석 데이터 |
| `bag_delivery` | 봉투 배송 데이터 |
| `cx_data` | CX 데이터 |
| `mixpanel` | Mixpanel 이벤트 데이터 |
| `product` | 제품 데이터 |
| `spot` | 스팟 데이터 |
| `secure_dataset_gcp_sa_discoveryengine` | Discovery Engine 데이터 |

- **접근 불가 데이터셋**: `public` (의도적 제외 — covering-app 내부 전용)
- **신규 데이터셋 접근 요청**: 관리자(`jun@covering.app`)에게 요청

### Google Cloud Storage

- **버킷**: `gs://covering-labs`
- **허용**: 읽기, 쓰기, 파일 업로드/다운로드
- **규칙**: 본인 이름 폴더만 사용. 타인 폴더에 쓰기/삭제 금지.
- **콘솔 접근**: https://console.cloud.google.com/storage/browser/covering-labs?project=covering-app-ccd23

### Google Sheets

- **허용**: 읽기/쓰기 모두 가능
- **조건**: 시트 소유자가 SA(`covering-labs@covering-app-ccd23.iam.gserviceaccount.com`)에 공유 필요
- **공유 방법**: 시트 → 공유 → SA 이메일 입력 → 편집자/뷰어 선택

### Slack API

- **허용**: 봇 메시지 발송 (`chat.postMessage`)
- **인증**: 환경변수 `SLACK_BOT_TOKEN` (이미 서버에 설정됨)
- **주요 채널**: `#개발팀_커버링랩스`, `#개발팀_server-status`

### 외부 서비스 (앱별 허용)

| 서비스 | 용도 | 인증 방식 | 사용 앱 |
|---|---|---|---|
| 채널톡 (ChannelTalk) | CRM, 배차 태그 감지 | API Key/Secret | vehicle-dispatch-monitor |
| FlareLane | 푸시 알림 트래킹 | Project ID + API Key | flarelane-d7-retention |
| 두발히어로 (DHero) | 배송 처리 | Bearer Token | large-bag-delivery-batch |
| Airbridge | 딥링크 생성 | Tracking Link API Token | large-coveringbag-order |
| Mixpanel | 이벤트 트래킹 | Project Token (NEXT_PUBLIC_) | covering-invite, covering-spot |
| 카카오 SDK | 공유 기능 | JavaScript Key (NEXT_PUBLIC_) | covering-invite |

---

## 차단되는 API 및 인프라

### Core API

- **상태**: 접근 불가
- **이유**: 내부 핵심 서비스. 비개발자 접근 범위에 포함되지 않음.
- **대안**: 필요한 데이터는 BigQuery 또는 Backoffice API를 통해 조회.

### Rider API

- **상태**: 접근 불가
- **이유**: 라이더 관련 내부 서비스. 비개발자 접근 범위에 포함되지 않음.

### BigQuery 쓰기 작업

- **차단**: INSERT, DELETE, UPDATE, CREATE TABLE, DROP TABLE
- **이유**: 데이터 무결성 보호. SA에 WRITER 권한 없음.

### Public VM의 AWS 내부 리소스

- **차단**: Grafana, Admin API, Admin Web 등 AWS Private IP 기반 서비스
- **이유**: Public VM(`covering-labs-public`)은 Site-to-Site VPN 미연결
- **해결**: Private VM(`covering-labs-instance`)에서 앱을 개발해야 내부 서비스 사용 가능

### Cloud Logging / Cloud Monitoring

- **차단**: `dev@covering.app` 이상만 접근 가능
- **대안**: `#개발팀_server-status` Slack 채널에서 서버 상태 알림 수신

---

## 환경변수 추가 규칙

새 API를 연동할 때 환경변수가 필요하면:

1. AI에게 "어떤 변수명이 필요한지" 확인
2. `apps/AGENTS.md`의 환경변수 레지스트리에 등록 여부 확인
3. `jun@covering.app`에게 VM의 `/shared/.env` 또는 `/shared/apps/[앱이름]/.env`에 추가 요청
4. 추가 완료 후 AI에게 "환경변수 추가됐어, 계속 진행해줘"

> 환경변수는 절대 코드에 직접 입력하지 않습니다. 자세한 규칙: [09_보안_규약.md](09_보안_규약.md)

---

## 인프라 접근 주소

| 서비스 | 주소 | 접근 조건 |
|---|---|---|
| Private 앱 | `https://labs.covering.app/[앱이름]` | AWS Client VPN 필수 |
| Public 앱 | `https://public-labs.covering.app/[앱이름]` | VPN 불필요 |
| GCP 콘솔 | `https://console.cloud.google.com` | Google 계정 |
| Grafana | `https://grafana.covering.app` | Private VM에서만 |
| Admin Web | `https://admin.covering.app` | Private VM에서만 |
| GitHub Actions | `https://github.com/covering-app/covering-labs/actions` | GitHub 계정 |
