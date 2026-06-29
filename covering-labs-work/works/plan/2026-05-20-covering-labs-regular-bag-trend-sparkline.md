# 일반 커버링 봉투 리포트 추세선 보강

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 완료

## 목표

일반 커버링 봉투 Slack 리포트의 최근 7일 변화 섹션을 값 나열이 아니라 일별 추세가 먼저 보이는 형태로 바꾼다.

## 현황

- 현재 리포트는 최근 7일 값을 순서대로 보여주지만, 방향성과 변곡점을 한눈에 읽기 어렵다.
- 제품팀은 전일 대비뿐 아니라 며칠간의 흐름을 먼저 보고 싶어 한다.

## 구현 계획

- 최근 7일 값으로 sparkline 추세선을 만든다.
- 각 지표 라인은 `추세선 / 시작값 -> 오늘값 / 7일 변화 / 전일 변화` 순서로 보여준다.
- 기존 쿼리와 지표 정의는 유지하고 Slack 렌더링만 바꾼다.

## 변경 파일

- `apps/private/regular-covering-bag-monitoring-report/src/main.py`
- `apps/private/regular-covering-bag-monitoring-report/tests/test_regular_covering_bag_report.py`
- `apps/private/regular-covering-bag-monitoring-report/README.md`

## 완료 기준

- 단위 테스트 통과: `8 passed`
- BigQuery 실데이터 dry-run: `python3 src/main.py --no-slack --report-date 2026-05-18` 성공
- 기존 Slack 스레드를 새 추세선 포맷으로 대체
