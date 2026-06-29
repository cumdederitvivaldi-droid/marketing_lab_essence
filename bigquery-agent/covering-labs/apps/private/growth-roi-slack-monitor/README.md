# Growth ROI Slack Monitor

Growth Marketing ROI 대시보드의 소재별 예산 판단을 `#실험실_notifications`에 보고하는 배치 앱이다.

## 실행

```bash
python3 src/main.py --no-slack
```

## 배포 기준

- 기본 스케줄은 매주 월요일·목요일 09:00 KST다.
- 슬랙 발송은 `SLACK_BOT_TOKEN` 환경변수가 있을 때만 수행한다.
- 기본 채널은 `#실험실_notifications`이며, `GROWTH_ROI_MONITOR_SLACK_CHANNEL`로 바꿀 수 있다.
- 첫 발송은 채널 root message로 만들고, 이후 발송은 상태 파일의 `thread_ts`를 사용해 같은 스레드에 reply로 쌓는다.
- 상태 파일 기본 경로는 `logs/growth_roi_slack_state.json`이고, `GROWTH_ROI_MONITOR_STATE_FILE`로 바꿀 수 있다.
- 고객 식별자, 전화번호, raw audience row는 저장하거나 출력하지 않는다.

## 해석 주의

- 이행 판정은 광고 매체의 실제 예산 설정값이 아니라 BigQuery에 적재된 관측 집행액 변화 기준이다.
- `지침 이행`은 증액 후보의 관측 집행액이 목표 범위로 늘었는지, 감액 후보의 관측 집행액이 줄었는지로 판정한다.
- CAC는 가입 CAC가 아니라 `첫 결제 CAC(D14)`를 본다.
- ARPU는 가입자 기준 `매출 / 가입자 수`로 계산한다.
- 첫 결제자 기준 매출은 `ARPPU`로 분리해 `매출 / 첫 결제자 수`로 계산한다.
- ARPU는 같은 관측기간으로 맞춰 `ARPU D14`와 `ARPU D30`를 함께 본다.
- `CAC·ARPU 최적화 품질`은 소재를 `저CAC·고ARPU·확장가능`, `저CAC·고ARPU·저예산`, `저CAC·고ARPU·증액취약`, `저CAC·저ARPU`, `고CAC·고ARPU`, `고CAC·저ARPU`, `표본부족`으로 나눠 본다.
- 낮은 CAC만으로 증액하지 않는다. ARPU D14/D30, 증액 또는 고지출 구간의 ROAS 내구성, 예산 소진 가능성을 함께 통과해야 한다.
- `결과`는 다음 주기 첫 결제 CAC D14 유지/하락, ARPU D14 동반, 결제자 수 변화를 함께 본다.
