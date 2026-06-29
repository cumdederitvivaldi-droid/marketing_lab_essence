# FlareLane 실험 장부 정리 실행팩 플랜

> 유형: 플랜
> 작성일: 2026-05-03
> 상태: 완료

## 목표

FlareLane 실험 장부의 남은 정리 항목을 Product Labs PR에서 빠짐없이 처리할 수 있게 한다. Codex는 Product Labs 상태 변경, FlareLane 운영 변경, BigQuery write를 직접 실행하지 않고, 사람이 승인해 실행할 PR 본문, dry-run 절차, 완료 검증 기준을 제공한다.

## 현황 분석

- BigQuery 신호 없음: 4건
- Product Labs needs_revision: 6건
- 같은 실험 다중 arm: 1명
- 30일 내 실험 간 중복 노출: 10쌍
- canonical ledger 빈 테이블: 3개

현재 상태는 guard baseline 안에서 감시되고 있지만, 완전 정리 상태는 아니다. 정리 완료 기준은 Product Labs 메타데이터, source/backfill, 오염 해석 제한, canonical ledger row_count, strict check까지 함께 통과하는 것이다.

## 구현 계획

### 단계별 작업

- [x] 최신 main에서 새 작업 브랜치를 생성한다.
- [x] 현재 장부 상태를 `product-labs-pr --include-current-cleanup`, `remediation`, `check`로 재확인한다.
- [x] `cleanup-pack` 명령을 추가해 Product Labs 정리 PR 본문, 변경 대상, 오염 검산, dry-run, 완료 검증, 되돌리기 기준을 한 번에 출력한다.
- [x] audit 문구에서 strict check와 충돌할 수 있는 “baseline 이내” 표현을 제거한다.
- [x] README에 `cleanup-pack` 사용법과 운영 기준을 추가한다.

## 변경 파일

- `apps/private/flarelane-governance-sync/src/main.py`
- `apps/private/flarelane-governance-sync/tests/test_main.py`
- `apps/private/flarelane-governance-sync/README.md`
- `apps/AGENTS.md`
- `works/plan/2026-05-03-covering-labs-flarelane-cleanup-execution-pack.md`

## 05/04 채널 수정

- 사용자 정정에 따라 FlareLane 실험 장부 점검 Slack 기본 채널을 `#제품팀_프로덕트랩스`에서 `#실험실_notifications`로 바꿨다.
- 공용 `SLACK_CHANNEL_ID` fallback은 제거했다. 다른 배치의 채널 환경변수가 섞이면 다시 오발송될 수 있기 때문이다.
- 전용 override가 필요할 때만 `FLARELANE_GOVERNANCE_SLACK_CHANNEL`을 사용한다.

## 완료 기준

- `python3 -m pytest apps/private/flarelane-governance-sync/tests` 통과
- `python3 -m py_compile apps/private/flarelane-governance-sync/src/config.py apps/private/flarelane-governance-sync/src/queries.py apps/private/flarelane-governance-sync/src/main.py` 통과
- `python3 src/main.py cleanup-pack`가 현재 정리 대상, dry-run, 완료 검증, 되돌리기 기준을 모두 출력
- PR merge 후 FlareLane Governance Guard와 Deploy Apps 성공
