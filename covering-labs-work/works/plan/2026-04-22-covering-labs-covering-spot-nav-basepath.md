# covering-spot Nav 로고 + manifest basePath 누락 후속 수정

> 유형: 플랜
> 작성일: 2026-04-22
> 상태: 완료


## 배경

PR #105 로 basePath `/covering-spot` 이 main 에 반영되어 프로덕션 배포됐지만, 아래 3개 증상이 라이브에서 남아있음을 브라우저 콘솔로 확인:

```
GET /covering-spot/_next/image?url=%2Fimages%2Flogo.png&w=32&q=75  400 (Bad Request)
manifest.json:1  Manifest: Line: 1, column: 1, Syntax error
Nav "커버링 방문수거" 클릭 → https://public-labs.covering.app/ 로 튕김
```

## 원인

PR #105 수정 범위에서 두 가지 잘못된 가정을 했음:

1. **`next/image` 의 `src` prop 에 basePath 가 자동 prefix 된다고 가정** — 실제로 Next.js 는 자동 처리하지 않음 (공식 문서: "In order to properly link an image when using next/image, you will need to prefix src with basePath"). 따라서 Nav.tsx, Splash.tsx 의 `<Image src="/images/logo.png">` 는 `_next/image?url=%2Fimages%2Flogo.png` 로 렌더되고, image optimizer 가 origin 루트(`/images/logo.png`)에서 원본을 못 찾아 400.

2. **`metadata.manifest` 와 OG/Twitter `images.url` 이 metadataBase 로 basePath 까지 resolve 된다고 가정** — 실제로 Next.js 는 metadataBase 의 origin 만 사용, path 는 무시. `manifest: "/manifest.json"` 은 `https://public-labs.covering.app/manifest.json` 으로 렌더되어 nginx 가 다른 앱 HTML 을 반환 → `Manifest: Line 1 Syntax error`.

3. **Nav.tsx:39 `<a href="/">`** — next/link 가 아닌 raw `<a>` 라 basePath 자동 적용 안 됨 → 클릭 시 origin 루트로 네비게이션.

## 변경

- `src/components/layout/Nav.tsx`
  - `BASE_PATH` import 추가
  - `<a href="/">` → `href={\`${BASE_PATH}/\`}`
  - `<Image src="/images/logo.png">` → `src={\`${BASE_PATH}/images/logo.png\`}`
- `src/components/Splash.tsx`
  - `BASE_PATH` import 추가
  - `<Image src="/images/logo.png">` → `src={\`${BASE_PATH}/images/logo.png\`}`
- `src/app/layout.tsx`
  - `openGraph.images[0].url`: `"/api/og"` → `` `${SITE_URL}/api/og` ``
  - `twitter.images`: `["/api/og"]` → `` [`${SITE_URL}/api/og`] ``
  - `manifest`: `"/manifest.json"` → `` `${SITE_URL}/manifest.json` ``
  (SITE_URL 은 이미 `https://public-labs.covering.app/covering-spot` 이므로 절대 URL 로 명시 → metadataBase 의존 제거)

## 검증

1. `npx tsc --noEmit` 오류 0건
2. `rm -rf .next && npm run build` exit 0
3. 배포 후 확인 포인트
   - 브라우저에서 `_next/image?url=%2Fcovering-spot%2Fimages%2Flogo.png` 형태 (url 파라미터에 basePath 포함) 로 렌더되는지 → 200
   - `<link rel="manifest" href="https://public-labs.covering.app/covering-spot/manifest.json">` 으로 절대 URL 이 찍히는지
   - "커버링 방문수거" 클릭 시 `/covering-spot` 유지되는지

## 보류 (이번 scope 밖)

- **Mixpanel `Cannot read properties of undefined (reading 'hb')`** — basePath 와 무관한 라이브러리 내부 오류. 재현 조건 조사 후 별도 PR 로 처리 권고.
- **`src/components/ui/AdminLogo.tsx`** — 여전히 데드코드, 별도 PR 에서 삭제 권고.
- **`public/sw.js`** — 등록 코드 없어 현재 미로드.
