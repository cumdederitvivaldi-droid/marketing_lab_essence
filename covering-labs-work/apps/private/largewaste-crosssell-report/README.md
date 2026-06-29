# largewaste-crosssell-report

## 목적 (Purpose)

[ENG-3199] 대형폐기물 크로스셀 실험의 일일 KPI 리포트 — `largewaste-crosssell-coupon-sync` 가 적재한 BQ ledger 를 집계하여 매일 KST 09:00 에 Slack 으로 발송.

리포트 내용:

- 어제 신규 진입자 + 자격 해제자 (사유별 분해)
- 실험 시작 이후 누적 진입/해제 + 전체 전환율
- 회차별 전환율 (진입 후 경과 시간 윈도우 기준)

## 실행 환경 (Execution environment)

- 실행: VM crontab `0 9 * * *` (매일 KST 09:00, `/shared/apps/largewaste-crosssell-report/` 위치)
- Python 3.x (covering-labs VM 표준)
- 인증: GCP 인스턴스 SA 자동 (`google.auth.default()`)
- 로그: `logs/batch.log`

## 주요 파일 (Key files)

| 파일 | 역할 |
|---|---|
| `src/config.py` | 환경변수, ledger 테이블 경로, 실험키, 회차 윈도우 정의 |
| `src/queries.py` | BQ 집계 쿼리 (일일 요약 + 회차별 전환율) |
| `src/slack.py` | chat.postMessage 로 리포트 본문 발송 |
| `src/main.py` | 메인 흐름 (집계 → 포맷팅 → 발송) |
| `deploy.yml` | 배포 설정 (type=batch, schedule=`0 9 * * *`) |
| `requirements.txt` | google-cloud-bigquery, requests, protobuf |

## 환경변수 (`/shared/.env`)

| 변수명 | 용도 | 비고 |
|---|---|---|
| `GCP_PROJECT` | BigQuery 프로젝트 (`covering-app-ccd23`) | 공통 |
| `SLACK_BOT_TOKEN` | 리포트 발송 봇 토큰 | 공통 |
| `LARGEWASTE_CROSSSELL_REPORT_CHANNEL` | Slack 채널 ID (선택) | default `C0ARXKB2Y9L` (#제품팀_실험실_notification) |

## 실행 방법 (Execution method)

```bash
# 정상 실행 (CRON 매일 09:00 KST)
python3 src/main.py

# dry-run — Slack 발송 스킵, 본문만 로그 출력
python3 src/main.py --dry-run
```

## 흐름

```text
[매일 KST 09:00 CRON]
  ↓
BQ 집계 (ledger 단일 테이블, status='sent' 만 카운트)
  ├─ 어제 신규 (KST yesterday window)
  │   - 진입 수 (signal_type='eligible')
  │   - 자격 해제 수 (signal_type='disqualified', reason 별)
  ├─ 실험 시작 이후 누적
  │   - 진입/자격 해제 (사유별)
  └─ 회차별 전환율
      - 진입 후 경과 시간 윈도우 (D+0 / D+1~D+6 / D+6~만료)
      - 분모: 진입 후 윈도우 상한 이상 경과한 모수
      - 분자: 분모 중 그 윈도우 안에 자격 해제 발생
  ↓
Slack 본문 포맷팅 (mrkdwn)
  ↓
chat.postMessage → #제품팀_실험실_notification
```

## 종속 서비스 (Dependent services)

- **BigQuery** (`covering-app-ccd23.product`)
  - `largewaste_crosssell_coupon_ledger_v1` — read-only 집계 (write 는 coupon-sync 책임)
- **Slack** — chat.postMessage (리포트 발송)

## 주의사항 (Precautions)

- **Read-only**: 본 앱은 ledger 에 쓰지 않음. write 책임은 `largewaste-crosssell-coupon-sync` 단일 소유.
- **status 필터**: `latest_<signal>` CTE 에서 `status='sent'` 만 KPI 분모/분자에 포함. `pending` / `flarelane_failed` 는 발사 미확인이라 통계 왜곡 방지 차원에서 제외.
- **회차 윈도우 정의** (config `CONVERSION_WINDOWS_HOURS`):
  - D+0: 진입 ~ 24h (D+0 친구톡 직후 전환)
  - D+1~D+6: 24h ~ 144h (1d ~ 6d, 친구톡 D+1 발송 ~ D+6 직전)
  - D+6~만료: 144h ~ 168h (6d ~ 7d, 쿠폰 만료 직전 마지막 push 후)
- **모수 컷오프**: 회차별 전환율 분모는 *진입 후 윈도우 상한 이상 경과한 user* 만. 진입 후 48h 안 지난 user 는 D+1~D+6 분모에서 자동 제외. 라이브 첫 주에는 분모가 작아 변동성 큼.
- **타임존**: KST 기준 일일 집계 (`DATETIME_TRUNC(... 'Asia/Seoul')`). UTC 자정 기준 X.
- **실험 종료 후 운영**: 실험 종료(쿠폰 정책 비활성화 또는 분석 완료) 후엔 `deploy.yml` 삭제하여 cron 중단.
