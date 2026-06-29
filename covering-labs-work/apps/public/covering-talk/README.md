# covering-talk

커버링 통합 상담 플랫폼 (구 covering-spot-chatbot) — **방문수거 · 런치 · 채널톡** 3개 독립 시스템을
단일 관리자 대시보드로 운영하는 Next.js 애플리케이션. covering-labs `apps/public/covering-talk/` 에 배치.

> **Golden Rule** — 방문수거 ≠ 런치 ≠ 채널톡. Store / API / 프롬프트는 절대 혼용 금지.
> 작업 시작 전에 반드시 [docs/architecture/overview.md](docs/architecture/overview.md) 와 [CLAUDE.md](CLAUDE.md) 를 읽을 것.

## 주요 기능

- **방문수거** — 건물 폐기물 수거 상담 · 견적 · 예약 · 배차 · 결제
- **런치** — 도시락 폐기물 수거 상담 · 자동결제 · 세금계산서
- **채널톡** — 일반 고객지원 AI 답변 추천 파이프라인
- **관리자** — 대시보드 · 상담 · 배차 · 거래처 · 감사 로그

## 기술 스택

| 레이어 | 선택 |
| --- | --- |
| 프레임워크 | Next.js 16 (App Router) · React 19 · TypeScript 5 |
| UI | Tailwind 4 · Shadcn UI · Radix Primitives · Sonner · Recharts |
| 데이터 | Supabase (자체 인스턴스 1개) · Google Sheets (런치/방문 미러) · pgvector (RAG 임베딩) |
| AI | Anthropic Claude · OpenAI · Voyage (임베딩) |
| 외부 연동 | 해피톡 · 채널톡 · NicePay · Bolta · Dhero |
| 인증 | JWT (`jose`) · HTTP-only 쿠키 |
| 배포 | covering-labs GitHub Actions → `covering-labs-public` VM (PM2 + nginx, basePath `/covering-talk`) |

## 디렉토리 구조

```
app/                 Next.js App Router
  api/               API 라우트 149개 (태그 규칙은 docs/api/tags.md)
    webhook/         해피톡 웹훅 (sender_key 로 방문수거/런치 분기)
    cron/            /api/cron/* — 외부 cron runner 가 CRON_SECRET 헤더로 호출 (시트 싱크 · 자동결제 · 알림)
    channeltalk/     채널톡 Open API 프록시
    channeltalk-ai/  채널톡 AI 추천 파이프라인
  conversations/     방문수거 UI
  lunch/             런치 UI
  channeltalk/       채널톡 UI
  bookings/ dispatch/ items/ settings/ templates/   (bookings 는 URL 만 잔존, /api/orders 호출)

components/          시스템별 UI 컴포넌트 + 공용 Shadcn UI
lib/                 비즈니스 로직 (Supabase 접근 / 외부 API / AI / 인증)
  ai/                방문수거 + 런치 AI 프롬프트 · 상태머신
  channeltalk-ai/    채널톡 분류 → RAG → 답변 → 톤 파이프라인
  store/             시스템별 완전 분리된 Supabase 접근 계층
migrations/          SQL 마이그레이션 (번호순)
docs/                아키텍처 · API · DB · UI 레퍼런스
scripts/             운영용 스크립트 (backoffice · 임포트 · 임베딩 등)
```

## 환경변수

`.env.local.example` 참조 — 47개 키. 시스템별 접두사 규칙:

- `HT_*` · `SENDER_KEY` — 해피톡 **방문수거**
- `LUNCH_HT_*` · `LUNCH_SENDER_KEY` — 해피톡 **런치**
- `CHANNELTALK_*` — **채널톡**
- `SUPABASE_*` · `NEXT_PUBLIC_SUPABASE_*` — 내부 Supabase
- `COVERING_SUPABASE_*` — 외부 커버링 DB. 진본은 내부 `orders`. 방문수거 상담사 답변 시 `sendToCovering()` 단방향 동기화 (활성). 비우면 send 시 throw
- 이 외 공유: `ANTHROPIC_API_KEY`, `NICEPAY_*`, `GOOGLE_*`, `BOLTA_*`, `DHERO_*`

## 배포

covering-labs 의 GitHub Actions 가 main 머지 시 자동 배포. 배포 VM 은 `covering-labs-public` (외부 IP `34.64.144.174`, HTTPS 공개), 접속 주소 `https://public-labs.covering.app/covering-talk`. PM2 로 프로세스 관리, nginx 가 basePath `/covering-talk` 로 라우팅. `deploy.yml` 의 `name: covering-talk` 가 식별자.

환경변수는 VM `/shared/.env` 또는 `/shared/apps/covering-talk/.env` 에 주입 (레포에 커밋 금지). 키 카탈로그는 [`.env.local.example`](.env.local.example) 과 [`docs/ops/environment.md`](docs/ops/environment.md) 참조.

> **Vercel → covering-labs 이관 후속 작업 (TODO)**
> - `/api/cron/*` 11종을 호출할 외부 cron runner 가 아직 없다. `apps/private/covering-talk-cron/` batch 앱 또는 GitHub Actions schedule 로 추가 필요. 미설정 동안엔 자동결제·자동마감·익일 브리핑 등 운영 자동화 정지.
> - `middleware.ts` 는 `CRON_SECRET` 헤더 검증을 포함하지 않으므로 외부 노출되는 `/api/cron/*` 경로를 각 라우트 또는 미들웨어에서 보호해야 한다.
> - 외부 콘솔 webhook/콜백 URL 갱신 필요 (해피톡 webhook, NicePay return URL, 채널톡 Native Function URL 등). 운영자 체크리스트 ↓.

### 운영자 체크리스트 (배포 후 직접 갱신)

| 외부 서비스 | 갱신 항목 | 새 URL 형식 |
|---|---|---|
| 해피톡 (방문수거 채널) | webhook URL | `https://public-labs.covering.app/covering-talk/api/webhook/message` |
| 해피톡 (런치 채널) | webhook URL | `https://public-labs.covering.app/covering-talk/api/webhook/lunch/message` |
| NicePay | return / cancel URL | `https://public-labs.covering.app/covering-talk/api/payment/...` (라우트별 확인) |
| 채널톡 Native Function | callback URL | `https://public-labs.covering.app/covering-talk/api/channeltalk/...` |
| Google OAuth (로그인) | redirect URI | `https://public-labs.covering.app/covering-talk/api/auth/google/callback` |
| 외부 cron runner | 전체 `/api/cron/*` 호출 대상 호스트 | `https://public-labs.covering.app/covering-talk` (header: `x-cron-secret: $CRON_SECRET`) |

## 문서 구조 (전체)

문서는 도메인·역할별로 디렉토리 분리. **인덱스: [`docs/README.md`](docs/README.md)**.

```
README.md                              ← 본 파일 (5초 요약)
CLAUDE.md                              ← Claude Code 작업 시 시스템 경계·컨벤션 (필독)
docs/
├─ README.md                           ← 문서 인덱스 (어느 문서를 언제 보는가)
│
├─ architecture/                       시스템 아키텍처
│  ├─ overview.md                      3 시스템 + DB · 환경변수 · AI · 외부 매트릭스
│  ├─ domains.md                       모든 파일·라우트의 5 도메인 매핑
│  └─ cron.md                          Cron 11개 상세 (path · 시간 · 비즈니스)
│
├─ api/                                API
│  └─ tags.md                          전체 195 태그 카탈로그 (CS-카테고리-번호)
│
├─ api-specs/                          외부 API 공식 스펙
│  ├─ README.md
│  ├─ channeltalk-openapi.json         채널톡 Open API
│  └─ dhero-delivery-api-2024-07-31.pdf  두발히어로 배송
│
├─ db/                                 DB 스키마 (도메인별 분할)
│  ├─ README.md                        DB 인덱스 + 매트릭스
│  ├─ visit.md                         방문수거 11 + 외부 1 테이블
│  ├─ lunch.md                         런치 5 테이블
│  ├─ channeltalk.md                   채널톡 4 테이블
│  ├─ dashboard.md                     대시보드 7 테이블
│  ├─ shared.md                        공유 7 테이블
│  ├─ migrations.md                    41 SQL 파일 ledger
│  └─ ERD.md                           Mermaid ER 다이어그램 (4 도메인)
│
├─ domains/                            도메인별 풀가이드 (각 9 파트)
│  ├─ visit/        (README + 01-08)  방문수거 — 비즈니스 · UI · AI · API · DB · 외부 · 운영 · 함정
│  ├─ lunch/        (README + 01-08)  런치
│  ├─ channeltalk/  (README + 01-08)  채널톡
│  └─ dashboard/    (README + 01-08)  대시보드
│
├─ ai-deep/                            AI 깊이 분석 (3 도메인 × 4 파트 + README)
│  ├─ README.md                        인덱스
│  ├─ visit/                           9단계 Phase 머신 / 11섹션 prompt / 정보 추출
│  ├─ lunch/                           4단계 머신 / <order_data> 파싱 / 톤 자가검수
│  └─ channeltalk/                     4단계 RAG 파이프라인 / 19 카테고리
│
├─ ops/                                운영
│  ├─ deployment.md                    covering-labs GitHub Actions · 롤백 · DB 마이그레이션 (※ 본문은 Vercel 가정으로 작성됨 — 갱신 TODO)
│  ├─ environment.md                   47개 env var 그룹별 + 노출 시 대응
│  ├─ external-services.md             14개 외부 서비스 콘솔·로테이션 주기
│  └─ incidents.md                     15 인시던트 P0~P3 + 대응 절차

tools/
└─ channeltalk-ai/                     채널톡 AI 학습/시드 파이프라인 + 정책 데이터
   └─ README.md                         사용법 + 운영 코드와의 관계

scripts/                               운영 스크립트 (seed · backup · 백오피스 스크래퍼)
migrations/                            SQL 마이그레이션 (번호순)
```

### 어느 문서부터 보는가

| 상황 | 문서 |
|---|---|
| 처음 합류 | [`CLAUDE.md`](CLAUDE.md) → [`docs/README.md`](docs/README.md) → [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| 어느 도메인인지 | [`docs/architecture/domains.md`](docs/architecture/domains.md) |
| API 추가/수정 | [`docs/api/tags.md`](docs/api/tags.md) |
| DB 변경 | 해당 도메인의 [`docs/db/<domain>.md`](docs/db/) |
| 도메인 풀가이드 | [`docs/domains/<domain>/README.md`](docs/domains/) → 01-08 순 |
| Cron 변경 | [`docs/architecture/cron.md`](docs/architecture/cron.md) |
| 외부 콘솔 자격증명 | [`docs/domains/<domain>/06-integrations.md`](docs/domains/) |
| 장애 대응 | [`docs/domains/<domain>/08-gotchas.md`](docs/domains/) |

## 코드 컨벤션

- 컴포넌트 `PascalCase.tsx` · 함수/변수 `camelCase` · 타입 `PascalCase` (I 접두사 없음)
- 임포트는 `@/*` 별칭 사용
- API 라우트: `/app/api/[resource]/route.ts` + HTTP 메서드 export + `// [CS-카테고리-번호]` 주석
- 에러 응답: `NextResponse.json({ error: "메시지" }, { status: 코드 })`

