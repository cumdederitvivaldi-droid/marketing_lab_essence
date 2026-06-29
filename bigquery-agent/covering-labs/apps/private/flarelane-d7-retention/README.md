# flarelane-d7-retention

FlareLane D7 리텐션 실험 배치 — ENG-1559 첫 주문 후 정확히 7일 경과 사용자를 자동 집계하고 리텐션 여정을 발송합니다.

## 목적

정확히 7일 경과(D7)한 첫 주문 사용자를 매일 집계하여 FlareLane을 통해 리마인더 알림 및 인센티브를 자동 발송합니다. ENG-1559 리텐션 실험에 따라 사용자를 CONTROL / MSG_ONLY / PCT50 / FIXED5000의 4가지 실험군으로 분배하고, 각 군별 여정을 자동으로 진입시킵니다.

## 실행 환경

- 실행 방식: crontab (배치)
- 실행 주기: 매일 09:05 KST
- 실행 서버: GCP VM (crontab — SA 계정으로 실행)

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/run_d7_event_batch.py` | 메인 배치 스크립트. 정확히 D7인 첫 주문 사용자를 BigQuery에서 조회하고 FlareLane에 리마인더 이벤트를 발송합니다. |
| `src/run_addorder_signal_batch.py` | 보조 배치 스크립트. D7~D30 사이에 재주문 신호를 감지한 사용자에게 인센티브 이벤트를 발송합니다. |
| `src/config.py` | 환경변수 관리. crontab 실행 환경에서 `/shared/.env`를 자동 로드합니다. |
| `src/bq_helper.py` | BigQuery 및 공통 유틸리티. 두 배치 스크립트에서 공유하는 BQ 쿼리 실행, 로그 관리, 시간대 변환 함수. |
| `src/experiment_config.py` | ENG-1559 실험 설정. 실험군명, 이벤트명, 자동화명, 쿠폰 정책 ID 등을 중앙 관리합니다. |
| `src/flarelane_api.py` | FlareLane API 호출 공통 로직. 이벤트 발송, 타임아웃, 재시도 로직을 처리합니다. |
| `deploy.yml` | 배치 앱 메타데이터. 앱 명칭, 설명, 실행 스케줄, 명령어를 정의합니다. |
| `requirements.txt` | Python 의존성. requests 2.28.0 이상 필요. |

## 환경변수

| 변수명 | 설명 | 필수 |
|---|---|---|
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 ID | O |
| `FLARELANE_API_KEY` | FlareLane API 베어러 토큰 | O |

환경변수는 `/shared/.env` 또는 현재 셸 환경에서 로드됩니다. crontab 실행 시 `/shared/.env`에서 자동 로드됩니다.

## 실행 방법

### 일반 실행 (자동 배치)

```bash
# crontab이 매일 09:05 KST에 자동 실행합니다.
# 수동 실행이 필요한 경우:
python3 src/run_d7_event_batch.py
```

### 주요 옵션

#### run_d7_event_batch.py

```bash
# 드라이런 (실제 발송 없음, 프리뷰만 표시)
python3 src/run_d7_event_batch.py --dry-run

# 특정 날짜 기준 실행 (기본값: 당일 KST)
python3 src/run_d7_event_batch.py --run-date 2026-04-17

# 앞에서 N명만 발송 (테스트용)
python3 src/run_d7_event_batch.py --limit 10

# 특정 user_id만 발송
python3 src/run_d7_event_batch.py --user-id 12345

# 특정 실험군만 발송 (복수 지정 가능)
python3 src/run_d7_event_batch.py --variant MSG_ONLY --variant PCT50

# 이벤트 간 대기 (밀리초, 레이트 제한용)
python3 src/run_d7_event_batch.py --sleep-ms 100

# 기존 발송 이력이 있어도 다시 발송 (복구용)
python3 src/run_d7_event_batch.py --include-already-emitted

# 복구 발송 시 별도의 event source 지정
python3 src/run_d7_event_batch.py --event-source eng1559_exact_d7_batch_recovery --include-already-emitted
```

#### run_addorder_signal_batch.py

```bash
# 드라이런
python3 src/run_addorder_signal_batch.py --dry-run

# 특정 날짜 기준 실행
python3 src/run_addorder_signal_batch.py --run-date 2026-04-17

# 앞에서 N명만 발송
python3 src/run_addorder_signal_batch.py --limit 10

# 특정 user_id만 발송
python3 src/run_addorder_signal_batch.py --user-id 12345

# 이벤트 간 대기
python3 src/run_addorder_signal_batch.py --sleep-ms 100
```

## 의존 서비스

| 서비스 | 용도 | 권한 |
|---|---|---|
| BigQuery | 첫 주문 사용자 조회, 재주문 신호 감지, 실험군 할당 데이터 저장 | `bq query`, `bq command` |
| FlareLane API | 리마인더 및 인센티브 이벤트 발송 | `POST /v1/projects/{PROJECT_ID}/track` |
| Mixpanel | 재주문(AddOrderScreen) 신호 감지 | `covering-app-ccd23.mixpanel.mp_master_event` (읽기) |
| Cloud Logging | 배치 로그 기록 | 자동 |

## 주의사항

### 데이터베이스 테이블

배치는 다음 BigQuery 테이블을 자동 생성하며, 외부 수정 시 데이터 손상의 위험이 있습니다.

- `covering-app-ccd23.product.experiment_user_assignments` — 실험군 할당 내역
- `covering-app-ccd23.product.eng_1559_event_history` — 이벤트 발송 이력

### 첫 주문 기준

- 2026-03-31 이전: `covering-app-ccd23.secure_dataset.order` 테이블 기준
- 2026-03-31 이후: `covering-app-ccd23.secure_dataset.order_v2` 테이블 기준

양쪽 테이블 모두 다음 조건을 만족해야 합니다.

- `payment_policy_id IS NOT NULL` (결제 정책 존재)
- `status` = 'PAYMENT_COMPLETED' | 'COMPLETED' | 'CHECK_COMPLETED' (결제 완료)
- `product_type = 'SERVICE'` (서비스 상품만)
- 한 사용자당 첫 주문만 처리

### 실험군 할당

사용자 ID 기반 deterministic 해싱(FARM_FINGERPRINT)을 사용합니다.

```text
hash_value = ABS(MOD(FARM_FINGERPRINT(CONCAT(user_id, 'eng_1559_d7_reward_v2')), 4))

hash_value = 0: CONTROL (발송 없음, 홀드아웃)
hash_value = 1: MSG_ONLY (메시지만)
hash_value = 2: PCT50 (50% 할인 쿠폰)
hash_value = 3: FIXED5000 (5000원 고정 할인)
```

동일 사용자는 항상 동일 실험군으로 할당됩니다.

### 중복 발송 방지

이벤트 발송 이력은 `eng_1559_event_history` 테이블에 자동 기록됩니다. 정상 실행 시 이미 발송된 사용자는 자동 스킵됩니다.

재발송이 필요한 경우 `--include-already-emitted` 옵션을 사용하되, `--event-source`를 다른 값으로 지정하여 분석 추적성을 유지하세요.

### 로그 및 스냅샷

각 배치 실행 후 다음 경로에 로그 및 스냅샷이 저장됩니다.

```text
~/data/eng1559_exact_d7_batch/
  ├─ eng1559_exact_d7_batch_bq.stderr.log      (BQ 에러 로그)
  ├─ eng1559_exact_d7_batch_bq.stdout.log      (BQ 출력)
  └─ eng1559_exact_d7_batch_20260417.csv       (실행 결과 스냅샷)

~/data/eng1559_addorder_signal_batch/
  ├─ eng1559_addorder_signal_batch_bq.stderr.log
  ├─ eng1559_addorder_signal_batch_bq.stdout.log
  └─ eng1559_addorder_signal_batch_20260417.csv
```

### FlareLane API 제한

- 개별 이벤트 발송 시 타임아웃: 20초
- 실패한 이벤트는 최대 5건까지 에러 샘플로 기록됩니다.
- 대량 발송 시 `--sleep-ms`를 지정하여 레이트 제한을 준수하세요.

### 시간대

모든 시간 연산은 Asia/Seoul(KST) 기준입니다. 환경 시간대 설정을 변경하면 D7 집계가 부정확해질 수 있습니다.
