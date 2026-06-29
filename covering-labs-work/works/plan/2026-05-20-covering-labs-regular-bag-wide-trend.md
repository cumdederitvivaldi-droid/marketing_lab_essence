# 일반 커버링 봉투 리포트 추세선 확대

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 완료

## 목표

일반 커버링 봉투 Slack 리포트의 최근 7일 추세선을 더 길고 눈에 띄는 형태로 바꾼다.

## 현황

- 현재 추세선은 7개 문자로만 표시되어 Slack 스레드에서 눈에 잘 들어오지 않는다.
- Slack은 글자 크기를 직접 키울 수 없으므로, 각 일자를 여러 칸의 블록으로 확장해 가시성을 높인다.

## 구현 계획

- sparkline의 각 일별 포인트를 4칸짜리 블록으로 표시한다.
- 날짜 사이에는 공백을 둬 7개 날짜 구간이 분리되어 보이게 한다.
- 누락값은 같은 폭의 `----`로 표시해 7일 축을 유지한다.

## 변경 파일

- `apps/private/regular-covering-bag-monitoring-report/src/main.py`
- `apps/private/regular-covering-bag-monitoring-report/tests/test_regular_covering_bag_report.py`
- `apps/private/regular-covering-bag-monitoring-report/README.md`

## 완료 기준

- 단위 테스트 통과: `8 passed`
- BigQuery 실데이터 dry-run: `python3 src/main.py --no-slack --report-date 2026-05-19` 성공
- 기존 Slack 스레드가 긴 추세선 포맷으로 교체됨
