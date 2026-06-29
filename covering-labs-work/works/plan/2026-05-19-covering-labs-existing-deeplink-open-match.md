# 친구초대 V2 기존 가입자 매칭에 App Deeplink Open 포함 (post-release fix)

- type: Plan
- created: 2026-05-19
- status: 확정

## 목표

V2 친구초대 흐름에서 기존 가입자가 카톡 단축링크 클릭 → 앱 자동 오픈한 케이스가 매칭 누락되어 쿠폰이 발급되지 않는 문제를 해결한다.

## 현황 분석

### 발견 경위
- 2026-05-19 09:00 KST 첫 V2 정책 적용 cron에서 기존 가입자(`recipient_type=existing`) 33건만 발급됨
- 사전 예상치(~300건) 대비 현저히 적은 수치 → 누락 케이스 추적

### 원인
[matcher.py](apps/private/covering-invite-batch/src/matcher.py) 4개 매칭 쿼리가 `Event_Name = 'App Open'`만 필터링.

V2 친구초대 흐름 (카톡 단축링크 → 앱 universal link로 자동 오픈)에서는 **`App Deeplink Open`** 이벤트가 발생하는데, 이게 모든 매칭 쿼리에서 제외되어 발급 누락:

- `opens_pre_signup` (line 52) — 신규 개인화 (가입 전 진입자)
- `opens_public_pre_signup` (line 125) — 신규 공용
- `opens_deeplink_existing` (line 187) — 기존 개인화
- `opens_public_existing` (line 222) — 기존 공용

### 누락 규모 (5/12~5/18 7일 기준)
- 전체 V2 진입 user 445명
- App Open 있음 (현재 매칭됨): 258명
- **App Deeplink Open만 있고 App Open 없음**: 57명
  - 그 중 already_issued 아님 = **40명 발급 누락**

## 구현 계획

[matcher.py](apps/private/covering-invite-batch/src/matcher.py) 4개 쿼리에서:

```diff
- WHERE Event_Name = 'App Open'
+ WHERE Event_Name IN ('App Open', 'App Deeplink Open')
```

`App Install` 관련 CTE는 별도 이벤트(`App Install`)를 사용하므로 영향 없음.

## 완료 기준

- [x] matcher.py 4개 쿼리 모두 `App Deeplink Open` 포함
- [ ] PR 머지 + 운영 VM 배포 완료
- [ ] 운영 VM에서 main.py 1회 강제 실행 → 누락 40명 발급 확인
- [ ] 다음 cron(5/20 09:00)부터 정상 동작 확인
- [ ] BQ 장부 `recipient_type='existing'` row 정상 증가 확인

## 영향 범위

### 즉시 영향
- 5/19 09:00 cron에서 누락된 40명 (기존 가입자) → 본 PR 머지 + 강제 실행 시 일괄 발급
- 1인당 3,000원 × 40명 = 120,000원

### 향후 영향
- V2 친구초대 흐름에서 발생하는 모든 App Deeplink Open 이벤트가 매칭 대상에 포함됨
- 신규 개인화/신규 공용/기존 개인화/기존 공용 4가지 흐름 전체에 적용

### 사이드이펙트 검증
- `App Deeplink Open` 이벤트는 Universal link로 앱 자동 오픈 시점 (기존 설치자 한정)
- `App Install` 매칭 (신규) 쿼리에는 변경 없음 (Install 이벤트 별도)
- dedup 가드 (`already_issued` + 루프 내 `invitee_id` 가드)가 작동하므로 중복 발급 위험 없음
- 신규/기존 우선순위 dedup (matcher.py:282-287) 정상 작동
