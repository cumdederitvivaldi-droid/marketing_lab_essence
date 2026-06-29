# covering-spot 전화 상담 신청 섹션 추가

> 유형: PRD
> 작성일: 2026-05-18
> 상태: 완료

## 배경

- 현재 covering-spot 랜딩(`public-labs.covering.app/covering-spot`)의 모든 CTA는 카카오톡 채널로 유입된다.
- 카카오톡 진입을 꺼리거나 PC 환경에서 빠르게 연락처만 남기고 싶은 사용자를 위한 **대체 유입 경로**가 필요하다.
- 백엔드는 `covering-spot-chatbot`(별도 Vercel) 의 공개 API `/api/public/inbound-lead`를 사용. 같은 phone 재전송 시 업서트.
- 결과는 백오피스 `covering-spot-chatbot.vercel.app/lab/outbound` 의 아웃바운드 리스트에 `소스: 🌐 웹 랜딩`으로 노출.

## 목표

1. 랜딩에 "전화 상담 신청" 폼 추가 (이름·전화·주소 필수, 품목·메모 선택)
2. 폼 제출 → 백엔드 공개 API 로 전달
3. Mixpanel/Meta Pixel 트래킹 (기존 CTA 와 동일 컨벤션)
4. 기존 카카오 CTA 와 공존 — 카카오 진입을 막거나 우회시키지 않음
5. `/consult` 전용 페이지 신설 + Hero/Nav/FloatingCTA 에 전화 상담 진입점 추가

## 비목표

- DB·세션·로그인 추가 없음
- 결제·예약 흐름 통합 없음

---

## 최종 사양 (active)

### 아키텍처

```
[브라우저: PhoneConsultation form]
    ↓ POST (직접 cross-origin, no auth headers)
[covering-spot-chatbot.vercel.app/api/public/inbound-lead]
    ├─ Origin 헤더 검증 (INBOUND_LEAD_ORIGINS allowlist)
    │   허용: public-labs.covering.app, localhost:3030, localhost:3000
    └─ upsert by phone (중복 row 생성 안 됨)
    ↓
[CRM 아웃바운드 리스트: covering-spot-chatbot.vercel.app/lab/outbound]
    소스: 🌐 웹 랜딩
```

**키/시크릿/env 없음.** 백엔드가 Origin 헤더로 인증 — 브라우저는 Origin 위조 못 함.

### UX

- 위치: 홈 페이지 `FAQ` ↔ `CTASection` 사이 + `/consult` 전용 페이지
- 입력
  | 필드 | 필수 | 비고 |
  |---|---|---|
  | 이름 | ✓ | 최대 20자 |
  | 전화번호 | ✓ | 자동 포맷팅 `010-XXXX-XXXX`, 11자 절단 |
  | 주소 | ✓ | 자유 입력, 최대 120자 |
  | 품목 메모 | ✗ | 예: "옷장 2개 침대 1개" |
  | 요청 메모 | ✗ | 예: "토요일 가능" |
- 제출 버튼: 필수 3개 입력 + phone digits ≥ 9 일 때 활성
- 클릭 시 `loading=true`, 폼 disabled, AbortController 10s 타임아웃
- 성공 → 폼이 "신청 완료" 카드로 전환 (카톡 추가 문의 CTA `extra=web_after_consult`)
- 실패 → 폼 위 빨간 박스 + 콘솔 상세 로그
- 5초 dedupe: 동일 phone 재전송 시 클라이언트 sessionStorage 로 차단

### 트래킹

- `[CLICK] SpotHomeScreen_phoneSubmit` — 제출 시도
- `[EVENT] SpotPhoneLeadSubmit` — 성공 (+ `fbq("track","Contact",{location:"phone_form"})` + Naver CTS `lead`)
- `[ROUTE] SpotPhoneScreen` — `/consult` 페이지 진입
- `[CLICK] SpotHomeScreen_phoneNav` — Hero/Nav/FloatingCTA 전화 상담 버튼 클릭

### CTALink `extra` 매핑 (백엔드 식별)

| 위치 | location | extra |
|---|---|---|
| Hero 카톡 | `hero` | `web_hero` |
| Nav 카톡 (PC + 모바일) | `nav` | `web_nav` |
| FloatingCTA 카톡 | `floating` | `web_floating` |
| 폼 하단 "5분만에 견적받기" | `consult` | `web_consult` |
| 폼 성공 카드 카톡 | `after_consult` | `web_after_consult` |
| 하단 CTASection 카톡 | `bottom` | `web_bottom` |

광고 인입(fbclid/utm_source) 시 모두 `web_ad_{campaign}` 또는 `web_ad`로 자동 치환.

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/app/consult/page.tsx` | 신규 — `/consult` 전용 페이지 |
| `src/components/sections/PhoneConsultation.tsx` | 신규 — 폼 섹션 |
| `src/components/ui/PhoneCTALink.tsx` | 신규 — `/consult` 라우팅 + 트래킹 |
| `src/app/page.tsx` | `<PhoneConsultation />` 삽입 |
| `src/lib/constants.ts` | `CONSULT_PATH`, `CONSULT_URL`, `COVERING_INBOUND_LEAD_URL` |
| `src/lib/analytics.ts` | 이벤트/locaiton 타입 확장 |
| `src/lib/format.ts` | `formatPhone` 함수 추가 |
| `src/components/sections/Hero.tsx` | 카톡 + 전화 상담 CTA 2개 분리 |
| `src/components/layout/Nav.tsx` | 카톡 상담 + 전화 상담 진입점 |
| `src/components/layout/FloatingCTA.tsx` | 카톡 + 전화 상담 2개 |
| `src/components/analytics/AnalyticsProvider.tsx` | `/consult` 라우트 트래킹 |
| `src/app/sitemap.ts` | `/consult` 등록 |
| `tests/format-phone.test.mjs` | 신규 — `formatPhone` unit test |
| `CLAUDE.md` | 구조/환경변수 섹션 업데이트 |

### 검증

- [x] `npx tsc --noEmit` 0건
- [x] `npx eslint <changed files>` 0건 (사전 존재 Hero setState-in-effect warning은 본 PR 범위 외)
- [x] `node --test tests/format-phone.test.mjs` 통과 (6/6)
- [x] 로컬 `localhost:3030/covering-spot/consult` 에서 폼 제출 → 백오피스 `/lab/outbound` 신규 리드 노출 (origin: `localhost:3030`)
- [x] 동일 phone 5초 내 재제출 → 클라이언트 dedupe 차단 메시지

---

## 이전 안 (폐기, 2026-05-18)

> 아래 내용은 **백엔드가 키 기반 인증을 사용하던 시점의 초기 안**이다.
> 백엔드가 `INBOUND_LEAD_ORIGINS` allowlist 방식으로 전환되면서 폐기됨.
> 히스토리 보존 목적으로 남김 — **활성 사양 아님.**

### 이전 데이터 흐름

```
[브라우저: 폼]
    ↓ POST /api/contact
[랜딩 server route: app/api/contact/route.ts]  ← 폐기됨
    ├─ env: COVERING_LEAD_KEY (X-Lead-Key 헤더)  ← 폐기됨
    ↓ POST with X-Lead-Key
[백엔드 inbound-lead]
```

### 이전 환경변수 (현재는 모두 불필요)

| 변수 | 상태 | 비고 |
|---|---|---|
| `COVERING_LEAD_KEY` | ❌ 폐기 | 백엔드 origin-only 인증으로 더이상 필요 없음 |
| `COVERING_INBOUND_LEAD_URL` (env) | ❌ 폐기 | `src/lib/constants.ts` 상수로 하드코딩 |

### 폐기된 파일

- `src/app/api/contact/route.ts` — 서버 프록시 라우트, PR 머지 전에 삭제 완료
