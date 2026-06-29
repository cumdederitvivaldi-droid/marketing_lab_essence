# PRD — largewaste-crosssell-report

> 유형: PRD
> 생성일: 2026-05-22
> 상태: 확정
>
> Linear: [ENG-3199](https://linear.app/covering/issue/ENG-3199)
> 본체 배치: `apps/private/largewaste-crosssell-coupon-sync/`
> 본체 PRD: [2026-05-21-covering-labs-largewaste-crosssell-coupon-sync.md](2026-05-21-covering-labs-largewaste-crosssell-coupon-sync.md)
> 라이브 목표: **2026-05-29 (금)** — 첫 리포트 발송 5/30 09:00 KST 예정

---

## 1. 목표

ENG-3199 실험의 일일 KPI 가시성 확보. `largewaste-crosssell-coupon-sync` 가 적재한 BQ ledger 를 매일 KST 09:00 에 집계하여 Slack 으로 발송한다.

본 앱은 read-only 분석 책임만 담당하며 write/발사 책임은 본체 배치 단일 소유.

## 2. 배경 / 문제

- 본체 배치(`coupon-sync`)는 5분 cron 으로 매 실행마다 BQ ledger 에 결과를 적재 중. 누적 데이터는 빠르게 늘어나지만 가시성이 없으면 라이브 직후 이상 감지가 어려움.
- 본체 배치에서 실패 알림 기능을 제거 (운영 정리 PR, 2026-05-22) — 알림·리포트 책임을 별도 앱으로 분리하여 단일 책임 원칙 준수.
- 마케팅·PM 입장에서 "어제 진입 몇 명, 회차별 전환 어느 정도" 를 매일 한 번 받아볼 수 있어야 의사결정 가능.

## 3. 메트릭 정의

ledger 의 `status='sent'` row 만 분모/분자에 포함. `pending`, `flarelane_failed` 는 발사 미확인이라 통계 왜곡 방지 차원 제외.

### 어제 신규 (KST yesterday window)

- **진입**: `signal_type='eligible'`, KST 전일 자정 ~ 오늘 자정 사이 `matched_at`
- **자격 해제**: `signal_type='disqualified'`, 같은 윈도우, `disqualified_reason` 별 분해
   - `coupon_used`: 본 실험 진입 이후 발급된 정책 216 쿠폰의 사용 (`matcher.coupon_uses` 정의)
   - `largewaste_submitted`: 대형폐기물 신청 (쿠폰 미사용이어도 차단)

### 누적 (실험 시작 이후)

- 진입자 수, 자격 해제자 수 (사유별 분해)
- 전환율 = 자격 해제 / 진입

### 회차별 전환율 (진입 후 경과 시간 윈도우)

config `CONVERSION_WINDOWS_HOURS` 로 정의:

| 회차 | 윈도우 (h) | 의도 |
|---|---|---|
| D+0 | 0 ~ 24 | D+0 친구톡 직후 24h 안에 전환 |
| D+1~D+6 | 24 ~ 144 | 친구톡 D+1 발송 ~ D+6 직전 |
| D+6~만료 | 144 ~ 168 | D+6 발송 후 쿠폰 만료(D+7) 전 마지막 푸시 |

- 분모: 진입 후 윈도우 *상한 이상* 경과한 user (시간 충분히 흘러야 평가)
- 분자: 분모 중 그 윈도우 안에 자격 해제 발생한 user

## 4. 구현

### 디렉토리

```text
apps/private/largewaste-crosssell-report/
├── README.md
├── deploy.yml             (type=batch, schedule="0 9 * * *")
├── requirements.txt       (google-cloud-bigquery, requests, protobuf)
└── src/
    ├── config.py          (env + 상수 + 회차 윈도우)
    ├── queries.py         (BQ 집계 2종)
    ├── slack.py           (chat.postMessage)
    └── main.py            (집계 → 포맷 → 발송)
```

### 환경변수

- `GCP_PROJECT` (공통)
- `SLACK_BOT_TOKEN` (공통)
- `LARGEWASTE_CROSSSELL_REPORT_CHANNEL` (선택, default `C0ARXKB2Y9L` = #제품팀_실험실_notification)

### 쿼리 구조

- `_LATEST_BASE`: user 별 signal_type 의 최신 status row 1건만 dedup (`pending → sent` 전이 시 sent 만 카운트). `status='sent'` 필터 포함.
- `query_daily_summary`: 어제 + 누적을 한 쿼리에 SELECT 컬럼으로 묶어 단발 실행.
- `query_conversions(windows)`: 모든 회차 윈도우를 단일 쿼리에 묶어 집계 (windows CTE × enter_with_disq LEFT JOIN). 분모 0 인 윈도우도 결과에 보존.

총 BQ 쿼리 **2 회/일** (요약 1 + 회차 통합 1). 비용 미미.

### Slack 본문 포맷

```text
:bar_chart: *[ENG-3199] 대형폐기물 크로스셀 — 일일 리포트* (YYYY-MM-DD KST 기준)

*어제 신규*
• 진입: N명 (쿠폰 발급 N건)
• 자격 해제: M명
   - 쿠폰 사용: x
   - 대형폐기물 신청 (쿠폰 미사용): y

*누적 (실험 시작 이후)*
• 진입: N명
• 자격 해제: M명 (P%)
   - 쿠폰 사용: x
   - 대형폐기물 신청: y

*회차별 전환율 (진입 후 경과 시간, 윈도우 이상 경과 모수)*
• D+0 (0h ~ 24h): X% (a/b)
• D+1~D+6 (24h ~ 144h): X% (a/b)
• D+6~만료 (144h ~ 168h): X% (a/b)
```

## 5. 안전 기준

- **Read-only**: 본 앱은 ledger 에 쓰지 않음. 쓰기 책임은 coupon-sync 단일 소유.
- **status 필터**: `status='sent'` 만 KPI 분모/분자.
- **타임존**: 모든 일일 윈도우 KST 기준 (`DATETIME_TRUNC(..., 'Asia/Seoul')`).
- **모수 컷오프**: 라이브 첫 주는 회차별 분모가 작아 변동성 큼 — 리포트 본문에 분모 함께 노출.
- **실패 처리**: Slack 발송 실패해도 배치는 정상 종료 (로그에만 ERROR). 알림 의존성 차단.

## 6. 운영

- 라이브 5/29 (금) → 첫 리포트 발송 5/30 (토) 09:00 KST
- 실험 종료 후엔 `deploy.yml` 삭제로 cron 중단 (앱 디렉토리는 보존하여 사후 재실행 가능)
- 리포트 본문 변경 시 `main.py:_format_report` 만 수정 — 메트릭 정의는 `queries.py` 안에 응집
