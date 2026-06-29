# 친구초대 V1 매칭/지급 배치 스크립트

> 유형: PRD
> 작성일: 2026-04-23
> 상태: In Review

## 목표

Airbridge App Install + Sign-up 이벤트를 BigQuery에서 매칭하고,
조건 충족 시 FlareLane 이벤트로 피초대자 쿠폰을 다음날 일괄 지급한다.

## 구현 계획

### 배치 흐름

1. BigQuery에서 최근 7일 App Install (invite_code 포함) 수집
2. BigQuery에서 최근 7일 Sign-up 수집
3. Airbridge_Device_ID 기준 매칭 (설치 후 48시간 내 가입)
4. invite_code → inviter_id 조회 (secure_dataset.user)
5. 지급 장부에서 이미 처리된 건 제외
6. FlareLane 이벤트 발송 (피초대자만)
7. 장부에 성공/실패 기록
8. Slack 알림

### 파일 구조

```text
apps/private/covering-invite-batch/
├── deploy.yml
├── requirements.txt
├── logs/
└── src/
    ├── main.py          — 진입점
    ├── config.py        — 환경변수 + /shared/.env 로드
    ├── matcher.py       — BigQuery 매칭 쿼리
    ├── ledger.py        — 지급 장부 조회/기록
    ├── flarelane.py     — FlareLane 이벤트 발송
    └── slack.py         — Slack 알림
```

### 환경변수

| 변수 | 용도 |
|---|---|
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 (기존) |
| `FLARELANE_API_KEY` | FlareLane API 키 (기존) |
| `SLACK_BOT_TOKEN` | Slack 알림 (기존) |

### 지급 장부

테이블: `product.friend_invite_reward_issuance_v1`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| run_date | DATE | 배치 실행일 |
| variant | STRING | 실험 버전 |
| invite_code | STRING | 초대 코드 |
| inviter_id | INT64 | 초대자 ID |
| invitee_user_id | INT64 | 피초대자 ID |
| airbridge_device_id | STRING | 기기 ID |
| installed_at | TIMESTAMP | 설치 시각 |
| signed_up_at | TIMESTAMP | 가입 시각 |
| reward_target | STRING | invitee (V1 고정) |
| status | STRING | issued / failed / skipped |
| status_reason | STRING | 실패/스킵 사유 |
| flarelane_event_name | STRING | friend_invite_reward_v1_invitee |
| processed_at | TIMESTAMP | 처리 시각 |

## 완료 기준

- [ ] 지급 장부 테이블 생성
- [ ] BigQuery 매칭 쿼리 정상 동작
- [ ] self invite 제외
- [ ] 중복 지급 방지 (장부 기반)
- [ ] FlareLane 이벤트 발송
- [ ] Slack 결과 알림
- [ ] deploy.yml + cron 매일 09:00 KST
