# 첫 결제 0원 실험 — 쿠폰 자동발급 배치

> 유형: 플랜
> 작성일: 2026-05-21
> 상태: 검토중

## 목표

첫 결제 0원 실험(노션 `3645e589dc9f80d9bc11d055ac4dc13d`)의 쿠폰 자동발급 파이프라인을
covering-labs 배치로 구현. 신규 가입자에 51:49(treatment 우대) A/B 배정 후 treatment에는 FlareLane
이벤트를 쏴서 기존 쿠폰 발급 webhook을 트리거한다.

## 현황 분석

- 명세상 트리거: 가입 이벤트 (앱 첫 방문 X).
- A/B: 51:49 (treatment 우대). user_id 해시 기반 결정적 배정. 명목 50:50이되 소수점 경계는 treatment 쪽으로 기울이는 정책.
- 쿠폰 정책 ID 215 (정액 최대 2만원, 발급 후 14일, 유저당 1회) — 백오피스에서 환희님 발급 완료.
- 쿠폰 발급 webhookId `1faa88de-c1e5-4ced-ac43-eace7fde04fa` — 기존 인프라 재사용.
- **데이터 소스 비교 (lag 검증 완료, 2026-05-21):**

  | 소스 | lag | 비고 |
  |---|---|---|
  | `airbridge_dataset.app_events` | **11시간** | 일 1회 sync, 친구초대 V1과 동일 |
  | `secure_dataset.user` | **~5분** | 백엔드 → BQ 5분 단위 sync (재확인 완료) |

- `secure_dataset.user` 사용 → 5분마다 배치 → 가입 후 5~15분 내 쿠폰 발급 가능 (sync 5분 + cron 5분).
- `product.experiment_user_assignments` 기존 A/B 마스터 테이블 존재하지만 first-free는 FlareLane status까지 함께 추적 필요 → 별도 ledger 운영.

## 구현 계획

### Phase 1: BQ 장부 (`product.first_free_coupon_ledger_v1`)

스키마 (미니멀 + 분석 필수):
```
user_id              INT64   NOT NULL
signed_up_at         TIMESTAMP NOT NULL     -- secure_dataset.user.created_date
assigned_at          TIMESTAMP NOT NULL     -- 배치 처리 시각
variant              STRING   NOT NULL      -- 'control' or 'treatment'
coupon_policy_id     INT64                  -- 215 (treatment 성공시)
flarelane_event_name STRING                 -- 'first_free_coupon_request'
status               STRING                 -- 'pending' / 'sent' / 'flarelane_failed' / 'skipped_control'
status_reason        STRING
processed_at         TIMESTAMP NOT NULL
```
- PARTITION BY DATE(signed_up_at), CLUSTER BY user_id.
- ensure_table_exists()로 배치 첫 실행 시 자동 생성 (친구초대 V1 ledger.py 패턴).

### Phase 2: 배치 스캐폴딩 (`apps/private/first-free-coupon-batch/`)

친구초대 V1 (`covering-invite-batch/`)과 동일 구조:
- `deploy.yml` — type: batch, schedule: `*/5 * * * *` (5분마다)
- `src/config.py` — env (GCP_PROJECT, FLARELANE_PROJECT_ID, FLARELANE_API_KEY) + 상수 (EXPERIMENT_KEY, COUPON_POLICY_ID=215, FLARELANE_EVENT_NAME)
- `src/matcher.py` — secure_dataset.user 신규 가입자 매칭 (지난 30분, ledger 미존재 user_id만)
- `src/ab.py` — `MD5(EXPERIMENT_KEY:user_id) % 100 < 51` → 51:49 결정적 배정 (treatment 우대)
- `src/flarelane.py` — track API 발사 (친구초대 V1 그대로 재사용)
- `src/ledger.py` — ensure_table_exists + insert_rows_json
- `src/main.py` — 오케스트레이션 + 로깅 (AGENTS.md 3대 규칙)
- `requirements.txt`

### Phase 3: 매칭 쿼리 (matcher.py)

```sql
WITH new_signups AS (
  SELECT u.id AS user_id, u.created_date AS signed_up_at
  FROM `covering-app-ccd23.secure_dataset.user` u
  LEFT JOIN `covering-app-ccd23.product.first_free_coupon_ledger_v1` l
    ON l.user_id = u.id
  WHERE u.created_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
    AND u.withdrawal_date IS NULL
    AND l.user_id IS NULL  -- 이미 처리한 유저 제외 (cron 5min + sync 5min + 6회 백필 마진 = 30분)
)
SELECT user_id, signed_up_at FROM new_signups
```

### Phase 4: A/B 배정 (ab.py)

```python
import hashlib
def assign_variant(user_id: int) -> str:
    h = hashlib.md5(f"first_free_v1:{user_id}".encode()).hexdigest()
    return 'treatment' if int(h, 16) % 2 == 1 else 'control'
```
- salt에 experiment key 포함 → 다른 실험 영향 없음.
- BQ FARM_FINGERPRINT와는 다른 알고리즘이지만 Python 측 결정성 보장 (재실행해도 같은 결과).

### Phase 5: FlareLane 발사 (flarelane.py)

친구초대 V1 send_event 그대로 차용:
- POST `https://api.flarelane.com/v1/projects/{projectId}/track`
- payload: `{ events: [{ subjectType:'user', subjectId:str(user_id), type:'first_free_coupon_request', data:{variant, coupon_policy_id, signed_up_at} }] }`
- treatment만 발송. control은 skip.

### Phase 6: 장부 적재 (ledger.py)

- **control**: 1 row INSERT (status='skipped_control', reason='ab_assignment').
- **treatment**: 2-row 패턴으로 중복 발급 방지
  1. `status='pending'` (reason='reserved_before_send') 선점 — 실패 시 FlareLane 발사 스킵
  2. FlareLane 발사
  3. `status='sent'` 또는 `status='flarelane_failed'` 최종 상태 append
- **재발사 차단 원리:** matcher의 `LEFT JOIN ledger ON user_id` 는 status 무관 row 존재 여부만 본다. pending row가 남아 있으면 다음 cron이 해당 user_id를 재매칭하지 않아 FlareLane 재발사 차단.
- **분석 쿼리 패턴:** user별 최신 row만 선택
  ```sql
  SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY processed_at DESC) AS rn
    FROM `covering-app-ccd23.product.first_free_coupon_ledger_v1`
  ) WHERE rn = 1
  ```
- **운영 점검:** `status='pending'` 만 남은 user = "FlareLane 발사 도중/직후 장부 실패" → 수동 재처리 또는 모니터링 대상.

### Phase 7: FlareLane 콘솔 여정 (환희님 사이드)

- Journey: event 이름 `first_free_coupon_request` 수신 → 기존 쿠폰 webhook (`1faa88de-c1e5-4ced-ac43-eace7fde04fa`) 발사.
- covering 백엔드가 정책 215로 쿠폰 발급.

## 변경 파일

- `apps/private/first-free-coupon-batch/` (신규)
- `works/plan/2026-05-21-covering-labs-first-free-coupon-batch.md` (이 PRD)

## 완료 기준

- 로컬 dry-run (`--dry-run`) 시 매칭/배정 정상 동작 + 51:49 분포 근사 확인
- BQ 장부 테이블 자동 생성 + 첫 적재 성공
- FlareLane 콘솔에서 test user로 event 발사 → coupon webhook 발사 → 쿠폰 발급 검증
- 운영 VM CRON 등록 + 5/22 라이브 후 모니터링

## 후속 작업 (이 PR 범위 외)

- 친구톡 D+1/D+3 리마인드 (FlareLane 콘솔 — 환희님)
- 인앱 배너 (백오피스 — 환희님)
- 더 빠른 sync 필요시 백엔드 push webhook 도입 검토
