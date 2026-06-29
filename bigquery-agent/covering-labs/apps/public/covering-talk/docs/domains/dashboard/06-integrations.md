# 06 — 외부 연동

대시보드는 **외부 push 연동 없음**. Anthropic API 만 호출.

| 서비스 | 모듈 | 인증 | 비고 |
|---|---|---|---|
| Anthropic | `lib/ai/claude.ts` (공유) | `ANTHROPIC_API_KEY` | Sonnet (인사이트·리포트) + Haiku (분류) |
| Supabase Realtime (presence) | `lib/supabase/browser.ts` (presence 채널) | (anon key 사용) | 상담사 출석 채널 |

## Anthropic — 호출 패턴

### Sonnet
- Customer Journey 인사이트 (`/api/new_dashboard/insight`)
- 상담사 리포트 (`/api/new_dashboard/cs-report`)

### Haiku
- P5 이탈 사유 분류 (`/api/new_dashboard/p5-reasons`)
- Phase 이탈 사유 분류 (`/api/new_dashboard/churn-reasons`)
- 불만 사전 분류 (`cron/classify-complaints` — 5분, 배치)

### 비용 관리
- DB 캐시로 동일 요청 재호출 방지 (자세히는 [`03-ai.md`](03-ai.md) Cache 전략)
- Haiku 분류는 cron 으로 미리 채워 대시보드 응답 속도 확보 + 비용 평탄화
- 일일 Anthropic 사용량 모니터링: Anthropic 콘솔

### 환경변수
- `ANTHROPIC_API_KEY` (방문·런치·채널톡과 공유)

### 모델 변경
- 런타임: `app_settings.ai_provider` (anthropic / openai) — provider 단위 전환
- 코드 내 모델 ID: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001` 등 — 변경 시 영향 평가 필요

## Supabase Realtime (presence)

`useCsRealtimePresence` 훅이 Supabase Realtime 의 presence 채널에 join.

### 채널
- 이름: `presence:cs-realtime`
- key: 상담사 `user.name` (같은 이름은 1개로 dedupe)

### 데이터
- name (상담사 이름)
- system (visit / lunch / channeltalk / admin / idle)
- page (현재 pathname)
- lastActiveAt (epoch ms)
- joinedAt (epoch ms)

### 인증
- anon key 로 join (RLS 가 막지 않는 경우만 동작)
- `lib/supabase/browser.ts:supabaseBrowser` 가 client side

### 한계
- Supabase Realtime presence 는 채널 disconnect 시 즉시 leave (다른 클라이언트에 sync 알림)
- 같은 user.name 으로 여러 탭/디바이스 접속 시 마지막 track 만 살아남음 → false positive offline 가능 (08-gotchas)
- 백그라운드 탭에서 setInterval throttle 가능 → HEARTBEAT_INTERVAL_MS 30s 로 여유
- `subscribe(status)` 에서 `CHANNEL_ERROR` / `TIMED_OUT` / `CLOSED` console.warn — devtools 로 진단 가능

### 활동시간 진본 분리
presence 채널은 휘발성이라 채널 끊김·throttle 시 lastActiveAt 이 stale 화 되어 활성 상담사가 "동작없음" 으로 표시되는 회귀 발생. 해결:
- presence 채널 = "현재 어디 있나" (system / page 표시용)
- DB `cs_presence_log` MAX(recorded_at) = "마지막 활동" 진본 (1분 보장)
- 대시보드: `Math.max(presence.lastActiveAt, op.lastActivityAt)` 로 dot 색깔 + "동작없음" 라벨 모두 계산

## Heartbeat 라우트 (활동시간 진본)

- 라우트: `POST /api/cs-realtime/heartbeat`
- 클라 트리거: `useCsRealtimePresence` 의 30초 timer (HEARTBEAT_INTERVAL_MS)
- 조건: visible + 5분 내 활동 + 운영시간 KST 08–22
- 저장: `cs_presence_log` (id, user_name, page, system, recorded_at)
- 활용:
  - 대시보드 카드의 활동시간 폴백 (`/api/new_dashboard/cs-realtime` operator response 의 `lastActivityAt`)
  - 근무시간 (분) = 운영시간 내 distinct 1분 bucket
  - WorkHistoryModal 일별 minutes

## 외부 데이터 가져오는 곳 없음

대시보드는:
- 외부 API push 받지 않음
- 외부 DB 동기화 없음
- 외부 webhook 없음
- Anthropic 만 호출 (push 아님)

→ 인프라 의존도 낮음. Anthropic 다운되면 인사이트·분류만 안 되고 카드 표시는 정상.

## 인증 토큰 로테이션

| 서비스 | 권장 주기 | 메커니즘 |
|---|---|---|
| Anthropic | 변경 없음 (노출 시만) | Anthropic 콘솔 |
| Supabase | 변경 없음 | (key 노출 시 회사 정책) |

## 미래 확장 후보

- Slack 알림 (Health Check 임계 초과 시 자동) — 미구현
- 이메일 일일 리포트 — 미구현
- Sentry / Datadog 통합 — 미구현
- 외부 BI 도구 export — 미구현
