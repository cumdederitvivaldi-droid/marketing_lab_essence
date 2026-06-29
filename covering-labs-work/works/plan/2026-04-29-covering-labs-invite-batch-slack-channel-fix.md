> 유형: 플랜
> 작성일: 2026-04-29
> 상태: 확정

# covering-invite-batch Slack 채널 ID 환경변수 분리

## 문제

`covering-invite-batch`가 `SLACK_CHANNEL_ID` 환경변수를 `large-bag-delivery-batch`와 공유하여,
`/shared/.env`에 설정된 봉투배송 채널로 친구초대 결과 메시지가 발송되는 버그.

## 원인

- `/shared/.env`의 `SLACK_CHANNEL_ID`는 `large-bag-delivery-batch` 소유값
- `covering-invite-batch/src/config.py`가 동일한 키로 env를 읽어 기본값(`C0ARXKB2Y9L`) 무시

## 해결

1. `covering-invite-batch/src/config.py`: `SLACK_CHANNEL_ID` 읽기 키를 `INVITE_SLACK_CHANNEL_ID`로 변경
2. `apps/AGENTS.md` + `apps/CLAUDE.md` 환경변수 레지스트리에 `INVITE_SLACK_CHANNEL_ID` 항목 추가

## 변경 파일

- `apps/private/covering-invite-batch/src/config.py`
- `apps/AGENTS.md`
- `apps/CLAUDE.md`
