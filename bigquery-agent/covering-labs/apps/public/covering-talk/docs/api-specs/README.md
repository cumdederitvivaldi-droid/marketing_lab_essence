# 외부 API 스펙

> 외부 서비스 API 의 공식 스펙 / 문서. 우리가 호출하는 서비스의 입출력·인증 참조용.
> 코드 직접 보기 어렵거나 변경 시 영향 평가에 사용.

## 파일 목록

| 파일 | 서비스 | 도메인 | 비고 |
|---|---|---|---|
| [`channeltalk-openapi.json`](channeltalk-openapi.json) | 채널톡 Open API | 채널톡 | 561 KB · OpenAPI 스펙 |
| [`dhero-delivery-api-2024-07-31.pdf`](dhero-delivery-api-2024-07-31.pdf) | 두발히어로 배송 | 방문수거 | 151 KB · 2024-07-31 발급 PDF |

## 매핑

### 채널톡 — `channeltalk-openapi.json`
- 우리 코드: `lib/channeltalk/client.ts`, `lib/channeltalk/desk-api.ts`, `lib/channeltalk/types.ts`
- 우리 라우트: `app/api/channeltalk/*`
- 도메인 가이드: [`../domains/channeltalk/README.md`](../domains/channeltalk/README.md)
- 외부 콘솔: https://desk.channel.io
- Base URL: `https://api.channel.io`

본 JSON 은 채널톡이 제공하는 Open API 의 OpenAPI 스펙. 모든 endpoint·요청 payload·응답 구조 명세. 채널톡 측 업데이트 시 갱신 필요 (수동 — `cp` 다시).

### 두발히어로 — `dhero-delivery-api-2024-07-31.pdf`
- 우리 코드: `lib/dhero/client.ts`
- 우리 라우트: `app/api/dhero/deliveries/*`
- 캐시: `dhero_deliveries` 테이블
- 도메인 가이드: [`../domains/visit/README.md`](../domains/visit/README.md)
- 외부 콘솔: 두발히어로 (운영팀 보유)

PDF 형식 — 2024-07-31 발급분. 새 버전 받으면 같이 두거나 (`*-2025-X.pdf`) replace.

## 미포함 / 외부 위치

- **Bolta 세금계산서 API** — `/Users/wonbinkim/Desktop/chatingbot/볼타 API.json` (사용자 보유, 프로젝트 외부). 도메인: 런치. 운영팀이 수동 참조.

## 동기화 규칙

- 외부 서비스가 API 스펙 업데이트 시 본 폴더 파일 갱신
- 파일명 컨벤션: `<service-name>-<spec-type>-<YYYY-MM-DD>.<ext>` (날짜 옵션)
- 큰 파일 (>5MB) 는 git LFS 검토
