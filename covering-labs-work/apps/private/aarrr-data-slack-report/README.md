# AARRR Data Slack Report

AARRR 핵심 지표를 `#제품팀_data`에 보고하는 private batch 앱이다.

## 목적

Grafana AARRR 패널을 모두 슬랙에 옮기지 않고, PO가 봐야 하는 성장 신호를 AARRR 단계별로 발송 1회당 새 스레드에 남긴다.

## 실행 환경

- Runtime: Python 3.11 이상
- 실행 위치: `/shared/apps/aarrr-data-slack-report`
- 기본 실행: `python3 src/main.py`
- `--no-slack` 또는 `--dry-run`: Slack 발송 없이 메시지를 stdout에 출력하고 상태 파일을 갱신하지 않는다.
- `--report-date YYYY-MM-DD`: KST 기준 닫힌 보고일을 지정한다.
- `--lookback-days N`: 비교 기간 길이를 지정한다. 기본값은 30일이다.

## 주요 파일

- `src/main.py`: BigQuery 조회, 루트 메시지와 상세 reply 렌더링, Slack 발송, 마지막 발송 상태 갱신 entrypoint
- `src/config.py`: `/shared/.env`와 앱 로컬 `.env` 환경변수 로더
- `deploy.yml`: batch 앱 이름, 설명, 월·수·금 09:10 KST 스케줄
- `logs/aarrr_data_slack_state.json`: Slack 마지막/최근 발송 상태 파일
- `logs/batch.log`: batch 실행 시작, 완료, 실패 로그
- `tests/test_aarrr_report.py`: 메시지 렌더링과 발송 상태 단위 테스트

## 환경변수

- `SLACK_BOT_TOKEN`: Slack `chat.postMessage` 호출용 bot token. Slack 발송 실행 시 필수다.
- `AARRR_REPORT_SLACK_CHANNEL`: 리포트를 보낼 채널. 기본값은 `C0A198Z0P2N` (`#제품팀_data`)다.
- `AARRR_REPORT_STATE_FILE`: Slack 발송 상태 파일 경로. 기본값은 `logs/aarrr_data_slack_state.json`이다.
- `ENV_FILE`: 공통 환경변수 파일 경로. 기본값은 `/shared/.env`다.

## 실행

```bash
python3 src/main.py --no-slack
python3 src/main.py --no-slack --report-date 2026-05-07
```

## 배포 기준

- 기본 스케줄은 월·수·금 09:10 KST다.
- 슬랙 발송은 `SLACK_BOT_TOKEN` 환경변수가 있을 때만 수행한다.
- 기본 채널은 `C0A198Z0P2N` (`#제품팀_data`)이며, `AARRR_REPORT_SLACK_CHANNEL`로 바꿀 수 있다.
- 발송 1회가 Slack 스레드 1개다. 루트 메시지는 1줄 결론이고, 상세 리포트는 같은 스레드의 reply로 남긴다.
- 같은 달 또는 같은 보고월이라는 이유로 이전 스레드를 재사용하지 않는다.
- 상태 파일 기본 경로는 `logs/aarrr_data_slack_state.json`이고, `AARRR_REPORT_STATE_FILE`로 바꿀 수 있다.

## 지표 기준

- 최근 30일 결제 유저: 최근 30일 `PAID` 서비스 receipt가 있는 고유 사용자 수
- 첫 유료 이용자: 기간 내 첫 `PAID` 서비스 receipt가 발생한 사용자 수
- D7 첫 결제 전환: 보고일 기준 7일 관측이 끝난 가입 코호트 기준
- M1 후속 결제: 첫 결제일자 기준 31~60일 안에 서비스 결제가 다시 발생한 비율
- 증감 표기: `30일전`은 직전 30일 대비, `1주전`은 동일 30일 창을 7일 전으로 밀어 비교한다.
- 생활쓰레기, 대커봉 같은 기능별 맥락은 AARRR 리포트에서 다루지 않고 각 기능 대시보드 배치에서 별도로 다룬다.

## 표시 원칙

- 마크다운 표를 쓰지 않는다.
- 숫자 나열보다 퍼널과 전후 비교를 먼저 보여준다.
- 본문은 Acquisition, Activation, Retention, Revenue, Referral 단계별로 분리한다.
- 전체 패널, 원천 이벤트, 긴 세그먼트 목록은 Grafana 링크로 보낸다.

## 의존 서비스

- BigQuery: `secure_dataset.order_v2`, `order_line`, `product`, `order_invoice`, `invoice`, `receipt`, `user`, `subscription`
- BigQuery: `ads_data.daily_cost_creative`
- Slack Web API: `chat.postMessage`

## 주의사항

- 레거시 주문 테이블을 쓰지 않는다.
- 고객 식별자, 전화번호, raw audience row는 저장하거나 출력하지 않는다.
- `--no-slack` 검증은 실제 슬랙 발송과 상태 파일 갱신을 하지 않는다.
- 상태 파일은 마지막/최근 발송의 `root_ts`, `detail_ts`, channel, report date를 기록한다. 스레드 재사용 판단에는 쓰지 않는다.
- 운영 Slack 발송은 배포 환경의 스케줄 또는 사람이 명시적으로 실행한 경우에만 발생한다.
