# 07 — 운영 (Cron · 캐시 · 모니터링)

## Cron (대시보드 관련 1개)

| Path | KST | 영향 | 상세 |
|---|---|---|---|
| `classify-complaints` | 5분 | `dashboard_complaints` UPSERT | [cron.md §6](../../architecture/cron.md#6-classify-complaints--불만-사전-분류) |

### 동작
1. 최근 7일 messages (role=user, 6자+) 미분류 row 조회
2. Haiku 배치 분류 (BATCH_SIZE=30 × MAX_BATCHES=10 = 최대 300건/회)
3. (session_id, message_id) PK 로 UPSERT
4. Vercel maxDuration=60s 안에 완료

### 실패 시 영향
- 신규 불만 분류 지연 (다음 cycle 에서 catch up)
- 대시보드 진입 시 미분류 row 가 보일 수 있음 (드물게)

## 캐시 만료 / 무효화

### `dashboard_insights`
- TTL 없음 — `(period_key, journey_hash)` 같으면 영구 hit
- 무효화: 데이터 변경 시 hash 자동 변화 → 새 row INSERT
- 누적 정리: 한 달 이상 미사용 row → vacuum 검토 (수동)

### `dashboard_p5_reasons` / `dashboard_churn_reasons`
- session_id 단위 — 같은 session 재요청 시 즉시 반환
- 만료 없음
- 누적: session 수 만큼 (대규모는 아님)

### `dashboard_complaints`
- cron 이 5분마다 갱신
- false positive unmark 후 재분류 안 함 (`none` 카테고리 보존)
- 누적 정리: 6개월+ 데이터 archive 검토

### 메모리 캐시 (`lib/dashboard/cache.ts`)
- Vercel function 재시작 시 사라짐
- 자동 GC 없음 (process 끝까지 유지)
- 큰 응답이라도 메모리 부담 거의 없음 (텍스트 위주)

## 배포

방문수거와 동일:
- main push → Vercel 자동
- env 변경 → 재배포

대시보드 특이점:
- `lib/dashboard/insight.ts` 의 prompt 변경 시 캐시 hit 인 기간은 영향 없음 (hash 가 같으면 옛 결과 반환)
  - 강제 새로고침 필요 시 `dashboard_insights` 해당 row DELETE
- `ADMIN_DASHBOARD_ALLOWED_USERS` 변경 시 모든 `/api/new_dashboard/*` 라우트에 영향 — 일괄 패치 후 배포

## 모니터링

### 캐시 hit 률 (Anthropic 비용)
Vercel Functions 로그에서 `[insight] cache hit` / `[insight] cache miss` (가정) prefix grep.

### CS Realtime 응답시간
- 클라이언트 측 polling 10초 — 응답시간이 5초+ 면 안 좋음
- `console.time` / `console.timeEnd` 로 측정 가능

### Heartbeat 누적
```sql
-- 지난 1시간 heartbeat 분포
SELECT user_name, COUNT(*) AS hb,
       MIN(recorded_at) AS first, MAX(recorded_at) AS last
FROM cs_presence_log
WHERE recorded_at > NOW() - INTERVAL '1 hour'
GROUP BY user_name ORDER BY MAX(recorded_at) DESC;
```

활성 상담사 수 ≈ user_name 수 / hb 수 (1분 1회 기준).

### 분류 정확도 / unmark 빈도
```sql
-- 오늘 분류 → unmark 비율
WITH today_classified AS (
  SELECT COUNT(*) AS total FROM dashboard_complaints
  WHERE classified_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date
)
SELECT
  (SELECT total FROM today_classified) AS classified,
  COUNT(*) FILTER (WHERE category = 'none') AS unmarked,
  ROUND(100.0 * COUNT(*) FILTER (WHERE category = 'none') / NULLIF((SELECT total FROM today_classified), 0), 1) AS unmark_pct
FROM dashboard_complaints
WHERE classified_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date;
```

unmark_pct 가 너무 높으면 (예: 30%+) 분류 prompt 재검토 필요.

## 운영 알림

### Slack
- 별도 alert 없음 (검토 가치)
- 후보:
  - Health Check 임계 초과 자동 Slack
  - 미해결 메모 일일 요약
  - 불만 spike 알림

### 사내 알림 (notifications)
- 멘션·배정 시스템 공유 사용

## 배포 영향 — 변경 시 주의

| 변경 영역 | 영향 |
|---|---|
| `app/new_dashboard/page.tsx` | 메인 페이지 — 회귀 위험 큼 |
| `lib/dashboard/insight.ts` (prompt) | 새 hash 만 영향 — 기존 hit 은 옛 결과 |
| `dashboard_settings` (DB) | 즉시 반영 (다음 호출부터) |
| `ADMIN_DASHBOARD_ALLOWED_USERS` | 모든 라우트 영향 — 일괄 패치 |
| `useCsRealtimePresence` 의 임계값 (5분/15분) | UI 색상 영향 — 직관적 의미 변경 시 사용자 안내 |
| `cron/classify-complaints` 한도 | 한도 변경 시 maxDuration 60s 검토 |
| Migration m027~031 (불만 분류) | 기존 데이터 reclassify 처리 |

## 트래픽 패턴

- 대시보드 페이지 진입 — 평일 오전 (출근 후) + 오후 (점심 후) peak
- CS Realtime polling — 페이지 활성 동안 10초마다 (사용자 5명 동시 = 분당 30회)
- analytics 호출은 무겁지만 (수백ms) 메모 / 인사이트는 캐시로 즉시
- classify-complaints cron — 5분 1회 (안정적)
