# request-large-covering-bag

수거 신청 모달에서 노출되는 대형 커버링 봉투(220L) 신청 안내 웹뷰

## 목적

커버링 앱에서 사용자가 수거 신청을 진행할 때, 대형 커버링 봉투(220L)를 함께
신청해야 하는 경우 모달의 WebView/iframe `src`로 임베드되는 정적 안내 페이지입니다.

화면은 "대형 커버링 봉투(220L)가 필요해요" 문구와 봉투 이미지, 무료 제공·배송 일정
안내 메시지로 구성됩니다.

## 실행 환경

- 실행 방식: PM2 (Next.js 14 standalone) — covering-labs 자동 배포 스크립트가 관리
- 실행 서버: covering-labs-public (외부 공개 VM)
- 접속 URL: `https://public-labs.covering.app/request-large-covering-bag`
- 실행 주기: 상시

## 주요 파일

| 파일 | 역할 |
|---|---|
| `deploy.yml` | 배포 메타 (`type: nextjs`, name 등) |
| `package.json` | Next.js 14 + Tailwind v3 의존성 |
| `tsconfig.json` | TypeScript 설정 (`@/*` 별칭 포함) |
| `tailwind.config.js` / `postcss.config.js` | 스타일 빌드 설정 |
| `app/layout.tsx` | RootLayout, viewport / metadata |
| `app/page.tsx` | 진입 페이지 — `MediumPickUpBagInstImg` 렌더링 |
| `app/globals.css` | Tailwind 베이스 + Pretendard 폰트 로드 |
| `components/MediumPickUpBagInstImg/MediumPickUpBagInstImg.tsx` | 상단 안내 문구 + 안내 카드 컨테이너 |
| `components/MediumPickUpBagInstImg/MediumPickUpBagInst_img.tsx` | 회색 배경 카드 + 메시지 아이템 |
| `components/GoToProductPage1/GoToProductPage1.tsx` | 봉투 이미지 표시 (next/image) |
| `public/figma-assets/318f1d1f5feb0cb4e2aec6bbf8c452c65e835a46.png` | 봉투 이미지 자산 |

## 환경변수

해당 사항 없음. 정적 안내 페이지로 외부 API/DB 의존이 없습니다.

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 (http://localhost:3000)
npm run dev

# 타입 체크
npm run typecheck

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm run start
```

## 의존 서비스

- 외부 폰트: Pretendard Variable (`cdn.jsdelivr.net`)
- 외부 API: 없음

## 주의사항

- **모바일 기준 디자인**: `viewport`는 `width=device-width, initialScale=1`. 저시력 접근성을 위해 핀치 줌은 허용(`userScalable: true`, `maximumScale: 5`). 앱 WebView 임베드 가정.
- **이미지 자산 경로**: `public/figma-assets/`. `next/image`로 렌더링하므로 배포 시 `basePath`(자동 적용)가 prefix됨.
- **원본 출처**: Figma Make export(zip)에서 `App.tsx`가 사용하던 컴포넌트만 옮겨왔습니다. zip 안에 있던 다른 시안(Frame1321315399 시리즈)·shadcn UI 컴포넌트·MUI/Radix/motion 등은 미사용이라 포함하지 않았습니다.
- **`next.config.js` 직접 작성 금지**: `basePath`는 covering-labs 배포 스크립트가 자동 생성합니다 (가이드 참조).
