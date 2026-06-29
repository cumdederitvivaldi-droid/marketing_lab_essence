# 문서 인덱스

이 폴더는 covering-talk 의 모든 문서가 모인 곳이다.
어느 문서를 언제 읽어야 하는지 한눈에 보려면 아래 표를 참고.

## 작업 시작 전 필독

| 문서 | 언제 읽는가 |
|---|---|
| [`architecture/overview.md`](architecture/overview.md) | 모든 작업 시작 전 — 시스템 경계 (방문/런치/채널톡) 확인 |
| [`architecture/domains.md`](architecture/domains.md) | 어떤 파일이 어느 도메인에 속하는지 매핑 — 새 코드 작성·이동 전 |

## 카테고리별

### `architecture/` — 아키텍처
- [`overview.md`](architecture/overview.md) — 3 시스템 + 데이터·환경변수·AI 비교 + Cron + 외부 서비스 매트릭스
- [`domains.md`](architecture/domains.md) — 모든 파일·라우트의 도메인 분류 (단일 진실)
- [`cron.md`](architecture/cron.md) — Cron 11개 상세 (Vercel → covering-labs 이관 후 외부 cron runner 가 호출)

### `api/` — API
- [`tags.md`](api/tags.md) — 모든 API route 의 `CS-카테고리-번호` 태그 카탈로그
- `conventions.md` — API route 작성 규칙·태그 부여법 (예정)

### `api-specs/` — 외부 API 스펙
- [`README.md`](api-specs/README.md) — 인덱스
- [`channeltalk-openapi.json`](api-specs/channeltalk-openapi.json) — 채널톡 Open API OpenAPI 스펙
- [`dhero-delivery-api-2024-07-31.pdf`](api-specs/dhero-delivery-api-2024-07-31.pdf) — 두발히어로 배송 API 안내

### `db/` — 데이터베이스 (도메인별 분할)
- [`README.md`](db/README.md) — 인덱스 + 도메인 매트릭스
- [`visit.md`](db/visit.md) — 방문수거 11 + 외부 1 테이블
- [`lunch.md`](db/lunch.md) — 런치 5 테이블
- [`channeltalk.md`](db/channeltalk.md) — 채널톡 4 테이블
- [`dashboard.md`](db/dashboard.md) — 대시보드 7 테이블
- [`shared.md`](db/shared.md) — 공유 7 테이블
- [`migrations.md`](db/migrations.md) — 41개 SQL 파일 ledger
- [`ERD.md`](db/ERD.md) — Mermaid ER 다이어그램 4개
- [`_legacy.md`](db/_legacy.md) — 구 단일 문서 (폐기 예정, 매핑 안내만)
- [`final_schema.sql`](db/final_schema.sql) — 초기 스냅샷

### `domains/` — 도메인별 풀 가이드 (각 README + 01-08 = 9 파일)
- [`visit/README.md`](domains/visit/README.md) — 방문수거 (UI/AI/API/DB/외부/운영/함정)
- [`lunch/README.md`](domains/lunch/README.md) — 런치
- [`channeltalk/README.md`](domains/channeltalk/README.md) — 채널톡
- [`dashboard/README.md`](domains/dashboard/README.md) — 대시보드

### `ai-deep/` — AI 깊이 분석 (3 도메인 × 4 파트 = 12 파일 + README)
- [`README.md`](ai-deep/README.md) — 인덱스
- [`visit/`](ai-deep/visit) — 9단계 Phase 머신 + 11 섹션 prompt + 정보 추출
- [`lunch/`](ai-deep/lunch) — 4단계 경량 머신 + `<order_data>` 자동파싱 + 톤 자가검수
- [`channeltalk/`](ai-deep/channeltalk) — 4단계 RAG 파이프라인 + 19 카테고리

### `ops/` — 운영
- [`deployment.md`](ops/deployment.md) — 배포 · 롤백 · DB 마이그레이션 (※ 본문은 Vercel 가정으로 작성됨 — 후속 PR 에서 covering-labs 기준으로 갱신 예정)
- [`environment.md`](ops/environment.md) — 47개 env var 그룹별 + 노출 시 대응
- [`external-services.md`](ops/external-services.md) — 14개 외부 서비스 콘솔·자격증명·로테이션 주기
- [`incidents.md`](ops/incidents.md) — 15 인시던트 P0~P3 등급 + 대응 절차

## 변경 시 동기화

- API route 추가/삭제 → [`api/tags.md`](api/tags.md) 갱신 + route 파일에 `// [CS-카테고리-번호] 설명` 주석
- DB 스키마 변경 → 해당 도메인 `db/{visit,lunch,...}.md` + `db/migrations.md` ledger + `migrations/XXX.sql`
- 환경변수 추가 → `architecture/overview.md` §4 + (예정) `ops/environment.md`
- 시스템 경계 변화 → `architecture/overview.md` §7 매트릭스
- Cron 추가/수정 → `architecture/cron.md` (※ `vercel.json` 은 제거됨 — Vercel 이관 후 cron runner 가 별도 PR 에서 정의)
