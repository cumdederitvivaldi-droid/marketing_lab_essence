# Growth ROI Slack Monitor Plan

> 유형: PRD | 플랜
> 작성일: 2026-05-03
> 상태: 완료

## 목표

Growth Marketing ROI 대시보드의 소재별 예산 판단을 `#실험실_notifications`에 주기적으로 보고하고, 같은 Slack 스레드에 다음 주기 이행 여부와 성과를 누적한다.

## 현황 분석

- Growth Marketing ROI 대시보드는 모든 비용 소재의 예산, 첫 결제 CAC(D14), 가입자 기준 ARPU D14/D30, 첫 결제자 ARPPU, 다음 예산 행동을 계산해야 한다.
- 사용자는 단순 추천이 아니라 추천 근거, 실행 여부, 실행했을 때와 하지 않았을 때의 결과 차이를 보고 승인하고 싶어 한다.
- 광고 매체 예산 설정값은 BigQuery에 없어서, 초기 이행 판정은 `daily_cost_creative`의 관측 집행액 변화로 본다. 실제 예산 변경 여부는 수행자 코멘트나 광고 매체 API 연동 전까지 확정할 수 없다.

## 구현 계획

### 단계별 작업

1. `apps/private/growth-roi-slack-monitor`로 batch 앱을 이동한다.
2. D14/D30 관측이 끝난 코호트 기준 소재 원장 SQL을 BigQuery에서 조회한다.
3. Slack 메시지에 증액/감액 추천, 추천 근거, 반증 조건, 다음 승인 요청을 함께 넣는다.
4. 첫 실행은 채널 root message를 만들고 `thread_ts`를 상태 파일에 저장한다.
5. 이후 실행은 같은 `thread_ts`로 reply를 쌓는다.
6. 이전 주기의 추천안을 상태 파일에 저장하고, 다음 실행에서 관측 집행액 변화와 첫 결제 CAC D14, 가입자 기준 ARPU D14 변화를 비교해 이행 여부를 판정한다.

## 완료 기준

- 배치 앱이 `--no-slack`으로 실제 BigQuery 조회와 메시지 렌더링을 통과한다.
- Slack 토큰과 채널은 환경변수에서만 읽는다.
- 운영 Slack 메시지 직접 발송과 광고 예산 변경은 실행하지 않는다.
- 고객 식별자, 전화번호, raw audience row를 저장하거나 출력하지 않는다.

## 범위

- 포함: Slack 리포트 생성, 스레드 상태 저장 로직, 이전 추천 이행 판정, dry-run 검증.
- 제외: 광고 예산 변경, 매체 API 호출, 수동 Slack 발송.

## 검증 기준

- `python3 -m py_compile apps/private/growth-roi-slack-monitor/src/main.py`
- `python3 apps/private/growth-roi-slack-monitor/src/main.py --no-slack`
- 출력 메시지에 추천 근거, 이행 판정 기준, 다음 주기 검증 기준이 포함되는지 확인한다.

## 변경한 파일

- `apps/private/growth-roi-slack-monitor/deploy.yml`
- `apps/private/growth-roi-slack-monitor/requirements.txt`
- `apps/private/growth-roi-slack-monitor/README.md`
- `apps/private/growth-roi-slack-monitor/src/main.py`
- `works/plan/2026-05-03-covering-labs-growth-roi-slack-monitor.md`

## 검증 결과

- `bq show`로 `daily_cost_creative`, `app_events`, `order_v2`, `order_invoice`, `receipt`, `order_line`, `product` 스키마를 확인했다.
- `python3 -m py_compile apps/private/growth-roi-slack-monitor/src/main.py` 통과.
- `python3 apps/private/growth-roi-slack-monitor/src/main.py --no-slack` 통과.
  - 보고 기준일 2026-05-02 KST, D14 코호트 2026-03-20~2026-04-18, D30 코호트 2026-03-04~2026-04-02 기준으로 렌더링했다.
  - D14 관측 가능 코호트 기준 광고비 39,299만원, 가입 30,508명, 첫 결제자 5,617명, D14 매출 14,401만원.
  - 평균 첫 결제 CAC D14 69,975원, 가입자 기준 ARPU D14 4,722원, 첫 결제자 ARPPU D14 25,646원.
  - 월요일·목요일 09:00 KST 실행 스케줄 `0 9 * * 1,4`를 설정했다.
  - 10~20% 증액 2개, 5~10% 증액 5개, 소액 증액 관측 14개, 감액/중단 검토 160개를 Slack 메시지 형식으로 렌더링했다.
- `CAC·ARPU 최적화 품질` 섹션을 추가해 소재를 `저CAC·고ARPU·확장가능`, `저CAC·고ARPU·저예산`, `저CAC·고ARPU·증액취약`, `저CAC·저ARPU`, `고CAC·고ARPU`, `고CAC·저ARPU`, `표본부족`으로 나눠 렌더링했다.
  - 확장 가능/저예산 기회 예산 11,312만원, 증액취약·CAC착시·고CAC 재구조화 예산 22,869만원으로 표시된다.
  - 놓친 확장 기회, 증액하면 깨질 수 있는 후보, CAC 착시 후보, 감액 우선 후보를 Top 리스트로 함께 보여준다.
- 검증용 상태 파일로 두 번째 실행을 재현해 `지난 지침 이행 여부` 섹션이 렌더링되는 것을 확인했다.
- 기본 `--no-slack` 실행은 `logs/growth_roi_slack_state.json`을 만들지 않는 것을 확인했다.

## 남은 리스크

- 관측 집행액 증감은 실제 예산 변경의 proxy다. 매체 예산 cap, 입찰 제한, 노출 손실은 광고 플랫폼 원천이 붙기 전까지 확정 근거로 쓰지 않는다.
- 첫 실행에는 이전 기준선이 없으므로 이행 판정은 다음 실행부터 가능하다.
- 실제 Slack 메시지를 수동 발송하지는 않았다. 머지 후 자동 배포가 성공하고 배포 환경에 `SLACK_BOT_TOKEN`과 필요 시 `GROWTH_ROI_MONITOR_SLACK_CHANNEL`이 있으면 월요일·목요일 09:00 KST부터 Slack 스레드에 쌓인다.
