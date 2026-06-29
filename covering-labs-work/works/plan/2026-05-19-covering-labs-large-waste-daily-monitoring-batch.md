# 대형폐기물 일일 모니터링 배치 플랜

유형: 플랜
작성일: 2026-05-19
상태: 검토중

## 목표

제품팀 KR1인 `MAU 대비 대형폐기물 D30 이용률 13%`를 매일 확인하고, 대커봉 구매 맥락, 대형폐기물 이용 맥락, 일반 커버링 봉투 신청 맥락, 생쓰 주문 맥락, 수거 실패와 오전 7시 이후 수거율을 `제품팀_data` 채널에서 같이 판단할 수 있게 합니다.

## 현황 분석

Grafana 대형 폐기물 모니터링 대시보드는 이미 운영 중이며, 수거 지연 기준은 예정일 T+0 미완료율이 아니라 기사 실제 수거 시각인 `fulfillment.completed_at` 기준 오전 7시 이후 수거율입니다. 초기 배치의 `대커봉 기능 맥락` 표기가 대형폐기물 수거 상품인 `PICKUP_LARGE_COVERING_BAG`와 섞였으므로, 대커봉 구매 `LARGE_COVERING_BAG`와 대형폐기물 이용 `PICKUP_LARGE_COVERING_BAG`를 분리합니다.

## 구현 계획

새 private batch 앱 `large-waste-monitoring-report`를 추가합니다. 실행 스케줄은 매일 09:00 KST이고, 기본 발송 채널은 `C0A198Z0P2N`입니다.

포함 지표는 다음 기준으로 계산합니다.

- KR1: 최근 30일 PAID 서비스 MAU 중 `PICKUP_LARGE_COVERING_BAG` 결제 유저 비율
- 첫 결제 구성: 최근 30일 첫 PAID 서비스 결제자 중 첫 결제가 `PICKUP_LARGE_COVERING_BAG`인 유저 비중
- 이용자 mix ARPU: 최근 30일 생쓰만 이용자, 대폐만 이용자, 생쓰+대폐 이용자의 ARPU와 생쓰만 대비 증가액/증가율/배수 비교
- 대커봉 구매 맥락: `LARGE_COVERING_BAG` 포함 유료 주문
- 대형폐기물 이용 맥락: `PICKUP_LARGE_COVERING_BAG` 포함 유료 주문
- 일반 커버링 봉투 신청 맥락: `COVERING_BAG` 포함 유료 주문
- 생쓰 주문 맥락: `PICKUP_COVERING_BAG` 포함 유료 주문
- 크로스셀: 첫 결제 서비스 유형별 D30 내 반대 서비스 결제 전환
- 운영 가드레일: `fulfillment.completed_at` 실제 완료 시각 기준 오전 7시 이후 수거율, 실패율, 실패 사유 비중

## 완료 기준

- `deploy.yml`에 매일 09:00 KST batch 스케줄을 정의했습니다.
- `src/main.py --no-slack --report-date 2026-05-18`가 BigQuery 조회와 리포트 생성을 완료했습니다.
- Grafana `대형 폐기물 모니터링` 대시보드는 version 128에서 패널 9529, 34를 `scheduled_end_at` 기준이 아니라 `completed_at` 실제 수거 시각 기준으로 정정했습니다.
- 2026-05-19 10:58 KST에 `제품팀_data`로 수동 발송한 Slack 스레드는 같은 ts에서 정정 업데이트했습니다.
- 생성된 로컬 Markdown 리포트는 Mark로 열어 확인했습니다.
- 커버링 랩스 실행은 PR 병합 후 GitHub Actions 배포와 private VM dry-run으로 최종 확인합니다.

## 변경 파일

- `apps/private/large-waste-monitoring-report/deploy.yml`
- `apps/private/large-waste-monitoring-report/requirements.txt`
- `apps/private/large-waste-monitoring-report/.gitignore`
- `apps/private/large-waste-monitoring-report/README.md`
- `apps/private/large-waste-monitoring-report/src/main.py`
- `apps/private/large-waste-monitoring-report/src/metric_context.sql`
- `apps/private/large-waste-monitoring-report/src/daily_ops.sql`

## 검증 결과

- `python3 -m py_compile src/main.py`: 통과
- `python3 -m pip install --dry-run -r requirements.txt`: 통과, `protobuf 6.33.6` 해석 확인
- `bq query --use_legacy_sql=false --parameter=report_date:DATE:2026-05-18 --dry_run < src/metric_context.sql`: 통과, 예상 처리량 186.1MB
- `bq query --use_legacy_sql=false --parameter=report_date:DATE:2026-05-18 --dry_run < src/daily_ops.sql`: 통과, 예상 처리량 341.4MB
- `python3 src/main.py --no-slack --report-date 2026-05-18`: 통과, 28개 지표 row 생성, Slack 발송 생략, 완료 15.8초
- Grafana 패널 9529 dry-run: 통과, 예상 처리량 223.6MB
- Grafana 패널 34 dry-run: 통과, 예상 처리량 592.9MB

## 배포 상태

PR #302로 최초 배치는 main에 병합되어 `/shared/apps/large-waste-monitoring-report`와 `0 9 * * *` cron까지 배포됐습니다. 2026-05-19 후속 수정은 대커봉 구매와 대형폐기물 이용 분리, 오전 7시 이후 수거율의 실제 수거 시각 기준 보강, Slack 정정 메시지 반영입니다. 2026-05-20 후속 수정은 첫 결제자 중 대형폐기물 비중, 이용자 mix ARPU 비교, 생쓰만 대비 ARPU 증가액/증가율/배수를 추가합니다.
