# D7 CRM Monitoring

D7 CRM 실험의 봉투 첫 구매 후 수거 신청 전환을 커버링 신규 주문 도메인 기준으로 확인하는 private 배치 앱이다.

## 목적

봉투 첫 구매 고객이 이후 수거 신청까지 이어지는지 매일 확인한다. 기본 배치는 BigQuery 조회만 수행하고, FlareLane 사용자 추출과 사후 분석은 사람이 필요할 때 수동으로 실행한다.

## 실행 환경

- Python 3.10 이상
- covering-labs private VM 또는 GCP 기본 인증이 가능한 로컬 환경
- 배포 후 매일 09:30 KST에 crontab으로 실행

## 주요 파일

- `src/d7crm_monitoring.py`: 일일 진입, 전환 퍼널, 주간 코호트, 쿠폰 사용 현황 조회
- `src/d7crm_analysis.py`: FlareLane 태그 사용자 추출과 A/B 그룹별 전환 분석
- `deploy.yml`: 배치 스케줄과 실행 명령
- `logs/batch.log`: 자동 실행 로그

## 환경변수

- `GCP_PROJECT`: 선택. 기본값은 `covering-app-ccd23`
- `D7CRM_BQ_DATASET`: 선택. 기본값은 `secure_dataset`
- `D7CRM_PROMO_START`: 선택. 기본값은 `2026-04-22`
- `D7CRM_PROMO_END`: 선택. 기본값은 `2026-05-06`
- `FLARELANE_API_KEY`: FlareLane 사용자 추출 시 필수
- `FLARELANE_PROJECT_ID`: FlareLane 사용자 추출 시 필수

환경변수는 현재 셸과 `/shared/.env`에서 읽는다. BigQuery 인증은 VM 서비스 계정 또는 Application Default Credentials를 사용한다.

## 실행 방법

```bash
python3 src/d7crm_monitoring.py all
python3 src/d7crm_monitoring.py daily
python3 src/d7crm_monitoring.py 1
python3 src/d7crm_analysis.py summary --groups-csv ./d7crm_ab_groups.csv
```

자동 배포 스케줄은 `python3 src/d7crm_monitoring.py daily`만 실행한다. Mixpanel 쿠폰 조회는 비용이 더 커서 `4` 또는 `all` 명령으로 수동 실행한다.

## 의존 서비스

- BigQuery: `secure_dataset.order_v2`, `order_line`, `product`, `order_invoice`, `receipt`
- BigQuery: `mixpanel.mp_master_event` (쿠폰 사용 현황 수동 조회)
- FlareLane API: 분석 그룹 CSV 추출 시에만 사용

## 주의사항

- `order` 레거시 테이블 대신 `order_v2`, `order_line`, `product`, `order_invoice`, `receipt`를 사용한다.
- FlareLane API 키는 코드에 넣지 않고 `FLARELANE_API_KEY` 환경변수로만 읽는다.
- 분석 그룹은 BigQuery 임시 테이블에 쓰지 않고 CSV를 읽어 쿼리 안의 임시 그룹으로만 사용한다.
- 이 앱은 기본 스케줄에서 핵심 전환 조회만 수행하며, 운영 Slack 발송이나 외부 상태 변경은 하지 않는다.
- 자동 실행 로그는 `logs/batch.log` 한 파일에 남긴다.
