# 08 — 알려진 함정 + 디버깅 가이드

## 자주 깨지는 것들

### 1. presence 카드 — 옆자리 상담사가 offline 표시
- **원인**: presence 채널에 그 상담사가 join 안 함
- **가능 시나리오 (가능성 순)**:
  1. 상담사가 우리 웹사이트 안 쓰고 외부 도구(채널톡 데스크앱·해피톡 콘솔·모바일) 로 답변 (1순위)
  2. 같은 user.name 다중 탭/디바이스 → presence key 충돌 → false positive offline
  3. 백그라운드 탭 timer throttle → presence track 유실
  4. 로그인 세션 만료
- **2026-04-27 보강**: presence 없어도 lastReplyAt 5분 내면 "online (외부 도구 답변)" 표시 → 1순위 케이스 해결
- **검증 SQL**:
  ```sql
  -- 옆자리 상담사 이름이 결과에 있으면 → presence 채널 join 됐을 텐데 카드만 offline = 코드 버그
  SELECT user_name, COUNT(*), MAX(recorded_at)
  FROM cs_presence_log WHERE recorded_at > NOW() - INTERVAL '1 hour'
  GROUP BY user_name ORDER BY MAX(recorded_at) DESC;
  ```

### 2. AI 인사이트 캐시 hit 인데 옛 데이터 반환
- **증상**: 데이터 변경했는데 인사이트가 그대로
- **원인**: `journey_hash` 가 sha256 16자만 사용 → 작은 변화는 hash 같음 (충돌)
- **확인**:
  ```sql
  SELECT period_key, journey_hash, generated_at
  FROM dashboard_insights ORDER BY generated_at DESC LIMIT 20;
  ```
- **강제 무효화**: 해당 row DELETE
  ```sql
  DELETE FROM dashboard_insights WHERE period_key = '...';
  ```
- **개선**: hash 길이 늘리기 (16자 → 32자)

### 3. 불만 분류 정확도 저하
- **증상**: 명백한 불만이 `none` 으로 분류 / 평범한 메시지가 불만으로 분류
- **원인**: `lib/dashboard/complaint-classify.ts` 의 prompt 가 stale (최근 사용자 패턴 반영 안 됨)
- **확인**:
  ```sql
  -- 최근 7일 unmark 율
  SELECT date_trunc('day', classified_at) AS day,
         COUNT(*) FILTER (WHERE category = 'none') AS unmarked,
         COUNT(*) AS total,
         ROUND(100.0 * COUNT(*) FILTER (WHERE category = 'none') / NULLIF(COUNT(*), 0), 1) AS pct
  FROM dashboard_complaints
  WHERE classified_at > NOW() - INTERVAL '7 days'
  GROUP BY day ORDER BY day DESC;
  ```
- **수정**:
  - prompt 보강 (`lib/dashboard/complaint-classify.ts`)
  - m030/m031 의 reclassify 패턴 적용
  - 운영팀이 false positive unmark 한 패턴을 prompt 에 negative example 로 추가

### 4. CS Realtime 응답 느림
- **증상**: 카드 갱신이 5초+ 걸림
- **원인 후보**:
  - 24시간 messages / lunch_messages 데이터 폭증 (공휴일 후 등)
  - Supabase 인덱스 누락
  - 채널톡 listAllUserChats 응답 느림
- **확인**: Vercel Functions 로그의 `[realtime]` elapsed
- **완화**: 페이지 polling 간격 10s → 30s (트래픽 적은 시간대)

### 5. classify-complaints cron 60초 timeout
- **증상**: cron 실행 중간에 끊김 → 일부 row 만 분류
- **원인**: 한 번에 너무 많이 분류 시도 (BATCH_SIZE × MAX_BATCHES > 300)
- **수정**: 한도 줄이기 (예: 300 → 200)
- **catch up**: 다음 cycle 에서 자동 보충 (5분 간격)

### 6. dashboard_notes — 다른 사람 메모 삭제 안 됨
- **증상**: DELETE 호출이 401/403
- **원인**: 작성자 본인만 삭제 가능 (라우트 가드)
- **수정 방법**: 강제 삭제 필요하면 DB 직접
  ```sql
  DELETE FROM dashboard_notes WHERE id = '...';
  ```
- **개선**: 관리자 우회 권한 추가 검토

### 7. Heartbeat 들어오는데 카드는 offline (해결됨)
- **2026-04-28 수정**: 카드 dot 색깔 + "동작없음" 라벨 모두 `Math.max(presence.lastActiveAt, op.lastActivityAt)` 로 계산 — DB heartbeat 가 폴백.
- **이전 회귀**: presence 채널 단일 의존 → 채널 끊김/throttle 시 활성 상담사가 검정점 + "17분 동작없음" 으로 표시. 활동시간 진본을 `cs_presence_log` MAX(recorded_at) 으로 이전하여 해결.
- **현재 동작**: presence 정상 시 5초 갱신 (ACTIVITY_BUCKET 5s), presence 끊겨도 30초 ~ 1분 stale 한도 (HEARTBEAT 30s)
- **확인**:
  - presence 채널: `useCsRealtimePresence().viewers` (브라우저 콘솔)
  - DB heartbeat: 위 §1 SQL
  - API: `/api/new_dashboard/cs-realtime` 응답의 `operators[].lastActivityAt`

### 8. lastReplyAt 외부 도구 답변 표시가 안 됨
- **증상**: 채널톡 데스크앱 답변자가 "외부 도구 답변" 으로 안 보임
- **2026-04-27 보강 후 정상이어야 함**
- **확인**:
  - `/api/new_dashboard/cs-realtime` 응답에 `lastReplyAt` 필드 있는지
  - 클라이언트 (`CsRealtimeSection.tsx`) 가 `presenceLevel === "offline" && recentReplyMs < 5 * 60_000` 분기 적용 중인지

### 9. KR1 매출 집계 부정확
- **증상**: 대시보드 KR1 가 운영팀 실제 매출 통계와 불일치
- **원인**: `orders.total_price` 와 lunch_orders 합산 로직 오차 (취소·환불 처리 등)
- **수정**: `lib/dashboard/revenue.ts` 검토

### 10. 채널톡 큐깊이 표시 안 됨 (null)
- **증상**: queueDepth.channeltalk 가 null
- **원인**: `listAllUserChats` 호출 실패 (채널톡 API 한도 / 인증 만료)
- **확인**: Vercel Functions 로그에서 채널톡 관련 에러
- **fallback**: null 표시 정상 (catch 후 null 반환 명시)

## 자주 사용하는 SQL

### 한 줄 요약
```sql
SELECT
  (SELECT COUNT(*) FROM cs_presence_log WHERE recorded_at > NOW() - INTERVAL '15 minutes') AS hb_15min,
  (SELECT COUNT(DISTINCT user_name) FROM cs_presence_log WHERE recorded_at > NOW() - INTERVAL '15 minutes') AS active_users,
  (SELECT COUNT(*) FROM dashboard_notes WHERE NOT resolved) AS unresolved_notes,
  (SELECT COUNT(*) FROM dashboard_complaints
   WHERE classified_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date AND category != 'none') AS complaints_today;
```

### 상담사별 오늘 답변 + heartbeat 같이
```sql
WITH today_replies AS (
  SELECT sent_by, COUNT(*) AS replies FROM messages
  WHERE role = 'assistant' AND created_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
  GROUP BY sent_by
),
today_hb AS (
  SELECT user_name,
         COUNT(DISTINCT FLOOR(EXTRACT(EPOCH FROM recorded_at) / 60))::int AS minutes
  FROM cs_presence_log
  WHERE recorded_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
  GROUP BY user_name
)
SELECT COALESCE(r.sent_by, h.user_name) AS name, r.replies, h.minutes
FROM today_replies r FULL OUTER JOIN today_hb h ON r.sent_by = h.user_name
ORDER BY r.replies DESC NULLS LAST, h.minutes DESC NULLS LAST;
```

### 이번 달 KR vs 실제
```sql
SELECT 'KR1' AS kr,
       (SELECT (value::text)::bigint FROM dashboard_settings WHERE key = 'kr1_target') AS target,
       (SELECT SUM(total_price) FROM orders
        WHERE status = 'completed'
          AND date >= TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-01')) AS actual;
```

### 분류 분포 (이번 달)
```sql
SELECT category, COUNT(*) FROM dashboard_complaints
WHERE classified_at >= TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-01')::date
GROUP BY category ORDER BY COUNT(*) DESC;
```

### Insight 캐시 적중 (수동 측정)
```sql
SELECT period_key, COUNT(DISTINCT journey_hash) AS unique_hashes,
       COUNT(*) AS total_rows
FROM dashboard_insights
GROUP BY period_key ORDER BY total_rows DESC LIMIT 20;
```

## 디버깅 체크리스트 (장애 발생 시)

- [ ] Vercel Functions 로그 — `[realtime]`, `[insight]`, `[classify-complaints]` prefix
- [ ] Supabase Logs
- [ ] 위 §1 의 cs_presence_log SQL — heartbeat 들어오는지
- [ ] Anthropic 콘솔 — 한도·에러
- [ ] `/api/new_dashboard/cs-realtime` 직접 호출해 응답 검증 (브라우저 DevTools / curl)
- [ ] `dashboard_insights` row 수 (캐시 누적 정상인지)
- [ ] 권한 — `getCurrentUser().name` 이 ALLOWED_USERS 에 있는지

## 새 함정 발견 시

1. 본 문서 추가
2. 진단 SQL / 로그 패턴
3. 회피·복구 절차
4. 코드 가드 보강 가치 있으면 PR / 이슈로 처리
