# PRD — largewaste-crosssell-coupon-sync

> 유형: PRD
> 생성일: 2026-05-21
> 상태: 확정
>
> Linear: [ENG-3199](https://linear.app/covering/issue/ENG-3199)
> 노션 실행 문서: https://www.notion.so/3655e589dc9f80a2b138f72013b75e25
> 라이브 목표: **2026-05-29 (금)**

---

## 1. 목표

[26 2Q KR1] 생활쓰레기 수거 신청 완료 직후 대형폐기물 교차 제안 실험의 인프라(쿠폰 자격 동기화 배치)를 구성한다.

이 배치는 실험 본체(FlareLane 친구톡 여정)가 발사될 조건(쿠폰 216 자격 보유 여부)을 5분 간격으로 FlareLane에 **track 이벤트로 발사**하는 역할만 담당한다. 발사된 이벤트는 콘솔 여정에서 listen → User Tag set/unset + 분기를 트리거한다 (Tag 조작은 콘솔에서, 배치는 신호만 보냄).

## 2. 배경 / 문제

- 대형폐기물은 객단가가 높고 마진이 좋지만 첫 이용 진입장벽이 크다 (앱 내 메뉴 깊이 + 첫 이용자의 가격 인지 부재).
- 기존 대형폐기물 광고/CRM은 모집 시점이 분산되어 있어 인게이지가 낮다.
- 가설: **생활쓰레기 수거 신청을 완료한 직후가 사용자 인게이지의 최고조** → 이 시점에 한정 쿠폰(3만원) + 친구톡 3회를 결합하면 대형폐기물 첫 이용 전환을 유의미하게 끌어올릴 수 있다.

## 3. 가설

- 생활쓰레기 수거 신청 완료(`AddOrderComplete`) 직후 3만원 정액 쿠폰(정책 216) 지급
- 친구톡 3회(D0 / D+1 / D+6) 발송으로 대형폐기물 첫 결제 유도
- 측정: 쿠폰 사용률(216 정책) + 대형폐기물 첫 결제 전환율

## 4. 현황 분석

### 4-1. 모수 (마수동 게이트 적용, 2026-05-21 기준)

| 기준 | order_v2 COMPLETED × 마수동 동의 |
|---|---|
| 30일 | 60,363 명 |
| 60일 | 86,192 명 |
| 90일 | 106,846 명 |

> 마수동률 ~71%, 일평균 적격 신규 ~2,000명
> ⚠️ 위 수치는 `status='COMPLETED'` 기준 (초기 산정 시점). **실제 트리거는 `status != 'CANCELED'` (신청 완료) 이므로 실제 발사 모수는 더 많음** — 재산정 별도 진행.

### 4-2. 트리거 이벤트 검증

- `AddOrderComplete` (Airbridge Order Complete) — 30일 unique users **6.9만**, 정상 발화 중
- FlareLane 콘솔 발화량은 별도 확인 예정 (Airbridge 카운트와 비교)

### 4-3. 쿠폰 정책

| 항목 | 값 |
|---|---|
| 정책 ID | 216 |
| 금액 | 정액 3만원 |
| 유효기간 | 7일 |
| 사용 제한 | 1회 |
| 적용 범위 | (현재 기술 제약) 전 서비스 — 메시지 카피에서 "대형폐기물에 사용" 강조로 유도 |

## 5. 실험 설계

### 5-1. 트리거

생활쓰레기 수거 **신청 완료** (`order_v2` row INSERT) → BQ 5분 sync → 이 배치가 `largewaste_eligible_signal` 발사 → FlareLane 콘솔 여정이 받아서 백엔드 webhook(`1faa88de-c1e5-4ced-ac43-eace7fde04fa`) 호출 → 정책 216 쿠폰 발급

조건:
- `order_v2.status != 'CANCELED'` (윈도우 사이 취소된 건은 제외)
- `device.is_marketing_agree=true` (최신 device dedup)
- user별 가장 빠른 자격 부여 주문 1건만

> webhook 재사용 가능 여부 인준님 확인 완료 (first-free-coupon-batch 와 동일 webhook 재사용)

### 5-2. 메시지 시퀀스

| 노드 | 시점 | 채널 | 비고 |
|---|---|---|---|
| D0 | 트리거 직후 | 친구톡 | 쿠폰 지급 안내 |
| D+1 | 24h | 친구톡 | 사용 리마인드 |
| D+6 | 6일 후 (만료 D-1) | 친구톡 | 만료 임박 |
| Fallback | 각 노드 | SMS | 친구톡 미도달 시 |

### 5-3. 중단 로직

자격 해제 두 가지 사유 중 하나라도 발생하면 잔여 친구톡 발송을 차단한다 (시퀀스 중간 어느 회차에서든 즉시 중단 — 1차 후 차단 시 2/3차 안 감, 2차 후 차단 시 3차 안 감).

| 사유 (reason) | 조건 |
|---|---|
| `coupon_used` | 쿠폰 216 사용 (`user_coupon.coupon_policy_id=216` + `order_v2.user_coupon_id` 매칭, `status=COMPLETED`) |
| `largewaste_submitted` | 대형폐기물 신청 완료 (`order_line.product` = `PICKUP_LARGE_COVERING_BAG`, `status != 'CANCELED'`) — 쿠폰 안 써도 대형폐기물 신청 자체로 차단 |

- BQ 5분 sync → 두 케이스 합쳐서 user별 가장 빠른 1건 → track 이벤트 `largewaste_disqualified_signal` 발사 (payload에 `disqualified_reason` 포함)
- FlareLane 콘솔 여정: 이벤트 수신 → Tag `coupon_216_eligible=false` set
- 잔여 노드(D+1, D+6) 진입 조건: Tag `true` 만 통과 (positive selection, fail-closed)

## 6. 구현 계획 (이 배치 범위)

### 6-1. 데이터 플로우

```text
[5분마다 CRON]
  ↓
BQ 쿼리 A: 신규 적격자 추출
  - order_v2 status != 'CANCELED' × 마수동 동의 × 최근 N분
  - 이미 ledger eligible 기록 있는 user 제외 (incremental)
  - user별 가장 빠른 1건 (ROW_NUMBER)
  ↓
FlareLane track 이벤트 발사 (largewaste_eligible_signal)
  ↓
ledger INSERT (signal_type=eligible, status=sent)

[병렬 — 같은 cron 안에서]

BQ 쿼리 B: 자격 해제자 추출 (UNION ALL)
  - 사유 1 coupon_used: user_coupon 정책 216 × order_v2.user_coupon_id 매칭 (status=COMPLETED)
  - 사유 2 largewaste_submitted: order_line+product (PICKUP_LARGE_COVERING_BAG) × status != 'CANCELED'
  - 이미 ledger disqualified 기록 있는 user 제외
  - user별 가장 빠른 1건 (ROW_NUMBER, 사유 무관)
  ↓
FlareLane track 이벤트 발사 (largewaste_disqualified_signal, payload에 disqualified_reason 포함)
  ↓
ledger INSERT (signal_type=disqualified, disqualified_reason=coupon_used|largewaste_submitted, status=sent)
  ↓
Slack alert (실패/이상 시)

[FlareLane 콘솔 여정 — 별도 환희 작업, 5/27 이후]
  largewaste_eligible_signal     → Tag coupon_216_eligible=true  set → D0/D+1/D+6 친구톡
  largewaste_disqualified_signal → Tag coupon_216_eligible=false set → 잔여 여정 EXIT
                                                                       (시퀀스 어느 회차든 즉시 차단)
```

### 6-2. 분기 안전 패턴 — Positive Selection (Fail-Closed)

- 콘솔 여정 진입 조건: Tag `coupon_216_eligible=true` 일 때만 발송
- Tag missing / false / 에러 → EXIT (발송 안 됨)
- **Why fail-closed**: 배치 장애로 eligible 이벤트가 안 가면 Tag도 set 되지 않아 자동으로 발송 차단. Negative selection(`false` 시 차단)을 쓰면 배치가 죽었을 때 "차단해야 할 유저"가 차단되지 않고 발송된다.

### 6-3. 주요 컴포넌트

| 컴포넌트 | 역할 |
|---|---|
| `src/config.py` | 환경변수 + 테이블 경로 + 이벤트명 + EXPERIMENT_KEY |
| `src/flarelane.py` | FlareLane track API (커넥션 풀 재사용) |
| `src/ledger.py` | BQ ledger 테이블 자동 생성 + write_row |
| `src/matcher.py` | BQ 쿼리 (신규 적격자 + 자격 해제자 UNION) |
| `src/main.py` | 메인 흐름 (pending 선점 → 발사 → 최종 append) |

**입력 BQ 테이블** (모두 `covering-app-ccd23.secure_dataset`):
- `order_v2` — 신청/완료 주문
- `order_line` — 주문 라인 (product_id 매핑)
- `product` — product_code (`PICKUP_LARGE_COVERING_BAG`)
- `user_coupon` — 쿠폰 발급/사용 정보 (정책 216 사용 확정)
- `device` — 마수동 동의 (최신 dedup)

**출력**:
- FlareLane track 이벤트 (`largewaste_eligible_signal`, `largewaste_disqualified_signal`)
- BQ ledger 테이블 `covering-app-ccd23.product.largewaste_crosssell_coupon_ledger_v1`

**ledger 분석 컬럼** (스키마):

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `user_id`, `experiment_key`, `signal_type` | INT64/STRING/STRING | 식별 (NOT NULL) |
| `order_id`, `order_number`, `order_submitted_at` | INT64/STRING/TIMESTAMP | eligible 시 — 자격 부여 주문 |
| `is_marketing_agree` | BOOL | eligible 시 마수동 스냅샷 |
| `disqualified_reason` | STRING | `coupon_used` / `largewaste_submitted` |
| `coupon_policy_id`, `user_coupon_id` | INT64 | disqualified+coupon_used 시 |
| `disqualified_order_id`, `disqualified_at` | INT64/TIMESTAMP | disqualified 시 — 트리거 주문 |
| `flarelane_event_name` | STRING | 발사 이벤트명 |
| `status`, `status_reason` | STRING | `pending`/`sent`/`flarelane_failed` |
| `matched_at`, `processed_at` | TIMESTAMP | 처리 메타 (NOT NULL) |

- 파티션: `matched_at` (DAY)
- 클러스터링: `experiment_key`, `signal_type`, `user_id`

### 6-4. 운영

- VM crontab: `*/5 * * * *` (deploy.yml `schedule`)
- 보조 cron 1회: D+1, D+6 발송 직전 (lag 마진 확보) — VM crontab에 수동 등록
- 로깅: `logs/batch.log` (AGENTS.md 로깅 3대 규칙 준수)

## 7. 외부 의존

| 항목 | 담당 | 기한 / 상태 |
|---|---|---|
| webhook `1faa88de` 정책 216 재사용 가능 여부 | 인준 | 확인 완료 |
| FlareLane 콘솔 AddOrderComplete 발화량 검증 (vs Airbridge 6.9만) | 환희 | 확인 완료 |
| 디자인 3벌 | 자현 | 5/27 |
| 카피 최종본 | 하동권 | 5/26 |
| Airbridge tracking link 3개 (D0/D+1/D+6) | 환희 | 카피·디자인 도착 후 |
| 첫 결제 0원 캠페인과 코호트 교차 정책 | 정훈 | 라이브 전 합의 |

## 8. 완료 기준

- [ ] 5분 cron 3일 연속 무에러 (`logs/batch.log` 시작/완료 마커 정상)
- [ ] track 이벤트 발사 카운트 ↔ FlareLane 콘솔 여정 진입 카운트 일치 (±5% 이내)
- [ ] disqualified 두 사유 검증 (테스트 유저로 E2E)
  - 쿠폰 사용 케이스 (`coupon_used`)
  - 쿠폰 미사용 + 대형폐기물 신청 케이스 (`largewaste_submitted`)
- [ ] dry-run 모드 정상 동작 (FlareLane 호출 + ledger INSERT 스킵) — **완료 (2026-05-21, eligible 83건/disqualified 10건)**
- [ ] Slack alert 동작 검증 (실패 케이스 강제 발생)

## 9. 롤백

| 시나리오 | 액션 |
|---|---|
| 메시지 카피 문제 | FlareLane 여정 콘솔에서 일시정지 |
| 쿠폰 정책 문제 | 백엔드에서 webhook 응답 차단 |
| 전체 발송 차단 필요 | FlareLane 콘솔 여정 일시정지 (Tag 일괄 변경 불필요 — 여정 진입 자체 차단) |

## 10. 주의사항

- **첫 결제 0원 캠페인과 동시 진행** — 코호트 교차 시 어느 캠페인 영향인지 분리 불가. 정훈님과 라이브 전 합의 필요.
- **마수동 게이트 필수** — `secure_dataset.device.is_marketing_agree=true` (최신 device dedup) 만 발송 대상.
- **메시지 카피 제약** — 쿠폰이 기술적으로 전 서비스 사용 가능하므로 "대형폐기물 사용" 강조로 사용 의도 유도. 향후 서비스 한정 쿠폰 기능 백로그 검토.

## 11. 관련 링크

- Linear: [ENG-3199](https://linear.app/covering/issue/ENG-3199)
- 노션 실행 문서: https://www.notion.so/3655e589dc9f80a2b138f72013b75e25
- 코드: `apps/private/largewaste-crosssell-coupon-sync/`
- 같은 패턴 참고: `apps/private/first-free-coupon-batch/`
- 쿠폰 정책 216 (백오피스)
