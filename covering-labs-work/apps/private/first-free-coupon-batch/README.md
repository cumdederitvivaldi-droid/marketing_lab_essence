# first-free-coupon-batch

첫 결제 0원 실험 — 신규 가입자에 51:49(treatment 우대) A/B 배정 후 treatment에 FlareLane 이벤트를 발사해 쿠폰 자동발급을 트리거하는 배치.

## 흐름

```text
[5분마다 CRON]
  ↓
secure_dataset.user에서 최근 30분 신규 가입자 조회 (ledger 미존재 user만 = 미처리 분만)
  ↓
user_id 해시 → 51:49 결정적 배정 (treatment 우대, control/treatment)
  ↓
treatment → FlareLane track API 발사 (event: first_free_coupon_request)
  ↓
[FlareLane 콘솔 여정] event 수신 → 기존 쿠폰 webhook 발사 → 백엔드가 정책 215로 쿠폰 발급
  ↓
treatment: ledger pending 선점 → FlareLane 발사 → 최종 상태 append (중복 발급 차단)
control: ledger 1 row (status=skipped_control)
```

## 데이터

- 입력: `covering-app-ccd23.secure_dataset.user` (백엔드 sync, ~5분 단위)
- 출력: `covering-app-ccd23.product.first_free_coupon_ledger_v1` (자동 생성)
- FlareLane: track API + 콘솔 여정 (event `first_free_coupon_request` → webhook `1faa88de-c1e5-4ced-ac43-eace7fde04fa`)

## 환경변수 (`/shared/.env`)

- `GCP_PROJECT` = `covering-app-ccd23`
- `FLARELANE_PROJECT_ID` (공통)
- `FLARELANE_API_KEY` (공통)

## 실행

```bash
# 정상 실행 (CRON에서 5분마다)
python3 src/main.py

# dry-run — FlareLane 발송 + ledger INSERT 모두 스킵, 매칭/배정 결과만 로그
python3 src/main.py --dry-run
```

## 관련 문서

- PRD: `works/plan/2026-05-21-covering-labs-first-free-coupon-batch.md`
- 실험 명세 (노션): `3645e589dc9f80d9bc11d055ac4dc13d`
- 랜딩 페이지: `apps/public/covering-first-free/`
- 친구초대 V1 (같은 패턴 참고): `apps/private/covering-invite-batch/`
