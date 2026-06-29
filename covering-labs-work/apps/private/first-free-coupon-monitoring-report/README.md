# First Free Coupon Monitoring Report

첫 구매 0원 CRM 실험을 매일 Slack으로 보고하는 private batch 앱이다.

## 목적

신규 가입자 A/B 배정, 0원 쿠폰 발급/사용, 가입 후 봉투 신청률과 수거 신청률, 쿠폰 예산과 공헌이익 기준 순효과를 매일 오전 9시에 확인한다. Slack 메시지는 수치 나열보다 막대 그래프와 비교군 대비 증감이 먼저 보이도록 렌더링한다.

## 실행 환경

- Runtime: Python 3.10 이상
- 실행 위치: `/shared/apps/first-free-coupon-monitoring-report`
- 기본 실행: `python3 src/main.py`
- 스케줄: 매일 09:00 KST (`0 9 * * *`)
- `--no-slack` 또는 `--dry-run`: Slack 발송 없이 메시지를 stdout에 출력한다.
- `--report-date YYYY-MM-DD`: KST 기준 닫힌 보고일을 지정한다. 기본값은 실행일 전일이다.

## 주요 파일

- `src/main.py`: BigQuery 조회, Slack 메시지 렌더링, Slack 발송 entrypoint
- `src/summary.sql`: 어제 신규, 누적, 비용/공헌이익 지표
- `src/windows.sql`: 가입 후 D+0/D+1/D+2/D+3/D+7 전환율 지표
- `deploy.yml`: batch 앱 이름, 설명, 매일 09:00 KST 스케줄
- `logs/batch.log`: batch 실행 시작, 완료, 실패 로그

## 환경변수

- `SLACK_BOT_TOKEN`: Slack `chat.postMessage` 호출용 bot token. Slack 발송 실행 시 필수다.
- `FIRST_FREE_COUPON_REPORT_SLACK_CHANNEL`: 리포트를 보낼 채널. 없으면 `PRODUCT_LABS_SLACK_CHANNEL`, `FLARELANE_MONITOR_SLACK_CHANNEL`, `SLACK_CHANNEL`, `C0ARXKB2Y9L` 순서로 사용한다.
- `FIRST_FREE_COUPON_CONTRIBUTION_MARGIN_RATE`: 공헌이익률. 기본값은 `0.30`이다.
- `FIRST_FREE_COUPON_AMOUNT`: 쿠폰 1건당 예산. 기본값은 `20000`이다.
- `FIRST_FREE_COUPON_POLICY_ID`: 쿠폰 정책 ID. 기본값은 `215`다.
- `ENV_FILE`: 공통 환경변수 파일 경로. 기본값은 `/shared/.env`다.

## 실행

```bash
python3 src/main.py --no-slack
python3 src/main.py --no-slack --report-date 2026-05-22
```

## 의존서비스

- Google BigQuery (`covering-app-ccd23`)
- Slack Web API (`chat.postMessage`)

## 지표 기준

- 배정 장부: `product.first_free_coupon_ledger_v1`, user별 최신 row 기준
- 쿠폰 발급: `secure_dataset.user_coupon.coupon_policy_id = 215`, 배정 이후 발급 row 기준
- 쿠폰 사용: `order_v2.user_coupon_id`가 정책 215의 `user_coupon.id`와 연결된 취소되지 않은 주문
- 봉투 신청: `product_code IN ('COVERING_BAG', 'LARGE_COVERING_BAG')`, 취소/삭제 주문 제외
- 수거 신청: `product_type = 'SERVICE'`, 취소/삭제 주문 제외
- 수거 신청 매출: 수거 신청 주문의 PAID receipt 합계
- 쿠폰 사용 예산: `0원 쿠폰 사용 주문 수 * 쿠폰 금액`
- 쿠폰 예산 공헌이익 차감: `쿠폰 사용 예산 * 공헌이익률`
- 순공헌이익: `실험군 수거 신청 매출 * 공헌이익률 - 쿠폰 예산 공헌이익 차감`
- 회차별 전환율 분모: 해당 가입 후 윈도우가 이미 지난 배정자만 포함

## 주의사항

- 고객 식별자, 전화번호, raw user/order row는 저장하거나 출력하지 않는다.
- 운영 Slack 발송은 배포 환경의 스케줄 또는 사람이 명시적으로 실행한 경우에만 발생한다.
