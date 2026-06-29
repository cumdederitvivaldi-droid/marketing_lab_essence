# covering-ad-landing Meta Pixel 추적 설치

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 검토중

## 목적

광고 랜딩(covering-ad-landing)에 Meta Pixel 전환 추적을 설치한다. covering-spot과 동일 픽셀
ID(`887855856225518`, 공개 ID)를 사용한다. 버튼 이벤트만으로는 동작하지 않으므로 `<head>`에
픽셀 base 코드(init + PageView)를 SSR로 직접 박는다.

## 현황

- covering-ad-landing: 추적 코드 0건 (Meta Pixel/Mixpanel/Naver 전무)
- covering-spot 패턴: `<head>`에 fbq base(stub+fbevents.js+init+PageView) 직접 임베드 + CTA/폼에서 표준 이벤트

## 구현 범위 (Meta Pixel only — 사용자 요청)

| 항목 | 위치 | 비고 |
|---|---|---|
| 픽셀 base + PageView | `app/layout.tsx` `<head>` (서버 컴포넌트, SSR) | stub+fbevents.js+init+PageView 통째 임베드 |
| `<noscript>` 폴백 비콘 | `app/layout.tsx` `<head>` | 표준 Meta Pixel 설치 |
| **Lead** 이벤트 | `app/page.tsx` 리드폼 제출 성공 시(`setSuccessOpen(true)` 직후) | 핵심 전환 |
| **Contact** 이벤트 | 카톡/전화 CTA 8곳 onClick | 보조 전환, covering-spot과 동일 표준 이벤트 |

> Mixpanel·Naver CTS·SEO/JSON-LD는 이번 범위 제외(요청은 Meta 추적). 필요 시 후속.

## 구현 메모

- 픽셀 ID 하드코딩(공개 ID) — covering-spot 동일 방식, 환경변수 불필요
- `window.fbq` 전역 타입 선언 + `trackContact(location)` 헬퍼
- page.tsx는 이미 `"use client"` → 핸들러에서 fbq 직접 호출 가능

## 검증

- `npm run build` 통과(타입 오류 0)
- 빌드 HTML `<head>`에 fbq init/PageView 포함, `connect.facebook.net/en_US/fbevents.js` 로드 확인
- 배포 후 Meta Pixel Helper로 PageView/Lead/Contact 발사 확인(사용자)
