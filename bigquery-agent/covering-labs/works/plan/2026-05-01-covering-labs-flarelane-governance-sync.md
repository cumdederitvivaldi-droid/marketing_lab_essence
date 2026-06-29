# FlareLane 거버넌스 동기화 플랜

> 유형: 플랜
> 작성일: 2026-05-01
> 상태: 검토중

## 목표

Product Labs에 등록된 FlareLane 실험과 BigQuery 관측 신호가 어긋날 때 제품팀 Slack 채널로 매일 알린다. D3/D8 CRM과 ENG-2144 Stage2처럼 콘솔에서는 살아 있지만 장부 신호가 비어 있는 실험을 사람이 놓치지 않게 한다.

## 현황 분석

- Product Labs 장부는 BigQuery `product.v_flarelane_live_experiment_inventory`에서 조회 가능하다.
- 05/01 기준 D3, D8, ENG-2144 Stage2는 Product Labs에는 등록됐지만 BigQuery 신호가 없다.
- canonical ledger 테이블은 존재하지만 assignment, exposure, conversion row가 아직 비어 있다.
- ENG-2144 기존 `eng_2144_experiment_users`는 Stage1 신호만 담고 있어 Stage2 row로 재사용하면 잘못된 기록이 된다.

## API 작업 체크리스트

- 요청 원문: 실험 이벤트나 DB 변화가 생길 때 Slack으로 알림을 주고, PR/merge/deploy 흐름에서 잡아내야 함
- 작업 분류: 조회 기반 알림, dry-run SQL 생성
- 대상 API: BigQuery 조회, Slack `chat.postMessage`
- 대상 환경: covering-labs private batch
- method: BigQuery SELECT, Slack POST
- payload 또는 dry-run payload: 실험 누락 요약 텍스트
- auth/account: VM 기본 BigQuery 인증, Slack bot token은 환경변수
- 대상 객체: Product Labs FlareLane inventory view, product canonical ledger tables
- 예상 화면 변화: 없음
- 영향 범위: 제품팀 Slack 알림, BigQuery dry-run SQL
- rollback: 앱 폴더 제거 또는 deploy schedule 제거 PR
- 검증 방법: unit test, audit 실제 조회, sync SQL dry-run
- 실행 주체: Codex는 코드와 dry-run까지, 운영 Slack 발송과 BigQuery 쓰기는 배포/사람 승인 후

## 구현 내용

- `apps/private/flarelane-governance-sync` private batch 앱 추가
- 매일 10:00 KST `audit --send-slack` 스케줄 추가
- Slack 토큰과 채널은 환경변수에서만 읽도록 처리
- D3/D8 CSV 기반 assignment/conversion SQL 생성 경로 추가. assignment 기준 시각은 배치 실행 시각이 아니라 첫 봉투 구매 시각으로 둠
- ENG-2144 Stage2는 source table이 생기기 전까지 잘못된 row를 만들지 않도록 guarded 상태로 둠

## 검증 결과

- `python3 -m py_compile apps/private/flarelane-governance-sync/src/main.py` 통과
- `python3 -m pytest apps/private/flarelane-governance-sync/tests` 통과: 6 tests
- `python3 src/main.py audit` 실제 BigQuery 조회 성공: BigQuery 신호 없음 4건, Product Labs 수정필요 6건
- `python3 src/main.py sync-d3d8 --groups-csv /tmp/flarelane_governance_groups_sample.csv --dry-run` 성공: 382,019,587 bytes
- `python3 src/main.py sync-stage2` dry-run 성공: 0 bytes
- GitHub PR #173 생성. CodeRabbit changes requested 반영: env 로딩 순서, config.py 로더, BigQuery ADC scopes, user_id 검증, structured logging, BigQuery dependency upper bound, docstring coverage

## 남은 리스크

- PR #173 승인 전에는 배포되지 않는다.
- Slack bot이 `#제품팀_프로덕트랩스` 채널에 초대되어 있어야 실제 발송된다.
- D3/D8은 FlareLane 태그 CSV가 필요하다. 태그 관측 시각이 없으므로 실제 발송 노출이 아니라 `tag_observed` assignment로 기록한다.
- Stage2는 user-level source가 아직 없어서 장부를 자동 보정하지 않는다.
