# Regular Covering Bag Monitoring Report

일반 커버링 봉투 핵심 지표를 매일 `#제품팀_data`에 보고하는 private batch 앱이다.

## 목적

Grafana `일반 커버링 봉투 모니터링` 대시보드의 핵심 신호를 매일 오전 9시에 요약한다. 보고 초점은 일반 봉투 구매가 일반 수거, 반복 이용, M1 후속 결제, 대형폐기물/대형 커버링 봉투 크로스셀로 이어지는지와 핵심 지표가 전일/최근 7일 흐름에서 어떻게 바뀌었는지다.

## 실행 환경

- Runtime: Python 3.11 이상
- 실행 위치: `/shared/apps/regular-covering-bag-monitoring-report`
- 기본 실행: `python3 src/main.py`
- 스케줄: 매일 09:00 KST (`0 9 * * *`)
- `--no-slack` 또는 `--dry-run`: Slack 발송 없이 메시지를 stdout에 출력하고 상태 파일을 갱신하지 않는다.
- `--report-date YYYY-MM-DD`: KST 기준 닫힌 보고일을 지정한다.

## 주요 파일

- `src/main.py`: BigQuery 조회, Slack 메시지 렌더링, Slack 발송, 마지막 발송 상태 갱신 entrypoint
- `src/config.py`: `/shared/.env`와 앱 로컬 `.env` 환경변수 로더
- `deploy.yml`: batch 앱 이름, 설명, 매일 09:00 KST 스케줄
- `logs/regular_covering_bag_report_state.json`: Slack 마지막/최근 발송 상태 파일
- `logs/batch.log`: batch 실행 시작, 완료, 실패 로그
- `tests/test_regular_covering_bag_report.py`: 메시지 포맷 단위 테스트

## 환경변수

- `SLACK_BOT_TOKEN`: Slack `chat.postMessage` 호출용 bot token. Slack 발송 실행 시 필수다.
- `REGULAR_BAG_REPORT_SLACK_CHANNEL`: 리포트를 보낼 채널. 기본값은 `C0A198Z0P2N` (`#제품팀_data`)다.
- `REGULAR_BAG_REPORT_STATE_FILE`: Slack 발송 상태 파일 경로. 기본값은 `logs/regular_covering_bag_report_state.json`이다.
- `ENV_FILE`: 공통 환경변수 파일 경로. 기본값은 `/shared/.env`다.

## 실행

```bash
python3 src/main.py --no-slack
python3 src/main.py --no-slack --report-date 2026-05-18
```

## 지표 기준

- 일반 커버링 봉투 신청: `product_code = 'COVERING_BAG'`, 취소/삭제 주문 제외
- 일반 수거 신청: `product_code = 'PICKUP_COVERING_BAG'`, `payment_policy_id IS NOT NULL`, 취소/삭제 주문 제외
- 일별 변화: 핵심 지표별 최근 7일 확장 추세선, 시작값/오늘값, 7일 변화, 전일 대비 변화를 함께 표시
- 수거 지연율: `scheduled_end_at`의 KST 날짜 오전 7시 이후 완료된 일반 수거 주문 비율
- 완료시각 p90: `scheduled_end_at` 날짜 00:00부터 완료까지 걸린 시간 p90
- 구매 후 미사용률: 첫 일반 봉투 구매 후 D30 안에 일반 수거 신청이 없는 유저 비율
- D30 재구매율/재수거율: 첫 일반 봉투 구매 후 30일 안에 추가 일반 봉투 구매 또는 일반 수거 2회 이상이 발생한 유저 비율
- M1 후속 결제: 첫 일반 봉투 구매 후 31~60일 SERVICE PAID receipt 매출 및 결제율
- 크로스셀: 첫 일반 봉투 구매 후 D30 안 대형폐기물(`PICKUP_BOX`) 또는 대형 커버링 봉투(`LARGE_COVERING_BAG`, `PICKUP_LARGE_COVERING_BAG`) 구매/신청 전환율

## 주의사항

- 레거시 주문 테이블을 쓰지 않는다.
- 고객 식별자, 전화번호, raw order row는 저장하거나 출력하지 않는다.
- `--no-slack` 검증은 실제 Slack 발송과 상태 파일 갱신을 하지 않는다.
- 운영 Slack 발송은 배포 환경의 스케줄 또는 사람이 명시적으로 실행한 경우에만 발생한다.
