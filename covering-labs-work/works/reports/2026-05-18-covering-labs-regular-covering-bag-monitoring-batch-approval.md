# 일반 커버링 봉투 모니터링 배치 반영 승인 리포트

> 유형: 분석
> 작성일: 2026-05-18
> 상태: 승인 후 구현 반영

## 결론

일반 커버링 봉투 Grafana 대시보드는 생성, 저장, 쿼리 검증까지 완료했다. 2026-05-19 사용자 승인 후 covering-labs private batch 앱도 반영했다.

배치는 AARRR 데이터 리포트 배치와 같은 private batch 구조로 `apps/private/regular-covering-bag-monitoring-report`에 만들었다. 스케줄은 매일 09:00 KST이고, 기본 발송 채널은 `#제품팀_data`다.

## Grafana 생성 결과

- 대시보드: 일반 커버링 봉투 모니터링
- URL: https://grafana.covering.app/d/regular-covering-bag-monitoring/b176239
- UID: `regular-covering-bag-monitoring`
- 폴더: Product
- 패널 수: 20개
- 저장 버전: v4

검증 결과는 정상이다.

- Grafana validator: PASS
- BigQuery dry-run: 전체 SQL 통과
- Grafana datasource query: 핵심 패널 실행 성공
- Time Picker 경고: 의도된 경고다. 각 패널은 대시보드 시간 선택값이 아니라 SQL 안에서 KST 기준 최근 30일, 60일, 90일, 180일 window를 고정해 본다.

## 최상단 P0 패널 순서

Grafana API로 저장된 패널 순서를 확인했다. 최상단에는 핵심 지표만 배치했다.

1. `[P0] 일반 커버링 봉투 신청 전환율 (일별)`
2. `[P0] 일반 커버링 봉투 신청량 / 신청자 (일별)`
3. `[P0] 일반 수거 신청량 / 신청자 (일별)`
4. `[P0] 일반 수거 지연율: 오전 7시 이후 수거율 (일별)`

그 아래에는 cohort, 반복 이용, 후속 결제, 크로스셀, 매출, 운영 품질 패널을 배치했다.

1. 가입 후 D1 첫 일반 봉투 신청율
2. 첫 일반 봉투 신청 후 일반 수거 D7/D14/D30 전환율
3. 첫 일반 봉투 구매 후 미사용률
4. 첫 일반 봉투 구매자의 D30 재구매율 / 재수거율
5. 일반 수거 완료 시각 p50/p75/p90
6. 첫 일반 봉투 구매자의 대폐 / 대커봉 D30 크로스셀 전환율
7. 서비스 MAU 중 일반 수거 D30 이용률
8. 일반 수거 매출, AOV, ARPU
9. 일반 봉투 유저 vs 비사용 유저 서비스 ARPU 비교
10. 첫 일반 봉투 구매자의 M1 후속 결제
11. 일반 수거 실패율
12. 일반 수거 실패 사유 비중
13. 일반 수거 취소율

## 핵심 지표 정의

일반 커버링 봉투 신청은 `order_v2`, `order_line`, `product` 기준으로 `product_code = 'COVERING_BAG'`인 주문을 본다. 취소 주문과 삭제 주문은 제외한다.

일반 수거 신청은 `product_code = 'PICKUP_COVERING_BAG'`이고 `payment_policy_id`가 있는 주문을 본다. 취소 주문과 삭제 주문은 제외한다.

신청 전환율은 Mixpanel 화면 진입 이벤트를 분모로 두고, 같은 날 일반 커버링 봉투 신청을 분자로 둔다. 현재 포함한 진입 화면은 `CoveringBagOfferScreen`, `CoveringBagGuideScreen`, `CoveringBagSelectScreen`, `ProductPurchaseScreen`의 일반 봉투 구매 화면 진입이다.

수거 지연율은 T+0 23:59 미완료율이 아니다. 잔존율도 보지 않는다. 일반 수거 fulfillment는 보통 전날 22:00부터 예정일 06:00까지의 window라 `scheduled_end_at`의 KST 날짜를 예정일로 본다. 이 예정일 오전 7시 이후에 완료된 일반 수거 주문 비율만 본다. 값이 높을수록 좋지 않은 지표다.

실패율은 최종 fulfillment가 실패이고 완료 이력이 없는 일반 수거 주문 비율이다. 실패 사유는 정책 문제, 진입 문제, 미발견, 기타로 묶었다.

매출, AOV, ARPU는 `order_invoice`, `invoice`, `receipt`의 `PAID` receipt 기준으로 계산한다.

## 배치 반영 결과

생성한 앱은 private batch 앱이다.

- 앱 위치: `apps/private/regular-covering-bag-monitoring-report`
- 앱 타입: `batch`
- 실행 명령: `python3 src/main.py`
- 스케줄: `0 9 * * *`
- 실행 기준: 매일 09:00 KST
- 기본 채널: `#제품팀_data`
- 로컬 검증 모드: `python3 src/main.py --no-slack`

`deploy.yml`은 아래 형태로 둘 계획이다.

```yaml
name: regular-covering-bag-monitoring-report
description: "일반 커버링 봉투 모니터링 Slack 리포트 - 매일 09:00 KST 실행"
type: batch
schedule: "0 9 * * *"
command: "python3 src/main.py"
```

리포트는 Slack 1회 발송당 새 스레드 1개로 구성한다.

- 루트 메시지: 전일 기준 결론 1줄, 봉투 신청량, 일반 수거 신청량, 오전 7시 이후 수거율, M1 후속 결제
- 상세 reply: 1주전/30일전 대비 변화, 전환/반복, 수익성/M1, 크로스셀, 운영 품질
- 링크: Grafana 대시보드 URL
- 상태 파일: 마지막 발송일, root timestamp, detail timestamp
- 안전장치: `--no-slack`에서는 Slack 발송과 상태 파일 갱신을 하지 않음

## 검증 결과

- Grafana validator: PASS
- 신규 패널 BigQuery dry-run: PASS
- 배치 Python compile: PASS
- 배치 단위 테스트: `4 passed`
- 배치 `--no-slack --report-date 2026-05-18`: PASS
- 실제 Slack 발송: 미실행
- 배포/cron 등록: 미실행

## 남은 실행

코드는 반영됐지만 실제 Slack 발송과 배포/cron 등록은 아직 실행하지 않았다. 배포까지 진행하려면 아래 순서로 실행한다.

1. `python3 src/main.py --no-slack`으로 최신 보고일 dry-run 재확인
2. `REGULAR_BAG_REPORT_SLACK_CHANNEL=C0A198Z0P2N python3 src/main.py --report-date YYYY-MM-DD`로 1회 수동 발송
3. covering-labs 배포 절차로 `regular-covering-bag-monitoring-report` 배포
4. crontab에 `0 9 * * *` 등록됐는지 확인

Slack 실발송과 배포/cron 등록은 운영 실행이므로 이 문서에서는 실행하지 않고 남겨둔다.
