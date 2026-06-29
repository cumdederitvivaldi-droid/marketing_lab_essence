# largewaste-crosssell-coupon-sync

## 목적 (Purpose)

[ENG-3199] 생활쓰레기 수거 신청 완료 직후 대형폐기물 교차 제안 실험 — 쿠폰 216 자격 신호를 FlareLane track 이벤트로 발사하는 5분 cron 배치.

가설: 생활쓰레기 수거 신청 완료 직후가 사용자 인게이지 최고조 → 이 시점에 3만원 쿠폰 + 친구톡 3회로 대형폐기물 첫 이용 전환.

## 실행 환경 (Execution environment)

- 실행: VM crontab `*/5 * * * *` (5분 주기, `/shared/apps/largewaste-crosssell-coupon-sync/` 위치)
- 보조 cron: D+1, D+6 발송 직전 강제 1회 (lag 마진 — VM crontab 수동 등록)
- Python 3.x (covering-labs VM 표준)
- 인증: GCP 인스턴스 SA 자동 (`google.auth.default()`)
- 로그: `logs/batch.log` (AGENTS.md 로깅 3대 규칙 준수)

## 주요 파일 (Key files)

| 파일 | 역할 |
|---|---|
| `src/config.py` | 환경변수, 테이블 경로, 이벤트명, EXPERIMENT_KEY |
| `src/matcher.py` | BQ 쿼리 (신규 적격자 + 자격 해제자 UNION) |
| `src/flarelane.py` | FlareLane track API (세션 재사용 + 429/5xx retry-with-backoff) |
| `src/ledger.py` | BQ ledger 테이블 자동 생성 + write_row |
| `src/main.py` | 메인 흐름 (pending 선점 → 발사 → 최종 append) |
| `deploy.yml` | 배포 설정 (type=batch, schedule=`*/5 * * * *`) |
| `requirements.txt` | google-cloud-bigquery, requests, protobuf |

## 환경변수 (`/shared/.env`)

| 변수명 | 용도 | 비고 |
|---|---|---|
| `GCP_PROJECT` | BigQuery 프로젝트 (`covering-app-ccd23`) | 공통 |
| `FLARELANE_PROJECT_ID` | FlareLane 프로젝트 ID | 공통 |
| `FLARELANE_API_KEY` | FlareLane track API 키 | 공통 |

## 실행 방법 (Execution method)

```bash
# 정상 실행 (CRON에서 5분마다 자동)
python3 src/main.py

# dry-run — FlareLane track 발사 + ledger INSERT 모두 스킵, 매칭 결과만 로그
python3 src/main.py --dry-run
```

## 흐름

```text
[5분마다 CRON]
  ↓
BQ: order_v2 (status != 'CANCELED', 신청 완료) × 마수동 동의 × 최근 N분 (ledger eligible 미기록만)
  ↓
FlareLane track 이벤트 발사 (largewaste_eligible_signal)
  ↓
ledger INSERT (signal_type=eligible, status=sent)

BQ: 자격 해제자 (ledger disqualified 미기록만, UNION ALL)
  ├─ coupon_used: 쿠폰 216 사용 (user_coupon × order_v2.user_coupon_id, status=COMPLETED)
  └─ largewaste_submitted: 대형폐기물 신청 (order_line+product=PICKUP_LARGE_COVERING_BAG, status != 'CANCELED')
  ↓
FlareLane track 이벤트 발사 (largewaste_disqualified_signal, payload에 reason 포함)
  ↓
ledger INSERT (signal_type=disqualified, disqualified_reason=..., status=sent)
  ↓
실패는 batch.log 에 ERROR 레벨로 기록 (운영 알림 / KPI 리포트는 별도 batch 앱에서 처리)

[FlareLane 콘솔 여정 — 별도 환희 작업]
  largewaste_eligible_signal     → Tag coupon_216_eligible=true  → D0/D+1/D+6 친구톡 + SMS fallback
  largewaste_disqualified_signal → Tag coupon_216_eligible=false → 잔여 여정 EXIT (시퀀스 어느 회차든 즉시 차단)
```

## 종속 서비스 (Dependent services)

- **BigQuery** (`covering-app-ccd23.secure_dataset`)
  - `order_v2` — 신청/완료 주문
  - `order_line` — 주문 라인
  - `product` — `product_code` 필터 (`PICKUP_LARGE_COVERING_BAG`)
  - `user_coupon` — 정책 216 사용 확정 매칭
  - `device` — 마수동 동의 (최신 dedup)
- **BigQuery** (`covering-app-ccd23.product`)
  - `largewaste_crosssell_coupon_ledger_v1` — 자동 생성, 중복 발사 차단 + 분석용 (15 컬럼, partition `matched_at`, clustering `experiment_key, signal_type, user_id`)
- **FlareLane** — track API (이벤트 발사, 429/5xx exponential backoff) + 콘솔 여정 (Tag 조작 + 분기)

## 주의사항 (Precautions)

- **마수동 게이트 필수**: `device.is_marketing_agree=true` (최신 dedup) 만 발송 대상. 마수동 토글 OFF 한 유저는 다음 cron부터 자동 제외.
- **Positive Selection (Fail-Closed)**: 콘솔 여정 진입 조건은 Tag `coupon_216_eligible=true` 일 때만 발송. 배치 장애로 eligible 이벤트가 안 가면 Tag도 set 안 됨 → 자동 발송 차단 (오발송 방지).
- **5분 간격 중복 실행 방지**: ledger LEFT JOIN으로 이미 처리한 user 제외. pending 선점 패턴으로 cron 겹침 시 같은 user 재발사 차단.
- **pending 자동 복구 (TTL)**: `pending` 상태가 `PENDING_RETRY_AFTER_MINUTES`(기본 15분) 이상 지속되면 LEFT JOIN 차단 해제 → 다음 cron이 재처리. 영구 누락(크래시·OOM 등) 자가 복구 목적.
- **`coupon_used` 정의**: 본 실험 진입 이후 발급된 정책 216 쿠폰의 사용만 자격 해제 대상. 실험 외 채널로 사전 그랜트된 216 쿠폰은 제외 (matcher의 `eligible_entries` JOIN).
- **ledger 파티셔닝/클러스터링**: 파티션 `matched_at` (DAY), 클러스터 `experiment_key, signal_type, user_id`. 분석 시 파티션 필터 권장.
- **첫 결제 0원 캠페인과 동시 진행**: 코호트 교차 분리 룰 정훈님 5/27 확정 후 matcher에 추가 필터 가능.
- **메시지 카피 제약**: 쿠폰이 기술적으로 전 서비스 사용 가능. 메시지에서 "대형폐기물 사용" 강조로 의도 유도.

## 관련 문서

- PRD: `works/plan/2026-05-21-covering-labs-largewaste-crosssell-coupon-sync.md`
- Linear: [ENG-3199](https://linear.app/covering/issue/ENG-3199)
- 노션 실행 문서: https://www.notion.so/3655e589dc9f80a2b138f72013b75e25
- 같은 패턴 참고: `apps/private/first-free-coupon-batch/`
