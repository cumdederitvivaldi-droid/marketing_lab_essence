# 인증번호 퍼널 Slack 모니터 작업 보고서

> 유형: 분석
> 작성일: 2026-04-27
> 상태: 완료

## 목적

인증번호 퍼널 실험을 Grafana 대시보드만으로 보지 않고 `#실험실_notifications` Slack 알림에서 주기적으로 확인할 수 있게 한다.

## 상태

- `apps/private/auth-verification-monitor` batch 앱을 추가했다.
- 기본 발송 채널은 `#실험실_notifications`이고, `AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL`로 변경할 수 있다.
- 실제 Slack 발송과 배포는 실행하지 않았다.

## 모니터링 기준

- 분모: `[ROUTE] AuthPhoneScreen`을 본 device_id
- 인증번호 호출 성공 proxy: `[ROUTE] AuthCodeScreen`에 도달한 device_id
- 인증 완료: `[CLICK] AuthCode_completeButton`을 누른 device_id
- 오늘 데이터는 미완결 구간으로 제외한다.
- 최근 3일 전체 인증 전환율과 직전 7일 전체 인증 전환율 차이가 `+0.30%p` 이상이면 상승 신호, `-0.30%p` 이하이면 하락 주의, 그 외는 변화 없음으로 표시한다.

## 검증

- `python3 -m py_compile apps/private/auth-verification-monitor/src/main.py`
- `python3 apps/private/auth-verification-monitor/src/main.py --dry-run`

Dry-run 결과:

- 상태: 변화 없음 `+0.26%p`
- 최근 3일 퍼널: `8,463명 -> 8,092명 -> 7,932명`
- 최근 3일 전체 인증 전환율: `93.73%`
- 직전 7일 전체 인증 전환율: `93.47%`
- 인증번호 입력 화면 도달률: `95.62%`
- 인증 완료율: `98.02%`

## 남은 작업

- 배포 전 `SLACK_BOT_TOKEN`과 필요 시 `AUTH_VERIFICATION_MONITOR_SLACK_CHANNEL`을 배치 실행 환경에 설정한다.
- 사람이 배포한 뒤 첫 수신 메시지가 `#실험실_notifications`에 표시되는지 확인한다.
