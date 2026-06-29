# FlareLane Governance Sync 완성 플랜

> 유형: 플랜
> 작성일: 2026-05-01
> 상태: 완료

## 목표

`flarelane-governance-sync`를 단순 일일 누락 알림에서 PR 코드 체크와 Deploy Apps private VM live check에서도 실험 거버넌스 리스크를 검출하는 배치로 보강한다.

## 현황 분석

- 현재 배치는 `product.v_flarelane_live_experiment_inventory` 기준으로 BigQuery 신호 없음과 Product Labs 수정필요만 Slack에 알린다.
- 실제 점검에서는 같은 사용자가 여러 arm에 들어간 오염과 30일 내 실험 간 중복 노출이 확인됐다.
- 현재 PR/merge/deploy 단계에서 이 배치의 테스트와 live governance check를 별도 workflow로 강제하지 않는다.

## 구현 계획

### 단계별 작업

- [x] Slack 감사 메시지에 `same_user_multi_arm`, `cross_experiment_overlap_30d`, canonical ledger row 상태를 추가한다.
- [x] CI용 `check` 명령을 추가해 현재 알려진 baseline보다 리스크가 커지면 실패하게 한다.
- [x] PR/push/manual workflow를 추가해 테스트와 governance check를 실행한다.
- [x] unit test, py_compile, pytest, 실제 audit/check 실행으로 검증한다.

## 완료 기준

- 매일 Slack 알림에 누락, 수정필요, 다중 arm 오염, 30일 중복 노출, canonical ledger 상태가 함께 표시된다.
- PR에서는 코드 테스트가 실행되고, main merge/deploy 경로에서는 BigQuery live check가 실행된다.
- 현재 알려진 리스크는 baseline으로 관리하되, 더 나빠지면 CI가 실패한다.
- 운영 FlareLane 여정, Slack 발송, BigQuery 쓰기 작업은 실행하지 않는다.

## 변경 파일

- `.github/workflows/flarelane-governance-guard.yml`: PR code check 전용 테스트 추가
- `.github/workflows/deploy.yml`: `flarelane-governance-sync` private VM 배포 경로의 live governance check 추가
- `apps/private/flarelane-governance-sync/src/main.py`: audit 확장, `check` 명령, baseline 평가 추가
- `apps/private/flarelane-governance-sync/src/queries.py`: BigQuery 감사 SQL 분리
- `apps/private/flarelane-governance-sync/tests/test_main.py`: Slack 리스크 메시지와 guardrail 평가 테스트 추가
- `apps/private/flarelane-governance-sync/README.md`: 운영 기준과 CI baseline 환경변수 설명 추가

## 검증 결과

- `python3 -m py_compile apps/private/flarelane-governance-sync/src/config.py apps/private/flarelane-governance-sync/src/queries.py apps/private/flarelane-governance-sync/src/main.py`: 통과
- `python3 -m pytest apps/private/flarelane-governance-sync/tests`: 9개 통과
- `ruby -e 'require "yaml"; ...'`: workflow YAML 파싱 통과
- `git diff --check`: 통과
- `python3 src/main.py audit`: BigQuery 읽기 성공, 누락 4건, 수정필요 6건, 다중 arm 1명, 30일 중복 노출 10쌍, 빈 canonical ledger 3개 표시
- baseline 적용 `python3 src/main.py check`: 통과
- strict 기준 `python3 src/main.py check --max-* 0`: 의도대로 실패

## 남은 리스크

- 현재 오염과 빈 canonical ledger 자체는 코드로 삭제하거나 backfill하지 않았다. 운영 상태 변경과 BigQuery 쓰기는 사람 승인 대상이다.
- GitHub branch protection에서 `FlareLane Governance Guard / PR code check`를 required check로 지정해야 PR 차단이 완전히 강제된다.

## 05/02 머지 후 배포 체크 보정

- PR #175 머지 후 GitHub runner의 `GCP_SA_KEY`가 `product.v_flarelane_live_experiment_inventory` 조회 권한을 갖고 있지 않아 live governance check가 실패했다.
- 권한을 새로 부여하지 않고, 배포 workflow에서 앱을 private VM에 복사한 뒤 VM 서비스 계정으로 `python3 src/main.py check`를 실행하도록 바꿨다.
- `FlareLane Governance Guard`는 PR code check만 담당하고, 실제 BigQuery live check는 `Deploy Apps`의 private VM 경로에서 수행한다.
