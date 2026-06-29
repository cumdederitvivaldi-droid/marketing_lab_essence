# covering-ad-landing

커버링 방문수거 광고 랜딩페이지 — 대형·대량 폐기물 방문수거 인바운드 리드 수집.

## 목적

광고(메타·검색 등)로 유입된 사용자에게 커버링 방문수거 서비스를 소개하고, 페이지 내 신청
폼으로 인바운드 리드(이름·연락처·지역 등)를 수집한다. 제출된 리드는 외부 상담 챗봇 API로
전달되어 후속 상담으로 이어진다.

## 실행 환경

- 실행 방식: PM2 (`next start`) — covering-labs `deploy-app.sh`가 자동 기동
- 실행 서버: public VM (`covering-labs-public`) — VPN 불필요, 외부 공개
- 배포 트리거: `apps/public/covering-ad-landing/**` 변경 → GitHub Actions `Deploy Apps`
- 접속 주소: https://public-labs.covering.app/covering-ad-landing

## 주요 파일

| 파일 | 역할 |
|---|---|
| `deploy.yml` | 배포 메타데이터 (`type: nextjs`) — covering-labs 배포 트리거 |
| `next.config.ts` | `basePath: "/covering-ad-landing"` — nginx 라우팅과 에셋 경로 정합 |
| `app/page.tsx` | 랜딩 단일 페이지 (히어로·신뢰지표·비교·단계·신청 폼·FinalCta·sticky CTA) |
| `app/layout.tsx` | 메타데이터, Pretendard 폰트, viewport |
| `app/globals.css` | Tailwind v4 + 디자인 토큰 |
| `components/ui/` | shadcn 기반 UI 컴포넌트 (button, input, select, accordion 등) |
| `lib/utils.ts` | `cn()` 클래스 머지 유틸 |
| `public/images/` | 랜딩 이미지 (히어로·비교·단계·신뢰·로고) |
| `public/fonts/` | Pretendard Variable woff2 |

## 환경변수

이 앱은 빌드·런타임에 별도 환경변수가 **필요하지 않다**. 신청 폼은 코드에 하드코딩된 외부
공개 엔드포인트로 직접 POST한다 (아래 의존 서비스 참조).

## 실행 방법

```bash
# 로컬 개발
npm install
npm run dev          # http://localhost:3000/covering-ad-landing

# 빌드 / 프로덕션 기동 (VM과 동일)
npm run build
npm run start
```

> `basePath`가 설정되어 있어 로컬에서도 경로는 `/covering-ad-landing` 하위에서 접속한다.

## 의존 서비스

- **인바운드 리드 API**: `https://covering-spot-chatbot.vercel.app/api/public/inbound-lead`
  (`app/page.tsx`의 `LEAD_API`) — 신청 폼 제출 시 리드 데이터를 POST. 외부 절대 URL이라
  basePath 영향 없음.
- **카카오톡 상담 채널 / 전화**: FinalCta·sticky CTA의 상담 진입 링크.

## 주의사항

- **basePath 고정**: 폴더명 = URL 경로 = `basePath`. 셋 중 하나만 바뀌어도 에셋이 404로
  깨진다. 폴더명을 바꾸면 `next.config.ts`의 `basePath`와 `deploy.yml`의 `name`도 함께 바꿔야 한다.
- **이미지 src에 basePath 직접 부여 필수**: next/image는 basePath를 src에 자동으로 붙이지 않는다.
  reverse-proxy(nginx) 뒤에서 이미지 옵티마이저가 basePath 없는 원본 경로를 못 찾아 404→이미지가
  통째로 깨진다. public 에셋은 반드시 `asset("/images/..")` 헬퍼(= `/covering-ad-landing` prefix)로
  참조할 것. 일반 `<img>`·CSS `url()`도 동일하게 prefix 필요. (covering-spot도 동일 패턴)
- **public VM = 외부 공개**: 내부 AWS 리소스·Admin API 접근 불가. 민감 데이터·내부 연동 금지.
- Vercel에서 covering-labs 모노레포로 마이그레이션됨. 기존 standalone 레포(`bin-lgtm/covering_ad_landing`)·
  Vercel 프로젝트는 더 이상 배포 소스가 아니다.
