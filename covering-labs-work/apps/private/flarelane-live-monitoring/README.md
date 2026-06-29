# FlareLane Live Monitoring

핵심 FlareLane 실험 2개를 매일 슬랙으로 보고하는 배치 앱이다.

## 목적

사람이 FlareLane 콘솔과 BigQuery를 직접 확인하지 않아도 매일 오전 9시에 활성 실험의 핵심 퍼널과 장부 누락 상태를 확인한다. 현재 모니터링 대상은 아래 두 묶음으로 제한한다.

- 친구초대 실험
- 첫 봉투 구매 후 아직 수거 신청하지 않은 고객 대상 D+3/D+8 여정

## 실행 환경

- Python 3.10 이상
- covering-labs private VM 또는 GCP 기본 인증이 가능한 로컬 환경
- 배포 후 매일 09:00 KST에 crontab으로 실행

## 주요 파일

- `src/main.py`: BigQuery, FlareLane live, Slack 메시지 생성과 발송
- `src/config.py`: crontab 실행 환경에서 `/shared/.env`와 앱 로컬 `.env` 로드
- `deploy.yml`: 배치 스케줄과 실행 명령
- `logs/batch.log`: 자동 실행 로그

## 환경변수

- `SLACK_BOT_TOKEN`: Slack 발송 시 필수. `SLACK_TOKEN`도 fallback으로 허용한다.
- `FLARELANE_MONITOR_SLACK_CHANNEL`: 선택. 없으면 `PRODUCT_LABS_SLACK_CHANNEL`, `SLACK_CHANNEL`, `#실험실_notifications` 순서로 사용한다.
- `FLARELANE_PROJECT_ID`: FlareLane live counter 조회 시 필수.
- `FLARELANE_LIVE_BEARER`: FlareLane live counter 조회 시 필수. `FLARELANE_CONSOLE_BEARER`, `FLARELANE_BEARER`도 fallback으로 허용한다.

환경변수는 현재 셸, `/shared/.env`, 앱 로컬 `.env`에서 읽는다. BigQuery 인증은 VM 서비스 계정 또는 Application Default Credentials를 사용한다.

## 실행 방법

```bash
python3 src/main.py --no-slack
python3 src/main.py --dry-run
```

자동 배포 스케줄은 `python3 src/main.py`만 실행한다.

## 의존 서비스

- BigQuery: `product.v_flarelane_live_experiment_inventory`
- BigQuery: `product.friend_invite_experiment_v1`, `product.friend_invite_reward_issuance_v1`
- BigQuery: `mixpanel.mp_master_event`
- BigQuery: `secure_dataset.order_v2`, `order_line`, `product`, `order_invoice`, `receipt`
- FlareLane service API: 활성 automation과 친구톡 live counter 조회
- Slack API: `chat.postMessage`

## 주의사항

- 기본 스케줄은 매일 09:00 KST다.
- 슬랙 발송은 `SLACK_BOT_TOKEN` 환경변수가 있을 때 수행한다. 채널은 `FLARELANE_MONITOR_SLACK_CHANNEL`을 우선 사용하고, 없으면 `#실험실_notifications`로 보낸다.
- FlareLane live counter는 `FLARELANE_PROJECT_ID`와 `FLARELANE_LIVE_BEARER`가 있을 때만 조회한다.
- FlareLane live bearer가 없으면 친구톡 실시간 sent/click 지표는 제외하고 BigQuery 기준 친구초대 퍼널과 D+3 전환 proxy만 보고한다.
- 고객 식별자, 전화번호, raw audience row는 저장하거나 출력하지 않는다.
- 자동 실행 로그는 `logs/batch.log` 한 파일에 남긴다.
