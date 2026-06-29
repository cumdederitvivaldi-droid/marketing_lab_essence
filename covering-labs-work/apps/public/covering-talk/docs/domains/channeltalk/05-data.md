# 05 — 데이터 (부가 테이블 + RAG + 매니저)

> 진본 메시지·세션은 **채널톡 플랫폼 소유**. 우리 DB 는 부가 데이터만.
> 컬럼 상세: [`../../db/channeltalk.md`](../../db/channeltalk.md).

## 부가 테이블 (4개)

| 테이블 | 용도 | 라이프 |
|---|---|---|
| `backoffice_requests` | Vercel ↔ Puppeteer 스크래퍼 통신 큐 | 처리 후 즉시 삭제 (5분+ 잔존 → 정리) |
| `backoffice_cache` | 24시간 조회 캐시 | TTL 24h |
| `channeltalk_reply_logs` | AI 분류 (`ai_auto/ai_assist/human`) 만 기록 | 무기한 (KPI용) |
| `category_prompts` | 카테고리별 답변 규칙 + 정책 섹션 | 무기한 (운영팀 갱신) |

## 임베딩 테이블 (RAG, 도메인 공유)

| 테이블 | 용도 | Migration | 시드 |
|---|---|---|---|
| `consultation_embeddings` | Q&A 페어 + 정책 청크 임베딩 | m003 | `tools/channeltalk-ai/embed-consultations.ts` |
| `macro_embeddings` | CS 매크로 172건 임베딩 | m004 | `tools/channeltalk-ai/embed-macros.ts` |
| `service_areas` | 행정동 마스터 (서비스 가능 여부) | m006 | `tools/channeltalk-ai/seed-service-areas.ts` |

방문수거의 `product_embeddings` (m002) 와는 별개 — 방문 전용.

## 매니저 ID 매핑

채널톡 Open API 의 manager.id ↔ 사람 이름:

| ID | 이름 |
|----|------|
| 388942 | 라이언 |
| 388960 | 커버링(Covering) |
| 453131 | 조이 |
| 461401 | 커버링(Covering) |
| 563176 | 메리다 |
| 567994 | 서자현 |
| 578195 | 토미 |
| 592424 | 골드쉽 |
| 613510 | 베이지 |

→ 채널 ID: `64368` (모든 버림은, 커버링 채널 단일)
→ CDN: `https://cf.channel.io/{key}`

매니저 ID 변경 / 추가 시: 채널톡 콘솔에서 매니저 등록 → 우리 DB·코드에는 별도 등록 안 해도 됨 (API 가 그때그때 조회). 다만 자동 배정 (`auto-close-chat` 의 자동 배차) 에 쓰이는 매니저 목록은 코드 상수일 가능성 — 확인 후 갱신 필요.

## reply_kind 분류

`channeltalk_reply_logs` 에 누적:
- `ai_auto` — AI 추천 그대로 (overlap ≥ 1.0)
- `ai_assist` — AI 추천 일부 채택 (overlap ≥ 0.6)
- `human` — 직접 작성 / 매크로 / 외부 도구

**외부 도구 답변** (채널톡 데스크앱·모바일·web desk):
- 우리 웹사이트 거치지 않고 답변
- presence 채널에는 안 뜨지만 reply_log 는 기록됨 (manager_name)
- 대시보드 카드 색상: presence + lastReplyAt 5분 내 → "online (외부 도구 답변)" 표시

## 백오피스 데이터 흐름

```
채널톡 응대 중 phone 발견
   ↓
클라이언트 → POST /api/backoffice/lookup
   ↓
서버: backoffice_cache 확인 (24h TTL)
   ├─ hit → 즉시 반환
   └─ miss → backoffice_requests INSERT (status=pending)
              ↓
              [Vercel function 30s polling 시작]
              ↓
              스크래퍼 (별도 머신) — Realtime 으로 pending 폴링
              ↓
              admin.covering.app 로그인 + 데이터 추출
              ↓
              backoffice_requests UPDATE (status=completed, result=...)
              ↓
              [Vercel polling 이 감지] → backoffice_cache UPSERT (24h) → 반환
              ↓
              [request row 삭제]
```

타임아웃·에러 시 status=error 로 마킹 후 클라이언트에 504 응답.

### 데이터 라이프
- request 생성 후 즉시 처리 → 즉시 삭제
- 5분+ 된 row 는 cron (auto-close-chat 또는 별도) 에서 정리
- cache 는 24h TTL 후 GC 안 됨 → 누적되면 수동 cleanup

## 자주 쓰는 SQL

### 백오피스 처리량 (지난 1시간)
```sql
SELECT status, COUNT(*),
       MIN(created_at) AS first, MAX(created_at) AS last
FROM backoffice_requests
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```
- pending 이 누적 + completed 0 → 스크래퍼 다운 (08 참조)

### 백오피스 캐시 적중률
```sql
SELECT COUNT(*) AS cached_phones,
       MIN(cached_at) AS oldest,
       MAX(cached_at) AS newest
FROM backoffice_cache
WHERE cached_at > NOW() - INTERVAL '24 hours';
```

### AI 채택률 (오늘)
```sql
SELECT manager_name, reply_kind, COUNT(*),
       AVG(draft_char_overlap) AS avg_overlap
FROM channeltalk_reply_logs
WHERE sent_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
GROUP BY manager_name, reply_kind
ORDER BY manager_name, COUNT(*) DESC;
```

### 카테고리 프롬프트 운영팀이 변경한 이력 (audit_logs 활용 가능)
```sql
SELECT entity_id, action, user_name, created_at
FROM audit_logs
WHERE entity_type = 'category_prompt'
ORDER BY created_at DESC LIMIT 20;
```
(현재 audit 가 category_prompts 까지 적용됐는지 코드 확인 필요)

## 채널톡 메시지 자체 조회

DB 에 없으니 채널톡 Open API 직접 호출:
- `/api/channeltalk/chats/[chatId]/messages` GET
- 또는 콘솔 (channel.io) 직접 보기

응답 시간 메트릭 등은 채널톡 cases API 사용. 우리는 별도 저장 안 함.
