# 친구초대 V2 본 앱 디자인 반영 플랜

> 유형: 플랜
> 작성일: 2026-05-12
> 상태: 검토중

## 목표

`apps/public/covering-invite` 본 운영 앱을 V2 (기존 가입자 3,000원 혜택 추가) 디자인으로 업데이트한다.

## 현황 분석

- V1: 신규 가입자 30,000원 지원금만. CRM 발송 기반.
- V2: 기존 가입자 3,000원 쿠폰 추가. 앱 내 [친구초대] 버튼 진입 (개인화 없음, 공용 URL).
- 정훈님 PR #227 (`products/covering-invite/`) — 별도 폴더에 V2 preview 코드 + 정훈님 Vercel scope(`carrys-projects-6bce1dc1`)에 QA preview. 운영 반영 위해 본 운영 앱 코드 변경 필요.
- 디자이너로부터 V4 PNG 자산 17장 수령.

## 어뷰징 정책 (확정)

| 변수 | 결정 |
|---|---|
| 본인인증 (PASS CI) | 안 함 |
| 기가입자 정의 | 모든 가입자 (휴면 포함) |
| 디바이스 1회 차단 | 도입 (batch matcher 후속 PR) |
| 쿠폰 사용 조건 | 쿠폰 시스템 명세 따름 |

## 구현 계획

- V4 PNG 17장을 `apps/public/covering-invite/public/assets/figma/` 의 해당 슬롯에 갈아끼움
- inviter sticky-banner 제거 (V4 디자인에서 사라짐)
- inviter benefits-card 신규 슬롯 추가 (hero 다음, "가입 여부 상관없이 혜택 드려요")
- alt 텍스트 V2 카피로 갱신
- 보상 정책 (신규 30k / 기존 3k) 매칭 로직은 batch 후속 PR에서 처리

## 완료 기준

- `npm run build` 통과 (✓)
- 로컬 dev 확인 (✓)
- Vercel preview 확인 + 디자이너 검수 OK
- 후속 PR 일정 확정: `covering-invite-batch` matcher.py 디바이스/유저 1회 차단 + 기존 가입자 3k 분기

## 변경 기록

- 2026-05-12: V4 PNG 17장 슬롯 매핑 후 갈아끼움
- 2026-05-12: inviter sticky-banner section 제거
- 2026-05-12: inviter benefits-card section 신규 추가 (hero 다음)
- 2026-05-12: alt 텍스트 V2 카피로 갱신
- 2026-05-12: `npm run build` 통과 확인
