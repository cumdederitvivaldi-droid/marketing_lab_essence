# 대형폐기물 일일 모니터링 리포트

대형폐기물 KR1과 대커봉 구매 맥락을 매일 오전 9시에 `제품팀_data` 채널로 보내는 private batch입니다.

## 실행 기준

- 실행 위치: `apps/private/large-waste-monitoring-report`
- 스케줄: 매일 09:00 KST
- 채널 기본값: `C0A198Z0P2N` (`제품팀_data`)
- 기준일 기본값: 실행일 전일 KST
- Grafana: `https://grafana.covering.app/d/4b064546-09fd-475a-83de-bfd07ded7072/87fb26e`

## 포함 지표

- 제품팀 KR1: MAU 대비 대형폐기물 D30 이용률, 목표 13%
- 첫 결제 구성: 최근 30일 첫 PAID 서비스 결제자 중 첫 결제가 `PICKUP_LARGE_COVERING_BAG`인 유저 비중
- 이용자 mix ARPU: 최근 30일 생쓰만 이용자, 대폐만 이용자, 생쓰+대폐 이용자의 ARPU와 생쓰만 대비 증가액/증가율/배수 비교
- 대커봉 구매 맥락: `LARGE_COVERING_BAG` 결제 유저, 결제 건수, 매출, 객단가, M1 후속 결제
- 대커봉→대폐 D7 전환: `LARGE_COVERING_BAG` 신청자 코호트의 D7 내 `PICKUP_LARGE_COVERING_BAG` 결제 전환율과 대폐 결제 객단가
- 대형폐기물 이용 맥락: `PICKUP_LARGE_COVERING_BAG` 결제 유저, 결제 건수, 매출, 객단가, M1 후속 결제
- 일반 커버링 봉투 신청 맥락: 결제 유저, 결제 건수, 매출, 객단가, M1 후속 결제
- 생쓰 주문 맥락: 결제 유저, 결제 건수, 매출, 객단가, M1 후속 결제
- 크로스셀: 첫 결제 생쓰 유저의 대폐 D30 전환율, 첫 결제 대폐 유저의 생쓰 D30 전환율
- 운영 가드레일: 수거 실패율, 실제 기사 수거 시각 기준 오전 7시 이후 수거율, 실패 사유 비중

## 로컬 검증

```bash
cd apps/private/large-waste-monitoring-report
python3 src/main.py --no-slack --report-date 2026-05-18
```

`--no-slack`은 Slack 발송 없이 `logs/latest-report.md`와 `logs/report-YYYY-MM-DD.md`만 생성합니다.

## 환경변수

- `SLACK_BOT_TOKEN`: Slack 발송 토큰
- `LARGE_WASTE_REPORT_SLACK_CHANNEL`: 발송 채널. 없으면 `C0A198Z0P2N`
- `LARGE_WASTE_REPORT_DASHBOARD_URL`: Grafana URL override
- `ENV_FILE`: 기본 `/shared/.env`
