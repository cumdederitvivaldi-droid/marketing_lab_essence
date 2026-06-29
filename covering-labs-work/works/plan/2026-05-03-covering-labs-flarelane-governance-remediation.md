# FlareLane Governance Remediation 개선 플랜

> 유형: 플랜
> 작성일: 2026-05-03
> 상태: 완료

## 목표

`flarelane-governance-sync`가 실험 장부 리스크를 숫자로만 알리지 않고, 운영자가 바로 정리할 수 있는 우선순위, 담당 영역, 실행 기준, 검증 기준까지 함께 안내하게 한다.

## 현황 분석

- 현재 audit/check는 BigQuery 신호 없음, Product Labs 수정필요, 다중 arm, 30일 중복 노출, 빈 canonical ledger를 검출한다.
- 다만 Slack/터미널 메시지는 어떤 순서로 무엇을 정리해야 하는지 충분히 설명하지 않는다.
- Product Labs 상태 변경, BigQuery write, FlareLane 운영 상태 변경은 Codex가 직접 실행하지 않는다.

## 구현 계획

### 단계별 작업

- [x] audit 메시지에 판정과 우선 액션을 추가한다.
- [x] read-only remediation 명령을 추가해 사람 실행용 정리 절차를 출력한다.
- [x] 테스트와 README를 갱신한다.
- [x] 실제 audit/check로 운영 데이터 기준 회귀를 확인한다.

## 완료 기준

- 기존 guardrail은 유지된다.
- 운영 상태 변경 없이 read-only 출력만 추가된다.
- 현재 실험 장부 상태에서 다음 정리 액션이 명확하게 보인다.

## 변경 파일

- `apps/private/flarelane-governance-sync/src/main.py`: audit 메시지 판정, 우선 액션, read-only `remediation` 명령 추가
- `apps/private/flarelane-governance-sync/tests/test_main.py`: remediation 출력과 audit 우선 액션 테스트 추가
- `apps/private/flarelane-governance-sync/README.md`: `remediation` 사용법과 read-only 운영 기준 추가

## 검증 결과

- `python3 -m pytest apps/private/flarelane-governance-sync/tests`: 10개 통과
- `python3 -m py_compile apps/private/flarelane-governance-sync/src/config.py apps/private/flarelane-governance-sync/src/queries.py apps/private/flarelane-governance-sync/src/main.py`: 통과
- `python3 src/main.py remediation`: 현재 운영 데이터 기준 사람 실행용 정리 절차 출력 확인
- baseline 적용 `python3 src/main.py check`: 통과
