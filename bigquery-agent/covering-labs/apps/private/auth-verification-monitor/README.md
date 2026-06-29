# auth-verification-monitor

인증번호 퍼널 실험을 `#실험실_notifications`에서 보도록 만든 Slack 모니터 batch 앱입니다.

## 목적

- 매일 `09:00`, `18:00 KST`에 인증번호 퍼널 상태를 Slack으로 보냅니다.
- 최근 3일 완결 구간과 직전 7일을 비교해 상승 신호가 있는지 바로 봅니다.
- Grafana가 일시적으로 안 열려도 BigQuery 기준 숫자를 Slack에서 확인할 수 있게 합니다.

## 기준

- 분모: `[ROUTE] AuthPhoneScreen`을 본 device_id
- 호출 성공 proxy: `[ROUTE] AuthCodeScreen`에 도달한 device_id
- 인증 완료: `[CLICK] AuthCode_completeButton`을 누른 device_id
- 오늘 데이터는 미완결이라 제외합니다.

인증번호 요청 클릭 이벤트가 별도로 없어서, 인증번호 입력 화면 도달을 호출 성공 proxy로 둡니다.

## 환경변수

- `SLACK_BOT_TOKEN`: 필수. Slack 봇 토큰입니다.
- `AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL`: 선택. 기본값은 `#실험실_notifications`입니다.
- `AUTH_VERIFICATION_MONITOR_LOOKBACK_DAYS`: 선택. 기본값은 `30`입니다.
- `BQ_BIN`: 선택. BigQuery CLI 경로입니다.
- `ENV_FILE`: 선택. 기본값은 `/shared/.env`입니다.

## 실행

```bash
python3 src/main.py --dry-run
python3 src/main.py
```

`--dry-run`은 Slack에 보내지 않고 본문만 출력합니다.
