# AARRR 데이터 Slack 리포트 플랜

> 유형: 플랜
> 작성일: 2026-05-08
> 상태: 완료

## 목표

`#제품팀_data`에 AARRR 핵심 데이터 리포트를 발송 1회당 새 스레드로 남기는 private batch 앱을 추가한다.

## 현황 분석

Grafana AARRR 패널이 많아져 슬랙에서는 전체 패널을 옮기기보다 PO가 바로 볼 성장 신호, 경고 신호, 오늘 볼 세그먼트가 필요하다.

기존 `growth-roi-slack-monitor`는 같은 채널에 스레드형 리포트를 쌓는 구조를 이미 사용한다. 이번 앱은 그 운영 방식을 재사용하되 AARRR 전체 흐름, 서비스 세그먼트, 유입 품질, M1 리텐션을 보고한다.

## 구현 계획

### 단계별 작업

- [x] `apps/private/aarrr-data-slack-report` batch 앱 추가
- [x] 신규 주문 도메인 기준으로 AARRR 집계 SQL 작성
- [x] Slack 본문을 표가 아니라 막대, 퍼널, 전후 비교 형태로 렌더링
- [x] 발송 1회당 root 1줄과 상세 reply 상태 파일 구현
- [x] README, deploy.yml, tests 추가
- [x] CodeRabbit 수정 요청 반영: README 필수 섹션, requirements 버전 고정, 공통 env loader, batch logging, atomic state write, channel-aware thread state

## 완료 기준

- [x] `python3 -m py_compile` 통과
- [x] `pytest` 통과
- [x] 실제 BigQuery dry-run 메시지 렌더링 통과
- [x] 실제 Slack 발송 없이 `--no-slack` 검증

## 운영 기준

- 기본 채널은 `C0A198Z0P2N` (`#제품팀_data`)
- 기본 스케줄은 평일 09:10 KST
- `SLACK_BOT_TOKEN`이 없으면 발송하지 않고 실패한다
- `--no-slack`은 메시지만 출력하고 상태 파일을 갱신하지 않는다
- `logs/batch.log`에 시작, 완료, 실패 로그를 남긴다
- 상태 파일은 임시 파일에 쓴 뒤 atomic replace로 교체한다
- 발송 1회가 Slack 스레드 1개다. 루트 메시지는 1줄 결론이고, 상세 리포트는 같은 스레드의 reply로 남긴다
- 상태 파일은 마지막/최근 발송의 `root_ts`, `detail_ts`, channel, report date를 기록한다. 월별 thread 재사용 판단에는 쓰지 않는다
- 고객 식별자, 전화번호, raw row는 저장하거나 출력하지 않는다

## 2026-05-14 Slack 채널 정정

- 사용자 정정에 따라 AARRR 리포트 기본 발송 채널을 `#실험실_notifications`가 아니라 `#제품팀_data`로 바로잡았다.
- 코드 기본값은 채널명 문자열 대신 검증된 Slack 채널 ID `C0A198Z0P2N`를 사용한다.
- 서버 현재 배포본은 05/11~05/14 실행에서 `channel_not_found`로 실패했다. 원인은 기존 기본 채널 `#실험실_notifications` 라우팅으로 판단한다.

## 2026-05-14 Slack 스레드 정책 정정

- 누락분 수동 발송에서 리포트 본문을 루트 메시지로 직접 올린 문제가 있었다.
- 잘못 발송한 메시지는 삭제하고, 새 루트 메시지 `1778725854.131439`에는 1줄 결론만 남겼다.
- 상세 리포트는 같은 스레드의 reply `1778725854.570939`로 다시 발송했다.
- 배치 정책도 월별 스레드 재사용이 아니라 발송 1회당 새 root와 상세 reply를 만드는 방식으로 정정한다.

## 2026-05-14 리텐션 해석 정정

- 사용자 해석에 따라 M1 리텐션 하락은 단순 경고가 아니라 고단가 유저 증가에 따른 건강한 리텐션 하락으로 본다.
- 리포트의 결론, 확인 신호, 판단 문구에서 M1 리텐션 하락을 `고단가 유저 증가에 따른 건강한 하락`으로 설명한다.
- 루트 메시지 발송 후 상세 reply가 실패해도 복구할 수 있도록 루트 성공 직후 상태 파일을 먼저 저장한다.
- 같은 `root_ts`의 루트 저장과 상세 reply 저장은 recent history에서 중복 entry가 아니라 같은 entry 갱신으로 처리한다.

## 변경 파일

- `apps/private/aarrr-data-slack-report/deploy.yml`
- `apps/private/aarrr-data-slack-report/README.md`
- `apps/private/aarrr-data-slack-report/requirements.txt`
- `apps/private/aarrr-data-slack-report/src/config.py`
- `apps/private/aarrr-data-slack-report/src/main.py`
- `apps/private/aarrr-data-slack-report/tests/test_aarrr_report.py`
- `works/plan/2026-05-08-covering-labs-aarrr-data-slack-report.md`
