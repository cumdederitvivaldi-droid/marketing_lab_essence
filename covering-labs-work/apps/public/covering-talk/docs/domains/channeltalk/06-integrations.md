# 06 — 외부 연동

| 서비스 | 모듈 | 인증 | 푸시·풀 | 비고 |
|---|---|---|---|---|
| 채널톡 Open API | `lib/channeltalk/client.ts` + `app-client.ts` | `CHANNELTALK_ACCESS_KEY` + `CHANNELTALK_ACCESS_SECRET` + `CHANNELTALK_APP_ID` | API call (폴링) | 메시지·세션 진본 |
| 채널톡 Desk API | `lib/channeltalk/desk-api.ts` | `CHANNELTALK_DESK_COOKIE` | API call | 메시지 삭제만 (Open API 에 없음) — **30일 로테이션** |
| 백오피스 (Puppeteer) | `app/api/backoffice/*` + 별도 머신 | (스크래퍼가 admin.covering.app 로그인) | Supabase Realtime polling | 별도 머신 가용성에 의존 |
| Voyage AI | `lib/ai/voyage.ts` | `VOYAGE_AI_API_KEY` | API call | 임베딩 (모델: voyage-2) |
| Anthropic | `lib/ai/claude.ts` (공유) | `ANTHROPIC_API_KEY` | API call | Sonnet (분류·생성) + Haiku (톤) |

---

## 채널톡 Open API

### 인증 / 호출
- Base URL: `https://api.channel.io`
- 인증: `x-access-key` + `x-access-secret` 헤더
- 채널 ID: `64368` (모든 버림은, 커버링 — 단일 채널)
- CDN: `https://cf.channel.io/{key}`
- **공식 스펙**: [`../../api-specs/channeltalk-openapi.json`](../../api-specs/channeltalk-openapi.json) (OpenAPI)

### 주요 엔드포인트 (자세히는 04-api.md)

| 용도 | 메서드 | 경로 |
|---|---|---|
| 유저챗 목록 | GET | `/open/v5/user-chats` |
| 유저챗 상세 | GET | `/open/v5/user-chats/{id}` |
| 메시지 조회/전송 | GET/POST | `/open/v5/user-chats/{id}/messages` |
| 챗 종료/오픈 | PATCH/PUT | `/open/v4/user-chats/{id}/{close,open}` |
| 담당자 배정 | PATCH | `/open/v4/user-chats/{id}/assign-to/managers/{managerId}` |
| 매니저 목록 | GET | `/open/v4/managers` |

### message.options 매핑
| 값 | 의미 |
|---|---|
| `private` + `silentToUser` | 내부대화 (상담사 메모) |
| `+ silentToManager + immutable` | 시스템 로그 (필터링 대상) |
| `actAsManager` | 매니저로 표시 |
| `silentToUser` + `doNotPost` | 워크플로우/봇 |

### botName
- API 키는 채널 단위 — 모든 발송이 같은 매니저로 표시되는 문제 → `botName` 쿼리로 override
- 우리 코드: 로그인 상담사의 `name` 을 botName 으로 (고객에게 상담사 이름 그대로)

### Rate limit
채널톡 공식 가이드 참조. 초당 너무 많은 호출 시 429. 우리는 클라이언트 폴링 10초 → 부하 낮음.

### Webhook (사용 안 함)
채널톡은 webhook 도 제공하지만 현재 폴링만. 추후 native function 연동 시 webhook 도 가능.

---

## 채널톡 Desk API (메시지 삭제만)

Open API 에 메시지 삭제가 없어서 Desk API (콘솔용 내부 API) 사용.

### 인증 — 쿠키 기반
- env: `CHANNELTALK_DESK_COOKIE`
- **30일마다 만료**. 만료 시:
  1. 채널톡 데스크 (desk.channel.io) 에 운영자 계정으로 로그인
  2. DevTools → Application → Cookies → 모든 값 복사
  3. Vercel env `CHANNELTALK_DESK_COOKIE` 갱신
  4. 재배포

### 호출처
- `/api/channeltalk/chats/[chatId]/delete-message`

### 위험성
- 비공식 API → 채널톡 콘솔 업데이트 시 깨질 수 있음
- 회복 방법: 코드의 endpoint URL 갱신 (Desk API 경로 변경 시)

---

## 백오피스 스크래퍼 (Puppeteer)

### 위치
- 별도 머신 (운영팀 노트북 또는 별도 서버)
- 코드: `scripts/backoffice-scraper/` (별도 package.json + node_modules)

### 동작
1. 본 시스템에서 `/api/backoffice/lookup` POST → `backoffice_requests` INSERT
2. 스크래퍼가 Supabase Realtime 으로 pending 구독
3. pending row 발견 → admin.covering.app 로그인 → 데이터 추출
4. `backoffice_requests` UPDATE (status=completed, result=JSON)
5. 본 시스템 polling 이 감지 → `backoffice_cache` UPSERT → 클라이언트 반환

### 가용성
- 스크래퍼 머신 다운 → 모든 lookup 실패 (504)
- 자주 발생 — 회로 차단기 (circuit breaker) 클라이언트 측 적용
  - 3회 연속 실패 → 5분 skip
  - 그동안 AI 추천은 백오피스 데이터 없이 진행 (정확도 일부 저하)

### 복구 절차
- 운영팀이 스크래퍼 재시작 (수동)
- 모니터링: `backoffice_requests.status` (08 SQL 참조)

### 자격증명
- admin.covering.app 운영자 계정 (스크래퍼가 보유)
- 노출 시 즉시 비밀번호 변경

---

## Voyage AI (RAG 임베딩)

### 인증
- env: `VOYAGE_AI_API_KEY`
- 모델: `voyage-2` (한국어 강세)

### 호출처
- `lib/ai/voyage.ts:embed(...)`
- 사용:
  - 운영 중 (suggest 호출 시): 고객 메시지 임베딩 → 정책·매크로 검색
  - 배치 (시드): `tools/channeltalk-ai/embed-*.ts`

### 비용
- 임베딩 1건 ~ 매우 저렴 ($0.0001 미만 / 1K 토큰)
- 그러나 호출 수가 많음 → 모니터링 필요 (Voyage 콘솔)

---

## Anthropic (Sonnet + Haiku)

공유 클라이언트 (`lib/ai/claude.ts`). 채널톡 AI 가 호출:
- Sonnet: 분류 + 답변 생성
- Haiku: 톤 다듬기 (선택)

런타임 provider 전환: `app_settings.ai_provider` (anthropic / openai).

env: `ANTHROPIC_API_KEY` (방문·런치도 공유).

---

## 인증 토큰 로테이션

| 서비스 | 권장 주기 | 메커니즘 |
|---|---|---|
| 채널톡 Access Key/Secret | 변경 없음 (노출 시만) | 채널톡 콘솔 |
| 채널톡 App ID | 변경 없음 | 채널톡 콘솔 |
| **Desk Cookie** | **30일 (필수)** | desk.channel.io 재로그인 |
| Voyage AI | 변경 없음 (노출 시만) | Voyage 콘솔 |
| Anthropic | 변경 없음 | Anthropic 콘솔 |
| 백오피스 스크래퍼 자격 | 6개월 또는 노출 시 | admin.covering.app 비밀번호 변경 |
