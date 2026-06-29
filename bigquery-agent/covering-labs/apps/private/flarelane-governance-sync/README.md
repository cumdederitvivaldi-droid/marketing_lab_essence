# FlareLane Governance Sync

FlareLane 실험 장부와 BigQuery 신호를 매일 비교해서 `#실험실_notifications`에 누락 상태를 알리는 private batch 앱이다.

## 하는 일

- `product.v_flarelane_live_experiment_inventory`를 읽어 등록됐지만 BigQuery 신호가 없는 실험을 찾는다.
- Product Labs에는 등록됐지만 상태가 `needs_revision`인 실험을 함께 알린다.
- 같은 실험 안에서 동일 사용자가 여러 arm에 들어간 오염과 30일 내 실험 간 중복 노출을 함께 알린다.
- canonical FlareLane ledger 테이블이 비어 있는지도 함께 알린다.
- D3/D8 CRM 태그 CSV를 받으면 canonical assignment/conversion 반영용 SQL을 dry-run으로 검증한다.
- 운영 Slack 발송과 BigQuery 쓰기는 명시 옵션이 있을 때만 실행된다.

## 실행

```bash
python3 src/main.py audit
python3 src/main.py audit --send-slack
python3 src/main.py check
python3 src/main.py remediation
python3 src/main.py product-labs-pr
python3 src/main.py product-labs-pr --include-current-cleanup
python3 src/main.py cleanup-pack
python3 src/main.py sync-d3d8 --groups-csv ./d7crm_ab_groups.csv --print-sql
python3 src/main.py sync-stage2 --print-sql
```

배포 스케줄은 매일 10:00 KST에 `audit --send-slack`를 실행한다.

`check`는 CI와 배포 전 검사용이다. 기본값은 strict 기준이며, CI에서는 현재 알려진 baseline을 환경변수로 넘긴다. baseline보다 BigQuery 누락, Product Labs 수정필요, 다중 arm 오염, 30일 중복 노출, 빈 canonical ledger가 커지면 실패한다.

GitHub Actions에서는 PR code check가 컴파일과 테스트를 담당하고, main 배포 경로의 live BigQuery check는 private VM에 앱을 복사한 뒤 VM 서비스 계정으로 실행한다.

`remediation`은 사람이 실행할 정리 절차를 출력하는 read-only 명령이다. Product Labs 상태 변경, FlareLane 운영 변경, BigQuery write는 직접 실행하지 않고 실행 주체와 검증 기준만 안내한다.

`product-labs-pr`은 새 FlareLane 실험을 Product Labs PR로 올릴 때 필요한 필수 항목을 출력한다. `--include-current-cleanup`을 붙이면 현재 장부 정리 항목도 PR 본문에 같이 옮길 수 있게 출력한다.

`cleanup-pack`은 현재 장부를 Product Labs에서 정리하기 위한 실행팩을 출력한다. 변경 대상, 오염 검산 대상, canonical ledger 처리, dry-run 명령, 완료 검증, 되돌리기 기준을 한 번에 제공한다.

## 환경변수

- `GCP_PROJECT`: 기본값 `covering-app-ccd23`
- `FLARELANE_GOVERNANCE_SLACK_TOKEN`: Slack bot token
- `FLARELANE_GOVERNANCE_SLACK_CHANNEL`: 기본값 `#실험실_notifications`
- `SLACK_BOT_TOKEN`: 위 token의 fallback
- `FLARELANE_MAX_MISSING_BIGQUERY_SIGNAL`: CI 허용 BigQuery 신호 없음 baseline
- `FLARELANE_MAX_PRODUCT_LABS_REVISION`: CI 허용 Product Labs 수정필요 baseline
- `FLARELANE_MAX_MULTI_ARM_USERS`: CI 허용 다중 arm 사용자 baseline
- `FLARELANE_MAX_CROSS_OVERLAP_RATE`: CI 허용 30일 중복 노출 최대 비율 baseline
- `FLARELANE_MAX_CANONICAL_EMPTY_TABLES`: CI 허용 빈 canonical ledger 테이블 baseline

Slack 토큰은 코드나 문서에 저장하지 않고 `/shared/.env` 또는 배포 환경변수에서만 읽는다.

## 운영 기준

- 이 앱은 FlareLane 캠페인을 만들거나 발송하지 않는다.
- `audit`은 BigQuery 조회만 수행한다.
- `check`는 BigQuery 조회 뒤 기준 초과 시 exit code 1로 실패한다.
- `remediation`은 BigQuery 조회 뒤 사람 실행용 정리 절차만 출력한다.
- `product-labs-pr`은 새 실험 PR 템플릿을 출력하고, 옵션을 붙인 경우 현재 장부 정리 항목을 함께 출력한다.
- `cleanup-pack`은 현재 장부 정리 PR 본문과 dry-run 절차를 출력한다. Product Labs 상태 변경과 BigQuery write는 사람이 PR 승인 후 실행한다.
- `sync-*` 명령은 기본적으로 SQL 출력/dry-run 용도다. 실제 BigQuery 반영은 사람이 SQL을 검토한 뒤 별도 승인으로 실행한다.
