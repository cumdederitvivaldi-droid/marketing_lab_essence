# D7 CRM 모니터링 이관 플랜

> 유형: 플랜
> 작성일: 2026-04-28
> 상태: 완료

## 목표

`CRM_대시보드_이관_핸드오프.zip`에 들어 있던 D7 CRM 모니터링 코드를 `covering-labs` 배치 앱 기준으로 정리한다.

## 현황 분석

- 원본 코드에는 FlareLane API 키가 직접 들어 있어 그대로 배포할 수 없다.
- 원본 모니터링 쿼리는 레거시 `order` 테이블과 `PAYMENT_COMPLETED` 상태를 사용한다.
- 원본 사후분석 스크립트는 BigQuery `secure_dataset.tmp_d7crm_ab_groups` 테이블에 쓰는 방식이라 서버 기본 읽기 권한 정책과 맞지 않는다.
- Grafana 원본 JSON은 한글 인코딩이 깨진 상태라 그대로 재배포하지 않는다.

## 구현 계획

- 새 앱은 `apps/private/d7-crm-monitoring` 배치 앱으로 둔다.
- 기본 스케줄은 매일 09:30 KST 핵심 전환 조회만 수행하고, 비용이 큰 Mixpanel 쿠폰 이벤트 조회는 수동 실행으로 둔다.
- 주문 기준은 `order_v2`, `order_line`, `product`, `order_invoice`, `receipt`로 바꾼다.
- CRM 대상 기준에 맞게 봉투 구매 전 수거 신청 이력이 있는 사용자는 코호트에서 제외한다.
- 분석 그룹은 CSV를 읽어 쿼리 내부 임시 그룹으로 처리하고, BigQuery에 쓰지 않는다.
- FlareLane API 키와 프로젝트 ID는 환경변수로만 받는다.

## API 작업 체크리스트

- 요청 원문: 받은 CRM 대시보드 이관 코드를 커버링랩스 룰에 맞춰 배포 가능하게 수정한다.
- 작업 분류: 조회 코드 이관
- 대상 API: BigQuery 조회, 선택 실행 시 FlareLane devices 조회
- 대상 환경: local, covering-labs batch
- method: BigQuery query, FlareLane GET
- payload 또는 dry-run payload: BigQuery dry-run SQL
- auth/account: BigQuery는 기본 GCP 인증, FlareLane은 `FLARELANE_API_KEY` 환경변수
- 대상 객체: D7 CRM 모니터링 배치 앱
- 예상 화면 변화: 없음
- 영향 범위: 배포 후 매일 BigQuery 조회 로그 생성
- rollback: 앱 폴더 PR을 되돌리거나 배포에서 제외
- 검증 방법: Python 문법 검사, secret scan, 레거시 테이블 scan, BigQuery dry-run, 일부 쿼리 실제 조회
- 실행 주체: 로컬 수정은 Codex 가능, push와 배포는 사용자 승인 후 진행

## 완료 기준

- [x] 하드코딩 키 제거
- [x] 레거시 주문 테이블 제거
- [x] BigQuery 쓰기 제거
- [x] 배치 앱 구조 추가
- [x] dry-run 통과
- [x] Q1, Q2, Q3 실제 조회 확인
- [x] PR 리뷰 차단 사유 보완

## 변경 파일

- `apps/private/d7-crm-monitoring/deploy.yml`
- `apps/private/d7-crm-monitoring/README.md`
- `apps/private/d7-crm-monitoring/requirements.txt`
- `apps/private/d7-crm-monitoring/.gitignore`
- `apps/private/d7-crm-monitoring/src/d7crm_monitoring.py`
- `apps/private/d7-crm-monitoring/src/d7crm_analysis.py`
- `apps/private/d7-crm-monitoring/tests/test_d7crm_monitoring.py`
- `apps/private/d7-crm-monitoring/tests/test_d7crm_analysis.py`

## 검증 결과

- `python3 -m py_compile apps/private/d7-crm-monitoring/src/d7crm_monitoring.py apps/private/d7-crm-monitoring/src/d7crm_analysis.py` 통과
- 모니터링 Q1~Q4 BigQuery dry-run 통과
- 사후분석 d3, d8, summary BigQuery dry-run 통과
- Q1 실제 조회: 04/14~04/28 기준 15행 반환
- Q2 실제 조회: D+1~D+14 전환율 14행 반환
- Q3 실제 조회: 주간 코호트 10행 반환, D3/D7/D14는 관측 가능 사용자만 분모로 계산
- PR 리뷰 보완: README 필수 섹션 추가, `/shared/.env` 로드 추가, FlareLane 추출/분석 CSV 중복·충돌 처리 추가, CLI 단위 테스트 추가
