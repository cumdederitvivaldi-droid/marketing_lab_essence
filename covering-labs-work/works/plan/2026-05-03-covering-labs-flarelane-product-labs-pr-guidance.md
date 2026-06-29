# FlareLane Product Labs PR Guidance 개선 플랜

> 유형: Plan
> 작성일: 2026-05-03
> 상태: Complete

## 목표

새 FlareLane 실험을 Product Labs PR로 올릴 때 실험키, owner, 지표, BigQuery source, canonical ledger, 중복 제외 기준이 빠지지 않게 한다.

## 현황 분석

- 새 실험 진입점은 Product Labs PR로 두는 것이 맞다.
- 현재 `covering-labs` 저장소에는 Product Labs 원본 파일이 없어 Product Labs PR 자체를 여기서 강제 검증할 수는 없다.
- 대신 `flarelane-governance-sync`가 PR 본문 템플릿과 현재 정리 항목을 read-only로 출력하게 만들 수 있다.

## 구현 계획

### 단계별 작업

- [x] 새 실험 Product Labs PR 템플릿 출력 명령을 추가한다.
- [x] 현재 장부 정리 항목을 Product Labs 정리 PR 본문에 포함할 수 있게 한다.
- [x] README와 테스트를 갱신한다.
- [x] 컴파일, 테스트, 실제 명령 실행으로 검증한다.

## 완료 기준

- 새 실험 PR에 필요한 필수 필드가 한 번에 보인다.
- 현재 장부가 완전 정리 상태가 아니라는 사실이 PR 본문에 명시된다.
- 운영 상태 변경, BigQuery write, FlareLane 상태 변경은 실행하지 않는다.

## 변경 파일

- `apps/private/flarelane-governance-sync/src/main.py`: `product-labs-pr` 명령과 PR 템플릿 출력 추가
- `apps/private/flarelane-governance-sync/tests/test_main.py`: PR 템플릿과 현재 정리 항목 출력 테스트 추가
- `apps/private/flarelane-governance-sync/README.md`: 새 명령 사용법 추가

## 검증 결과

- `python3 -m pytest apps/private/flarelane-governance-sync/tests`: 12개 통과
- `python3 -m py_compile apps/private/flarelane-governance-sync/src/config.py apps/private/flarelane-governance-sync/src/queries.py apps/private/flarelane-governance-sync/src/main.py`: 통과
- `git diff --check`: 통과
- `python3 src/main.py product-labs-pr`: 새 실험 PR 템플릿 출력 확인
- `python3 src/main.py product-labs-pr --include-current-cleanup`: 현재 정리 항목 포함 출력 확인
- baseline 적용 `python3 src/main.py check`: 통과
