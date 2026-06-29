# FlareLane 라이브 실험 슬랙 모니터링 플랜

> 유형: 플랜
> 작성일: 2026-05-03
> 상태: 완료

## 목표

친구초대 실험과 첫 봉투 구매 후 미수거신청 D+3/D+8 여정을 사람이 수동 확인하지 않아도 매일 09:00 KST에 슬랙으로 확인할 수 있게 한다.

## 현황 분석

- ENG-1559 전용 모니터는 있었지만 이번 운영 판단에는 친구초대와 첫 봉투 D+3/D+8 여정만 필요하다.
- live bearer가 서버 환경에 없으면 친구톡 sent/click을 볼 수 없다.
- product-labs에는 활성 실험 인벤토리와 BigQuery 장부가 생겼지만, 새 실험 제안 단계에서 슬랙 모니터링 연결을 필수로 보지는 않았다.
- 일별 코호트만 나열하면 전체 방향을 한눈에 보기 어렵다.

## 구현 계획

- `apps/private/flarelane-live-monitoring` 배치 앱을 친구초대와 첫 봉투 D+3/D+8 전용 모니터로 둔다.
- 기본 스케줄은 매일 09:00 KST로 둔다.
- 기본 슬랙 채널은 `#실험실_notifications`로 둔다. 단, 서버에 `FLARELANE_MONITOR_SLACK_CHANNEL`이 있으면 그 값을 우선한다.
- FlareLane live bearer가 있으면 실시간 친구톡 카운터를 함께 보고, 없으면 BigQuery 기준 배정/쿠폰/재주문만 보고한다.
- 친구초대는 최신 코호트 배정, 초대자 화면, 공유/복사, 피초대자 화면, 가입 CTA, Airbridge 가입, 쿠폰 발급을 보여준다.
- 첫 봉투 D+3/D+8은 product-labs 상태, live counter, D+3 BQ proxy 전환율, 05/12 readout 기준을 보여준다.
- 전체 live/주의 실험 인벤토리는 본문에 올리지 않는다.
- product-labs governance 자동화는 이번 배치의 후속 범위로 남기고, 이번 PR은 covering-labs 배치 추가와 검증에 한정한다.

## 완료 기준

- [x] 배치 앱이 `--no-slack`으로 로컬 리포트를 출력한다.
- [x] 슬랙 토큰과 채널은 환경변수에서만 읽는다.
- [x] FlareLane live bearer 미설정 시에도 BigQuery 기준 보고가 가능하다.
- [x] Slack 본문이 친구초대와 첫 봉투 D+3/D+8 두 묶음만 출력한다.
- [x] covering-labs 배치 로그가 `logs/batch.log`에 시작, 종료, 핵심 조회 결과를 남긴다.
- [x] crontab 실행 환경에서 `/shared/.env`를 로드한다.

## 변경 파일

- `apps/private/flarelane-live-monitoring/deploy.yml`
- `apps/private/flarelane-live-monitoring/.gitignore`
- `apps/private/flarelane-live-monitoring/requirements.txt`
- `apps/private/flarelane-live-monitoring/README.md`
- `apps/private/flarelane-live-monitoring/src/config.py`
- `apps/private/flarelane-live-monitoring/src/main.py`
- `works/plan/2026-05-03-covering-labs-flarelane-live-slack-monitoring.md`

## 검증 기준

- Python 문법 검사
- `--no-slack` 실제 BigQuery 조회
- 배치 로그 파일 생성 및 성공 마커 확인

## 검증 결과

- `python3 -m py_compile apps/private/flarelane-live-monitoring/src/main.py` 통과
- `python3 apps/private/flarelane-live-monitoring/src/main.py --no-slack` 통과
  - Slack 본문 대상이 친구초대 실험과 첫 봉투 D+3/D+8 여정으로 제한됨
  - FlareLane live bearer 미설정 상태에서 BQ 기준 친구초대 퍼널과 D+3 전환 proxy fallback 확인
