# 첫 결제 0원 실험 랜딩 페이지

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 완료

## 목표

신규 가입 유저에게 "커버링 첫 수거 0원" 혜택을 안내하고 앱 진입까지 유도하는
공개 랜딩 페이지를 covering-labs `apps/public/`에 추가한다.

## 현황 분석

- 첫 결제 0원 실험(노션 3645e589dc9f80d9bc11d055ac4dc13d) 진행을 위해 랜딩 페이지가 새로 필요하다.
- 디자인은 친구초대 V2와 동일한 "이미지 이어붙이기" 방식이라 V2 스캐폴딩을 그대로 차용 가능.
- 진입 후 CTA 클릭으로 앱 설치/딥링크를 유도해야 하므로 Airbridge 트래킹 링크가 필요. 매 클릭이 동일 링크라 invite_code별 unique가 필요한 V2와 달리 콘솔 1회 등록 후 shortUrl 하드코딩 패턴이 적합.
- A/B 효과 측정을 위해 Mixpanel 페이지뷰/CTA 클릭 이벤트도 함께 발사.
- 후속 FlareLane 여정(쿠폰 지급 웹훅, D+1·D+3 리마인드) 트래킹용으로 URL 쿼리 `?variant=…&from=…&campaign=…`를 이벤트 props에 그대로 흘려야 함.

## 구현 계획

### Phase 1: 스캐폴딩

- `apps/public/covering-first-free/` 디렉토리 생성, V2와 동일한 빌드 도구 체인 (Next.js 14 App Router, TypeScript strict, Tailwind, autoprefixer) 셋업.
- `next.config.js`에 `basePath: /covering-first-free` 명시 (deploy-app.sh detect 로직 호환).
- Pretendard 폰트 3종 (400/600/700) `public/fonts/`에 복사 + `globals.css`에서 `@font-face` 등록.
- 루트 레이아웃에 `max-w-727` 컬럼 + `md:` 회색 배경 + safe-area 오버레이 (V2 deployed와 동일).

### Phase 2: 랜딩 UI

- Figma 이미지 16종을 `public/assets/figma/`에 정리 (히어로/봉투 안내/쿠폰 카드/쿠폰 사용법/수거 신청 방법/봉투 비교/FAQ/클로징/시트/CTA).
- `FirstFreeLanding.tsx`에 섹션 9개를 `<img>` 단위로 이어붙이고 sticky 하단 CTA 배치.
- 일반/대형 봉투 유의사항: ghost 버튼 → 바닥시트 (드래그 닫기 + ESC 키 + 접근성 aria-label).
- safe-area: 루트 `paddingTop: env(safe-area-inset-top)`, CTA `paddingBottom: env(safe-area-inset-bottom)`로 노치/홈 인디케이터 회피.

### Phase 3: 외부 시스템 연동

- Airbridge 콘솔에 트래킹 링크 1회 등록 (channel=first_free_landing, campaign=first_free_v1, ad_group=first_free_v1, ad_creative=first_free_cta, deeplinkUrl=covering://?campaign=first_free_v1, isReengagement=OFF) → shortUrl `link.covering.app/etbk2c`를 `utils/airbridgeLink.ts`에 하드코딩.
- Mixpanel 이벤트 3종 송출:
  - `[ROUTE] FirstFreeLandingScreen` (페이지 진입)
  - `[CLICK] FirstFreeLandingScreen_primaryCta` (CTA 클릭 + link_mode)
  - `[CLICK] FirstFreeLandingScreen_bagNoticeButton` (유의사항 클릭 + bag_type)
- 공통 props: variant/from/campaign (URL 쿼리에서), environment, url, timestamp.
- CTA 중복 클릭 방지: `isRedirecting` 상태로 두 번 이상 발사 차단.

## 변경 파일

- `apps/public/covering-first-free/` (신규)
  - `app/` (layout, page, globals.css)
  - `components/FirstFreeLanding.tsx`
  - `utils/` (basePath, analytics, airbridgeLink)
  - `public/assets/figma/` (이미지 16종), `public/fonts/` (Pretendard 3종)
  - `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`
  - `deploy.yml`, `ENV_SETUP.txt`, `.gitignore`

## 완료 기준

- 로컬 `npm run dev` 정상 렌더 (히어로 → 클로징 + sticky CTA + 시트 모두 동작).
- Airbridge 원링크 1회 등록 완료 (trackingLinkId=524918479, shortId=etbk2c).
- ENV `NEXT_PUBLIC_MIXPANEL_TOKEN` 설정 시 페이지뷰/CTA 이벤트 발사 확인.
- 배포 후 `https://public-labs.covering.app/covering-first-free` 접근 정상.
- 창 크기별 반응형 동작 확인 (모바일: 풀폭, 768px+: 727 컬럼 + 회색 배경).
- iPhone 노치/홈 인디케이터 영역에서 CTA·콘텐츠 미가림 확인.

## 후속 작업 (이 PR 범위 외)

- 쿠폰 지급 FlareLane 여정 세팅 (앱 첫 방문 treatment 유저 대상 웹훅).
- 푸시/친구톡 FlareLane 여정 (가입 후 30분, D+1, D+3 리마인드).
