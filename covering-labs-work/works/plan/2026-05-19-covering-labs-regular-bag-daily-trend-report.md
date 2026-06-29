# 일반 커버링 봉투 리포트 일별 변화 보강

> 유형: 플랜
> 작성일: 2026-05-19
> 상태: 완료

## 목표

일반 커버링 봉투 Slack 리포트가 단일 일자 수치와 1주전/30일전 비교에 머무르지 않고, 제품팀이 매일의 변화 방향을 바로 볼 수 있게 한다.

## 현황

- 운영 배치 `regular-covering-bag-monitoring-report`는 매일 09:00 KST에 `제품팀_data`로 발송된다.
- 기존 리포트는 `현재값 / 1주전 / 30일전` 비교 중심이라 전일 대비 변화와 최근 며칠의 흐름을 바로 읽기 어렵다.

## 구현 계획

- 핵심 지표 쿼리에 전일 값과 최근 7일 값을 추가한다.
- Slack 루트 메시지에 전일 대비 핵심 변화를 표시한다.
- 상세 메시지 상단에 최근 7일 변화 섹션을 추가한다.
- 기존 지표 라인에는 `전일 / 1주전 / 30일전` 비교를 함께 표시한다.

## 변경 파일

- `apps/private/regular-covering-bag-monitoring-report/src/main.py`
- `apps/private/regular-covering-bag-monitoring-report/tests/test_regular_covering_bag_report.py`
- `apps/private/regular-covering-bag-monitoring-report/README.md`

## 완료 기준

- 단위 테스트 통과: `7 passed`
- BigQuery 실데이터 dry-run: `python3 src/main.py --no-slack --report-date 2026-05-18` 성공
- 최근 7일 변화는 데이터가 비는 날짜도 7일 날짜축을 유지한다.
- Slack 수동 발송 없이 메시지 형태 확인 완료
