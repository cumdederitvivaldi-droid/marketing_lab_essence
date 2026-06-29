# large-bag-delivery-batch

150L 대형 커버링 봉투 배송 접수 자동화 배치

## 목적

고객이 설문폼(왈라)으로 150L 봉투를 신청하면 Google Sheet에 데이터가 적재된다. 이 배치는 매일 오전 10:30, 오후 15:30 KST에 자동 실행되어 두발히어로 배송 API로 접수를 처리한다. 배송 상태(H열)는 고객 수거 신청 가능 여부에 직접 영향을 미친다.

## 실행 환경

- 실행 방식: cron (자동)
- 실행 주기: 매일 10:30, 15:30 KST
- 실행 서버: GCP 인스턴스 (batch-server)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `main.py` | CLI 진입점 — register/status/watchdog 모드 분기 및 배송 접수 오케스트레이션 |
| `config.py` | 환경변수 로드 (ENV_FILE 자동 감지) + 상수 정의 (배치 사이즈, 타임가드, 모니터 헤더 등) |
| `phone_utils.py` | 전화번호 정규화 (+82→0 변환, 하이픈/공백 제거) 및 검증 (0으로 시작, 10~11자리) |
| `delivery_planner.py` | 후보 선정 — 완료 행 판정, 응답ID/전화번호 중복 판정 (7일 이내), J열 제외 사유 확인, 레거시 특이 행 주소 복구 |
| `dubalhero_api.py` | 두발히어로 POST /deliveries API — 20건 병렬 호출 (ThreadPoolExecutor), 배송불가/중복/정상 응답 분류, 3회 재시도 |
| `google_sheets.py` | gspread 기반 시트 읽기/쓰기 — H/I/J 열 배치 갱신, 모니터 시트 생성 관리 |
| `delivery_monitor.py` | 모니터 시트 13열 기록 — 실행 상태/결과 요약, 스냅샷 (미처리/중복/접수누락위험 현황) |
| `slack_notifier.py` | 슬랙 API (봇 토큰) — 채널 메시지, DM 일괄 전송, 배송불가 xlsx 파일 업로드 (files.getUploadURLExternal 3단계) |
| `schedule_watchdog.py` | 자동 실행 감시 — 모니터 시트에서 해당 슬롯 실행 기록 확인, 미실행 시 경보 |

## 환경변수

`~/.bag-delivery-150l.env` 또는 ENV_FILE 환경변수로 지정한 파일에서 로드:

| 변수 | 필수 | 설명 |
|---|---|---|
| `DHERO_BASE_URL` | O | 두발히어로 API 기본 URL |
| `DHERO_TOKEN` | O | 두발히어로 JWT 토큰 |
| `DHERO_SPOT_CODE` | O | 두발히어로 매장 코드 |
| `DHERO_SPREADSHEET_ID` | O | Google Sheets 운영 시트 ID |
| `DHERO_SHEET_GID` | O | 배송 데이터 시트의 GID (정수) |
| `SLACK_BOT_TOKEN` | X | 슬랙 봇 토큰 (없으면 알림 미발송) |
| `SLACK_CHANNEL_ID` | X | 결과 알림 및 배송불가 파일 업로드 채널 ID |
| `SLACK_DM_USER_IDS` | X | DM 수신자 슬랙 유저 ID (콤마 구분) |
| `SLACK_UNSUPPORTED_MENTION_USER_ID` | X | 배송불가 알림 멘션 대상 슬랙 유저 ID |

GCP 인증은 인스턴스 스코프로 자동 처리 (키 파일 불필요).

## 실행 방법

### 배송 접수 (자동, cron 또는 수동)

```bash
python3 src/main.py --mode register
```

현재 미처리 행을 선정하여 두발히어로 API로 배송 접수.

### 배송 접수 (dry-run)

```bash
python3 src/main.py --mode register --dry-run
```

후보 행을 로그에만 출력. API 호출하지 않음. 모니터 시트에 기록도 하지 않으므로 자동 감시(watchdog)에서 오탐 주의.

### 상태 확인

```bash
python3 src/main.py --mode status
```

현재 미처리(pending), 중복 제외(duplicate), 전화번호 형식 이상, 접수누락위험 건수를 콘솔에 출력.

### 자동 실행 감시

```bash
python3 src/main.py --mode watchdog --slot morning
python3 src/main.py --mode watchdog --slot afternoon
```

해당 슬롯에 자동 실행(자동) 기록이 있는지 확인. 없으면 슬랙 경보 발송.

## 의존 서비스

| 서비스 | 용도 | API |
|---|---|---|
| Google Sheets | 배송 데이터 저장소 | gspread / Google Sheets API |
| 두발히어로 | 배송 접수 | POST /deliveries |
| 슬랙 | 실행 결과 및 배송불가 알림 | chat.postMessage, files.getUploadURLExternal, files.completeUploadExternal |
| GCP 인스턴스 | 자동 실행 (cron) | crontab (커버링랩스 배치 서버) |

## 주의사항

- **H열 수동 수정**: H열(전송 상태) 변경은 고객의 수거 신청 가능 여부에 직접 영향을 미친다. 수정 시 `GET /order/large-covering-bag/purchase-status` API 동작을 확인할 것.
- **배치 중간 실패**: 20건 배치 호출 중 일부 실패 시, 완료된 건까지만 시트에 반영된다 (중간 flush). 재실행하면 이미 기입된 행(H/I 열)은 건너뛴다.
- **legacy 특이 행**: 2024년 04월 07일 이전 일부 행은 주소가 D열에 밀려 저장됐다. 배치는 응답ID와 출입 방법으로 이 패턴을 자동 감지해 주소를 복구한다.
- **전화번호 중복 판정**: 최근 7일 이내에 배송완료(H열 기입 또는 bookId 존재) 기록이 있으면 중복 제외. 재시도하려면 해당 행을 미처리 상태로 리셋.
- **슬랙 파일 업로드**: 배송불가 xlsx 파일명은 ASCII (unsupported_MMDD-HHMM.xlsx)이지만 슬랙에 표시되는 제목은 한글 (배송불가_MM-DD_HH시.xlsx).
- **타임가드**: 10분(600초) 초과 시 남은 후보는 다음 자동 실행으로 이월. API 호출 단계에서 중단해 미반영 건이 없도록 보호.
- **cron 스케줄**:
  ```
  30 10 * * *  python3 src/main.py --mode register          # 오전 배송 접수
  30 15 * * *  python3 src/main.py --mode register          # 오후 배송 접수
  5  11 * * *  python3 src/main.py --mode watchdog --slot morning    # 오전 감시
  5  16 * * *  python3 src/main.py --mode watchdog --slot afternoon  # 오후 감시
  ```
