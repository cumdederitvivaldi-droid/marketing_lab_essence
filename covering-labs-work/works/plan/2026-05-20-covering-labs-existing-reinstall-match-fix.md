---
type: Plan
created: 2026-05-20
status: 확정
issue: ENG-2942
---

# 친구초대 V2 매칭 누락 - 기 가입자 V2 share 재설치 케이스 fix

## 목표
- `PUBLIC_EXISTING_MATCH_QUERY` / `EXISTING_MATCH_QUERY` 의 커버리지 갭 해결
- 기 가입자가 V2 친구초대 페이지(공용 또는 개인화) 거쳐 앱을 **재설치**한 케이스에서 App Install만 발생하고 App Open이 잡히지 않는 흐름을 매칭 대상에 포함

## 현황 분석
- 2026-05-19 PR #304로 App Deeplink Open 누락 fix 후, 5/20 cron 정상 동작 (신규 40 + 기존 11)
- 5/20 미발급 V2 진입자 전수 조사 중 user_id 442732 (4/5 가입) 1명 누락 발견
- 진입 흐름:
  - 5/18 09:23:08: App Install (Channel=referral_bridge, Ad_Group=friend_invite_v1_public, User_ID=null)
  - 5/18 09:23:25: Home Screen (User_ID=442732) — 자동 로그인
  - **App Open 이벤트 미발생**
- 기존 PUBLIC_EXISTING_MATCH_QUERY는 `Event_Name IN ('App Open', 'App Deeplink Open')` 만 매칭 → 재설치 직후 Home Screen 직행 케이스 누락

## 구현 계획
### A. PUBLIC_EXISTING_MATCH_QUERY 보강 ([matcher.py:215-272](../../apps/private/covering-invite-batch/src/matcher.py#L215-L272))
- 신규 CTE `installs_public_existing` 추가
- App Install (referral_bridge + friend_invite_v1_public) + 직후 48h 내 동일 device의 User_ID 이벤트 매칭
- `secure_dataset.user.created_date < installed_at - 48h` 조건으로 기 가입자만 통과 (신규 가입자는 PUBLIC_MATCH_QUERY 경로 유지)
- 기존 opens 경로와 UNION → user_id 단위 dedup

### B. EXISTING_MATCH_QUERY 보강 (개인화 invite_code 링크 동일 패턴)
- 동일 구조의 `installs_deeplink_existing` CTE 추가
- App Install + tracking_link Target_URL에 invite_code 포함된 케이스 + 기 가입자 검증

## 완료 기준
- 442732 매칭 대상 포함 (3,000원, recipient_type=existing)
- 기존 opens 경로 결과 동일 — 회귀 없음
- BQ 시뮬레이션 통과 (installs 신규 매칭 1건 = 442732, 다른 false positive 없음)

## 영향 범위
- 5/18 V2 라이브 이후 같은 패턴 잠재 누락 1명 (442732) 즉시 발급 가능
- 향후 기 가입자 V2 재설치 케이스 정상 처리
- 신규 가입자 흐름 (PUBLIC_MATCH_QUERY) 영향 없음
- 발급 금액 정책 변경 없음 (기존 3,000원 정책212 적용)

## 후속 액션
- PR 머지 후 인준님 main.py 강제 실행 → 442732 발급 (5/19 14:51 패턴과 동일)
- BQ 시뮬레이션 SQL: `C:\tmp\verify_fix.sql`
