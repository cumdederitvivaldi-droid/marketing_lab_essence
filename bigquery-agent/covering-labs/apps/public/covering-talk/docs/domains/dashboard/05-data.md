# 05 — 데이터 (대시보드 자체 7 + 읽기 의존)

> 컬럼 상세는 [`../../db/dashboard.md`](../../db/dashboard.md). 본 문서는 운영 관점.

## 자체 7 테이블

| 테이블 | 용도 | Migration | 라이프 |
|---|---|---|---|
| `dashboard_settings` | KR 목표값·임계값 (key/value JSONB) | 021 | 운영팀 갱신 |
| `dashboard_notes` | 셀 단위 메모/토론 + 해결 플래그 | 022 | 무기한 |
| `dashboard_insights` | Customer Journey AI 인사이트 캐시 | 023 | hash 기반 (변경 없으면 영구 hit) |
| `dashboard_p5_reasons` | P5 이탈 사유 분류 캐시 | 024 | session_id 기반 |
| `dashboard_churn_reasons` | Phase 이탈 사유 분류 캐시 | 025 | session_id 기반 |
| `dashboard_complaints` | 불만 분류 (5단계 reclassify) | 027~031 | cron 5분 갱신 |
| `cs_presence_log` | 1분 heartbeat (출석) | 032 | 무기한 누적 |

## 읽기 의존 (다른 도메인)

| 테이블 | 도메인 | 사용처 |
|---|---|---|
| `conversations` | 방문 | Journey funnel · KR · Health |
| `messages` | 방문 | reply_kind 통계 · CS Realtime |
| `orders` | 방문 | KR (매출) · Health (취소·미수거) |
| `lunch_conversations` | 런치 | CS Realtime |
| `lunch_messages` | 런치 | reply_kind 통계 |
| `lunch_orders` | 런치 | KR · Health |
| `channeltalk_reply_logs` | 채널톡 | CS Realtime · AI breakdown |
| `app_settings` (`counselor:*`) | 공유 | 활성 상담사 명단 |

대시보드는 **모든 다른 테이블에 SELECT 만**. INSERT / UPDATE / DELETE 권한 없음 (애플리케이션 레벨 보장).

## dashboard_settings 키 (운영 가능)

```sql
-- 현재 시드된 키 확인
SELECT key, value, description FROM dashboard_settings ORDER BY key;
```

| 키 | 기본값 | 의미 |
|---|---|---|
| `kr1_target` | 300_000_000 | KR1 월 매출 목표 (원) |
| `kr2_target` | (운영 산출 시 활성) | 처리 가능 매출 |
| `kr2_use_hardcoded` | true | hardcoded 사용 여부 |
| `kr2_current_hardcoded` | (현재 값) | 산출 로직 미구현 시 사용 |
| `kr3_target` | (운영 산출 시 활성) | 외 트래픽 매출 비중 |
| `kr3_use_hardcoded` | true | |
| `kr3_current_hardcoded` | (현재 값) | |
| `churn_window_hours` | 24 | Phase 진입 후 N시간 무전이 → 이탈 |
| `reentry_window_days` | 14 | 이탈 후 N일 이내 재발화 → 재진입 |
| `health_no_pickup_threshold` | 3.0 | 미수거 % 임계 |
| `health_cancel_threshold` | 3.0 | 취소 % |
| `health_no_payment_threshold` | 2.0 | 미결제 % |
| `health_complaint_threshold` | 5 | 불만 건수 |
| `health_nps_threshold` | 60 | NPS pt |

운영팀이 `/new_dashboard/settings` (또는 직접 SQL) 로 변경 → 즉시 반영.

## cs_presence_log 라이프

### INSERT 조건 (클라이언트 `useCsRealtimePresence`)
- `document.visibilityState === "visible"`
- 최근 5분 내 mouse/keyboard/click 활동
- 운영시간 KST 08-22 내
- 30초 timer (HEARTBEAT_INTERVAL_MS — 종전 60초에서 단축, 브라우저 throttle 대비 여유)

### 활용
- 근무시간 (분) = 운영시간 내 distinct 1분 bucket
- WorkHistoryModal 의 일별 minutes 컬럼
- 대시보드 활동시간 진본 (`/api/new_dashboard/cs-realtime` operator response 의 `lastActivityAt = MAX(recorded_at) per user, today`) — presence 채널 stale 시 dot 색깔 + "동작없음" 라벨의 폴백

### 누적 정리
- 무기한 누적 — 별도 GC 없음
- 1년 후 vacuum 검토 (수동)

## dashboard_notes cell_key 컨벤션

자세히는 [`../../db/dashboard.md`](../../db/dashboard.md). 핵심:

| section | cell_key 패턴 | 예시 |
|---|---|---|
| `journey` | `<phase>:<metric>` | `phase_4:conversion`, `phase_2:churn_keyword` |
| `kr` | `<id>` | `kr1`, `kr2`, `kr3` |
| `health` | `<metric>` | `no_pickup`, `cancel`, `nps` |
| `traffic` | `global` | (단일 셀) |

작성자 본인만 삭제 가능 (DELETE 라우트 가드).

## dashboard_insights 캐시 hit/miss

```sql
-- hit 률 추정 (최근 7일)
SELECT COUNT(DISTINCT (period_key, journey_hash)) AS unique_combos,
       COUNT(*) AS total_rows
FROM dashboard_insights WHERE generated_at > NOW() - INTERVAL '7 days';
```

- 같은 (period, hash) 가 1번만 INSERT 되므로 unique_combos = total_rows 가 정상
- 호출 수 vs INSERT 수 비교는 별도 로깅 필요 (Vercel Functions 로그)

## dashboard_complaints 라이프

```sql
-- 최근 7일 분류된 row 수
SELECT category, COUNT(*) FROM dashboard_complaints
WHERE classified_at > NOW() - INTERVAL '7 days'
GROUP BY category ORDER BY COUNT(*) DESC;
```

- 카테고리 운영 (m027~031 진화) 후 잔여 stale 카테고리 가능 — 주기적 재분류 검토

## 자주 쓰는 SQL

### 오늘 한 줄 요약
```sql
SELECT
  (SELECT COUNT(*) FROM dashboard_notes WHERE NOT resolved) AS unresolved_notes,
  (SELECT COUNT(*) FROM dashboard_complaints
   WHERE classified_at::date = (NOW() AT TIME ZONE 'Asia/Seoul')::date AND category != 'none') AS today_complaints,
  (SELECT COUNT(DISTINCT user_name) FROM cs_presence_log
   WHERE recorded_at > NOW() - INTERVAL '15 minutes') AS active_counselors_now;
```

### 미해결 메모 (오래된 순)
```sql
SELECT section, cell_key, content, author, created_at
FROM dashboard_notes WHERE NOT resolved
ORDER BY created_at LIMIT 30;
```

### 상담사별 오늘 근무시간
```sql
SELECT user_name, COUNT(DISTINCT FLOOR(EXTRACT(EPOCH FROM recorded_at) / 60))::int AS minutes
FROM cs_presence_log
WHERE recorded_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
  AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'Asia/Seoul') BETWEEN 10 AND 21
GROUP BY user_name ORDER BY minutes DESC;
```

### 카테고리별 불만 (이번 달)
```sql
SELECT category, COUNT(*) FROM dashboard_complaints
WHERE classified_at >= TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-01')::date
  AND category != 'none'
GROUP BY category ORDER BY COUNT(*) DESC;
```
