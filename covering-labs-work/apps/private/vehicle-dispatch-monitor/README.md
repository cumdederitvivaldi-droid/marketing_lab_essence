# Vehicle Dispatch Monitor

배차 완료 시 고객에게 차량번호를 자동으로 알림하는 시스템입니다. 채널톡 태그 감지부터 배차 확인, 메시지 발송까지 전체 플로우를 자동화합니다.

## 목적

오늘수거 서비스의 고객이 배차 정보(차량번호, 라이더 정보)를 즉시 받을 수 있도록 자동화합니다. 채널톡 상담 태그 감지 후 주문 정보를 추출하고, 배차 완료 시 자동으로 고객에게 메시지를 발송하여 운영 효율을 높이고 고객 만족도를 개선합니다.

## 실행 환경

- **실행 방식**: GCP VM의 crontab 또는 PM2 데몬
- **실행 주기**: 매일 21:00 KST 시작 (10분 간격 폴링, 23:00 KST 종료)
- **실행 서버**: GCP Compute Engine VM (ALLOWED_HOST 머신 검증)

### 실행 모드

```bash
# 1회 실행 (배치 1회 수행)
python3 monitor.py

# 연속 폴링 모드 (21:00~23:00 KST, 10분마다 반복)
python3 monitor.py --loop

# 드라이런 (실제 발송 없이 감지/배차확인만 수행)
python3 monitor.py --dry-run

# 채널톡 발송만 스킵 (시트/BQ/배차확인은 실제 실행)
python3 monitor.py --skip-send
```

## 주요 파일

| 파일명 | 역할 |
|--------|------|
| `monitor.py` | 메인 스크립트. 배치 실행 및 연속 폴링 모드 관리 |
| `config.py` | 모든 외부 서비스 인증 정보 및 설정 중앙화 |
| `channeltalk.py` | 채널톡 API 통합. 태그 감지 + 메시지 발송 |
| `sheets.py` | Google Sheets 시트 관리. 주문 적재 및 배차 상태 추적 |
| `backoffice.py` | 백오피스 API 통합. 배차 정보 조회 |
| `backoffice_auth.py` | 백오피스 토큰 관리 (자동/수동 로그인) |
| `order_lookup.py` | BigQuery 통합. 주문코드 → 주문ID 매핑 |
| `slack_notify.py` | Slack 로그 알림 (#제품팀_cs_notifications) |
| `security.py` | 보안 정책 실행. GET 화이트리스트 + 감사 로그 |
| `cron/crontab.tmpl` | crontab 설정 템플릿 |

## 환경변수

### 필수 환경변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `CHANNELTALK_ACCESS_KEY` | 채널톡 API 키 | (채널톡 관리자 Settings > API Key) |
| `CHANNELTALK_ACCESS_SECRET` | 채널톡 API 시크릿 | (채널톡 관리자 Settings > API Key) |

### 권장 환경변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `BACKOFFICE_ACCESS_TOKEN` | 백오피스 수동 토큰 (또는 EMAIL/PASSWORD) | "" |
| `BACKOFFICE_EMAIL` | 백오피스 자동 로그인 이메일 | "" |
| `BACKOFFICE_PASSWORD` | 백오피스 자동 로그인 비밀번호 | "" |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Sheets 서비스 계정 JSON | "" |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Google Sheets 감시 목록 ID | "" |
| `GOOGLE_SHEETS_WORKSHEET_NAME` | Google Sheets 워크시트명 | "시트1" |
| `SLACK_BOT_TOKEN` | Slack 봇 토큰 | "" |
| `SLACK_CHANNEL` | Slack 알림 채널 | "#제품팀_cs_notifications" |
| `ALLOWED_HOST` | 허용된 GCP VM 호스트명 (중복 실행 방지) | "" |
| `BACKOFFICE_ORDER_API_VERSION` | 백오피스 주문 API 버전 (v3/v2) | "v3" |

### 환경변수 로드 순서

1. `/shared/.env` (공유 환경변수 — crontab 실행 시)
2. `앱_디렉토리/.env` (앱 로컬 환경변수 — 폴백)

## 실행 방법

### 설치

```bash
# 의존성 설치
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 로컬 테스트

```bash
# 드라이런 (실제 발송 없이 동작 확인)
.venv/bin/python3 monitor.py --dry-run

# 테스트 실행 (통합 테스트)
.venv/bin/python3 -m pytest test_changes.py -v
```

### 배포 후 체크리스트

```bash
# 1. 테스트 통과 확인
.venv/bin/python3 -m pytest test_changes.py -v

# 2. 드라이런 정상 동작 확인
.venv/bin/python3 monitor.py --dry-run

# 3. Slack 배치 요약 알림 수신 확인
# (실제 배포 후 운영 시간에 모니터링)
```

### Crontab 설정

```bash
# crontab 편집
crontab -e

# 아래 라인 추가 (매일 21:00 KST에 시작)
CRON_TZ=Asia/Seoul
0 21 * * * cd /home/username/vehicle-dispatch-monitor && . /shared/.env && mkdir -p logs && .venv/bin/python3 monitor.py --loop >> logs/batch.log 2>&1
```

## 동작 흐름

```text
Step 1: 채널톡 "차량등록" 태그 감지
    └─ 열린 상담(opened) + 보류중(snoozed) 상담에서 태그 검색

Step 2: 봇 폼 데이터에서 주문코드 추출
    ├─ 1차: 봇 폼 주문번호 필드 (65% 성공률)
    ├─ 2차: 전화번호 → BigQuery 후보 → 백오피스 full phone 대조 (30%)
    └─ 3차: 채널톡 유저 프로필 전화번호 → 백오피스 대조 (~100%)

Step 2.5: BigQuery로 주문코드 → 숫자 주문ID 매핑
    └─ 동기화 지연: 약 30분 (BQ 스트리밍/마이크로배치)

Step 3: 백오피스 API로 배차 정보 조회
    └─ GET /v3/order/{id} 우선, 404 시 /v2/order/{id} 폴백

Step 4: 배차 완료 건 → 채널톡 고객에게 차량번호 발송
    └─ 발송 완료 플래그 + 메모리 캐시로 중복 발송 방지

Step 5: Slack 로그 발송
    └─ #제품팀_cs_notifications에 배치 요약 기록
```

## 의존 서비스

| 서비스 | 용도 | 인증 방식 |
|--------|------|---------|
| **채널톡 Open API** | 상담 태그 감지 + 메시지 발송 | API Key + Secret |
| **백오피스 API** | 배차 정보 조회 (차량번호, 라이더) | 토큰 (수동/자동 로그인) |
| **Google Sheets API** | 감시 목록 시트 관리 | 서비스 계정 |
| **BigQuery API** | 주문코드 → 주문ID 매핑 | 서비스 계정 (ADC) |
| **Slack API** | 배치 로그 알림 | 봇 토큰 |
| **Vercel Webhook** | 백오피스 배차 완료 알림 수신 | Secret 기반 HMAC 검증 |

## 주의사항

### 실행 환경 검증

- **ALLOWED_HOST 필수**: 환경변수 미설정 시 프로그램 자동 종료 (중복 실행 방지)
- **호스트명 일치**: `socket.gethostname()`과 ALLOWED_HOST가 정확히 일치해야 함

### 환경변수 우선순위

1. **백오피스 인증**: 수동 토큰(`BACKOFFICE_ACCESS_TOKEN`) > 자동 로그인(`BACKOFFICE_EMAIL`/`PASSWORD`)
2. **Google Sheets**: JSON 문자열(`GOOGLE_SERVICE_ACCOUNT_JSON`) > 키 파일(`GOOGLE_SHEETS_KEY_FILE`) > ADC(`GOOGLE_APPLICATION_CREDENTIALS`)

### 중복 실행 방지

- PID 파일 락 사용 (`/tmp/vehicle-dispatch-monitor.pid`)
- 이미 실행 중인 프로세스가 있으면 자동 종료

### 운영 시간 설정

```python
OPERATION_START = 21:00  # 21:00 KST 시작
OPERATION_END = 23:00    # 23:00 KST 종료
POLLING_INTERVAL_MINUTES = 10  # 10분마다 폴링
```

### 주문 상태 필터링

- **완료 상태**: COMPLETED, DONE, DELIVERED, PICKED_UP, FINISHED, CLOSED, PICK_UP_COMPLETED
- **취소 상태**: USER_CANCELED, ADMIN_CANCELED, CANCELED
- 이들 상태의 주문은 전화번호 폴백에서 제외

### BigQuery 동기화 지연

주문코드는 채널톡 봇에서 즉시 수집되지만, BigQuery 동기화는 약 30분 소요됩니다. 
폴백 메커니즘으로 최대 12회(2시간) 재시도합니다.

### 감사 로그

모든 발송 시도는 `logs/batch.log`에 기록됩니다:
- 타임스탐프
- 상담ID
- 발송 결과 (성공/실패)
- 실패 사유

### 보안 정책

- **GET만 허용**: 백오피스 API는 조회(`GET`) 요청만 가능
- **엔드포인트 화이트리스트**: `security.py`에 정의된 경로만 접근 가능
- **메시지 템플릿 고정**: 동적 부분은 차량번호 1개만 (AI 흔적 없음, CS 매크로와 동일한 톤)

## 로그 위치

| 파일 | 내용 |
|------|------|
| `logs/batch.log` | 전체 배치 로그 (태그 감지, 배차 확인, 발송 결과, 백오피스 API 호출, 감사 로그) |

## 웹훅 스펙 (개발팀 전달용)

백오피스에서 배차 완료 시 아래 엔드포인트로 POST 요청을 보냅니다:

```http
POST https://vehicle-dispatch-monitor.vercel.app/api/webhook
X-Webhook-Secret: ${VEHICLE_DISPATCH_WEBHOOK_SECRET}

{"order_id": 1283492, "vehicle_number": "서울 85 바 9953", "rider_name": "윤성원"}
```

- 재시도 불필요 (최초 1회만)
- HMAC-SHA256 검증

## 문제 해결

### "이미 실행 중인 프로세스가 있습니다" 오류

```bash
# PID 파일 확인
cat /tmp/vehicle-dispatch-monitor.pid

# 프로세스 확인
ps aux | grep monitor.py

# 필요시 강제 종료
kill -9 <PID>
rm /tmp/vehicle-dispatch-monitor.pid
```

### 백오피스 토큰 발급 실패

- 환경변수 확인: `BACKOFFICE_EMAIL`, `BACKOFFICE_PASSWORD`, 또는 `BACKOFFICE_ACCESS_TOKEN`
- 로그 확인: `logs/batch.log`
- 자동 로그인 모드: 50분마다 자동 갱신

### BigQuery 동기화 지연

- 주문코드 추출 후 BQ 매핑까지 약 30분 소요
- 폴백: 최대 12회 재시도 (2시간 동안 10분 간격)

### Slack 알림 미수신

- 환경변수 확인: `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`
- 봇 토큰 권한: `chat:write` 필수
- 채널 확인: 봇이 채널에 초대되어 있는지 확인
