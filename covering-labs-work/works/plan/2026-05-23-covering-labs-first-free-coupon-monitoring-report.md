# 첫 구매 0원 CRM 모니터링 리포트 플랜

> 유형: 플랜
> 작성일: 2026-05-23
> 상태: 완료

## 목표

첫 구매 0원 CRM 실험을 매일 Slack으로 모니터링하는 private batch 앱을 별도로 만든다.

## 현황 분석

- 발급 배치는 `apps/private/first-free-coupon-batch`로 `origin/main`에 존재한다.
- 발급 배치 ledger는 `covering-app-ccd23.product.first_free_coupon_ledger_v1`다.
- 리포트는 대형폐기물 리포트에 합치지 않고, 같은 batch 앱 구조의 별도 앱으로 둔다.

## 구현 계획

### 단계별 작업

- [x] `apps/private/first-free-coupon-monitoring-report` batch 앱 추가
- [x] 일일/누적/비용/회차별 전환 SQL 작성
- [x] Slack 메시지 렌더링 및 `--no-slack` 검증 경로 추가
- [x] BigQuery dry-run 또는 실제 `--no-slack` 실행으로 쿼리 검증

## 변경 파일

- `apps/private/first-free-coupon-monitoring-report/deploy.yml`: 매일 09:00 KST batch 정의 추가
- `apps/private/first-free-coupon-monitoring-report/src/main.py`: BigQuery 조회, Slack 메시지 렌더링, Slack 발송 추가
- `apps/private/first-free-coupon-monitoring-report/src/config.py`: 공통 환경변수 파일 로더 추가
- `apps/private/first-free-coupon-monitoring-report/src/summary.sql`: 어제 신규/누적/비용 지표 추가
- `apps/private/first-free-coupon-monitoring-report/src/windows.sql`: D+0/D+1/D+2/D+3/D+7 전환율 추가
- `apps/private/first-free-coupon-monitoring-report/README.md`: 실행법과 지표 정의 추가

## 리뷰 반영

- CodeRabbit 지적에 따라 README `의존서비스` 섹션을 추가했다.
- batch 표준에 맞춰 local env loader를 `src/config.py`로 분리했다.
- `summary.sql`에서 주문 조인 후 배정자 수가 중복 집계될 수 있는 문제를 user-level distinct 집계로 수정했다.
- batch 핵심 처리 지표 로그를 추가했다.

## 05/24 후속 반영

- Slack 메시지의 배정, 쿠폰 발급/사용, 봉투 신청률, 수거 신청률, 비용/공헌이익 수치를 막대 그래프 중심으로 바꿨다.
- 비교군과 실험군이 함께 있는 전환율은 실험군 라인에 비교군 대비 증감 `%p`를 함께 표시한다.
- 1~5%대 낮은 전환율도 0처럼 보이지 않도록 부분 블록을 사용한다.
- 기본 Slack 채널 fallback은 실제 ENG-3199/친구초대 리포트가 올라가는 `C0ARXKB2Y9L`로 맞췄다.

## 검증

- `python3 -m py_compile apps/private/first-free-coupon-monitoring-report/src/main.py apps/private/first-free-coupon-monitoring-report/src/config.py`
- `python3 src/main.py --no-slack --report-date 2026-05-22`
- `python3 -m py_compile src/main.py`
- `python3 src/main.py --no-slack --report-date 2026-05-23`

## 완료 기준

- 매일 09:00 KST 실행되는 `deploy.yml`이 있다.
- Slack 메시지에 `어제 신규`, `누적`, `비용/공헌이익`, `회차별 전환율`이 표시된다.
- 회차별 전환율 분모는 해당 윈도우가 지난 사용자만 포함한다.
- 쿠폰 사용 예산은 `사용 주문 수 * 20,000원`, 차감액은 `쿠폰 사용 예산 * 공헌이익률`로 계산한다.
- 숫자는 가능하면 막대 그래프와 비교군 대비 증감으로 먼저 읽힌다.
