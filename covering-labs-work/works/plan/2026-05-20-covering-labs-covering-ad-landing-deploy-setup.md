# covering-ad-landing 배포 환경 구성

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 완료

## 목적

`apps/public/covering-ad-landing` (커버링 방문수거 광고 랜딩페이지)를 covering-labs
public VM(`public-labs.covering.app/covering-ad-landing`)으로 배포할 수 있도록 환경을 구성한다.
원래 개인 레포(`bin-lgtm/covering_ad_landing`) + Vercel 로 standalone 운영되던 Next.js 앱을
covering-labs 모노레포로 마이그레이션. (covering-talk 의 Vercel→모노레포 이전과 동일 패턴)

## 진단 → 조치 결과

| 항목 | 진단 | 조치 | 상태 |
|---|---|---|---|
| 중첩 `.git` (`covering_ad_landing/.git`) | 모노레포가 gitlink로 취급 → 배포 불가 + 모든 hook이 repo 루트 오인해 차단 | 중첩 `.git` 제거 (원격 보존 확인 후) | ✅ |
| 폴더명 언더스코어 | 규칙(하이픈) 위반 + URL 노출 | `covering_ad_landing` → `covering-ad-landing` rename | ✅ |
| `deploy.yml` 없음 | 배포 트리거/타입 없음 | `type: nextjs` 로 생성 | ✅ |
| `next.config.ts` basePath 없음 | 배포 스크립트는 config 존재 시 basePath 자동주입 skip → 에셋 404 | `basePath: "/covering-ad-landing"` 추가 | ✅ |
| README = create-next-app 기본값 | 규칙 미준수 | 표준 형식 재작성 | ✅ |
| `package.json` name = `next-scaffold` | 스캐폴드 잔재 | `covering-ad-landing` 으로 정리 | ✅ |
| 이미지 참조 | 전부 `next/image` `<Image>` (일반 img/CSS url 없음) | basePath 자동 prefix → 조치 불필요 | ✅ |
| 리드 폼 API | 외부 절대 URL(`covering-spot-chatbot.vercel.app`) | basePath 영향 없음 | ✅ |

## 핵심 근거

- `scripts/deploy-app.sh:68-75`: `next.config.{js,ts,mjs}` 중 하나라도 있으면 basePath 자동
  생성을 건너뛴다. 이 앱은 `next.config.ts`가 있으므로 **수동으로 basePath를 넣어야** nginx
  `/covering-ad-landing` 라우팅과 Next 에셋 경로가 일치한다. (covering-spot 도 동일하게 수동 설정)
- 폴더명 = APP_NAME = URL 경로 = basePath. → `/covering-ad-landing`.

## 검증

- `npm install` exit 0
- `npm run build` exit 0 — TypeScript 오류 0건, 정적 페이지 5/5 생성, 클린 컴파일

## 잔여 사항 (사용자 PR 단계)

- release-file-guard 로 staging 파일 스크리닝 (`.vercel`/`.DS_Store`/`*-original.png`/`public/ref/`/
  `.claude/settings.local.json`/`.omc/` 가 .gitignore 로 제외되는지 확인)
- 브랜치 `feat/2026-05-20-covering-ad-landing` 생성 → 커밋 → push → PR (사용자 명시 키워드 시)
- `.vercel/` 디렉토리는 .gitignore 처리되어 커밋 대상 아님 (Vercel 이탈로 사실상 dead config)

## 사후 수정 — 이미지 전체 깨짐 (2026-05-20, 원인 PR #320)

배포 후 모든 이미지가 깨짐. 진단 결과 next/image가 basePath를 src에 **자동으로 붙이지 않아**,
옵티마이저가 basePath 없는 원본(`/images/..`)을 요청 → nginx 기본응답(non-image) → 옵티마이저 400.

- 라이브 진단: `/_next/image?url=%2Fimages%2Fhero7.png` → 400 / `url=%2Fcovering-ad-landing%2Fimages%2F..` → 200 image/png
- public 에셋은 basePath 포함 경로(`/covering-ad-landing/images/..`)에서만 200
- **해법**: 같은 배포에서 정상 동작하는 covering-spot 패턴(=src에 basePath 직접 부여)을 따름.
  page.tsx에 `BASE_PATH`/`asset()` 헬퍼 추가, 10개 이미지 경로에 적용. README 주의사항 정정.
- 교훈: reverse-proxy(nginx) + basePath 환경에서 next/image는 src에 basePath를 수동으로 붙여야 한다.
