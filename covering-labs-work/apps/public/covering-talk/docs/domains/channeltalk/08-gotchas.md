# 08 — 알려진 함정 + 디버깅 가이드

## 자주 깨지는 것들

### 1. 백오피스 스크래퍼 다운 → 504 폭주
- **증상**: `/api/backoffice/lookup` 504 timeout 폭주, AI 추천에 백오피스 정보 inline 안 됨
- **확인**:
  ```sql
  SELECT status, COUNT(*) FROM backoffice_requests
  WHERE created_at > NOW() - INTERVAL '10 minutes' GROUP BY status;
  ```
  pending > 5 + completed = 0 → 스크래퍼 다운
- **복구**:
  1. 운영팀이 스크래퍼 머신 재시작
  2. 회로 차단기 (클라이언트 측, 3회 실패 → 5분 skip) 가 폭주 막음
  3. Vercel function timeout 30s — 그 안에 응답 안 오면 504

### 2. Desk API 쿠키 만료 (30일)
- **증상**: 메시지 삭제 (`/api/channeltalk/chats/[chatId]/delete-message`) 가 401/403
- **원인**: `CHANNELTALK_DESK_COOKIE` 만료
- **복구**: desk.channel.io 재로그인 → DevTools 쿠키 추출 → Vercel env 갱신 → 재배포
- **예방**: 캘린더 30일 알림 설정

### 3. AI 추천이 안 만들어짐
- **증상**: SuggestPanel 이 빈 상태 / 무한 로딩
- **원인 후보**:
  - Anthropic API 한도 초과 / 키 만료
  - Voyage AI 응답 없음 → RAG 빈 채로 fallback (이건 동작 정상)
  - `/api/channeltalk-ai/suggest` 라우트 자체 에러 — Vercel 로그
- **확인**: `/api/channeltalk-ai/suggest/stream` 호출 시 단계별 출력 (SuggestDebugPanel)
- **복구**: API 키 / 한도 점검

### 4. 분류가 잘못됨 (우리는 X 카테고리인데 Y 로 분류)
- **증상**: 추천 답변이 상담사 의도와 다름
- **원인**: Stage 1 (Sonnet 분류) 가 잘못 판단
- **수정**: `lib/channeltalk-ai/category-prompts.ts` 의 Stage 1 prompt 보강 (해당 카테고리 keyword / negative example 추가)
- **A/B 검증**: AiCompareModal 사용

### 5. "외부 도구 답변" 인데 카드에 안 뜸 (이미 보강됨)
- **증상**: 채널톡 데스크앱·모바일로 답변하는 상담사가 대시보드에 offline
- **2026-04-27 보강**: 카드 status 결정에 `lastReplyAt` 추가 — 5분 내 답변 있으면 "online (외부 도구 답변)" 표시
- 잘 동작하지 않으면: `/api/new_dashboard/cs-realtime` 응답에 `lastReplyAt` 필드 있는지 확인

### 6. 자동 배차 cron 이 잘못된 매니저에게 배정
- **증상**: 자동 배정된 매니저가 부재 / 휴가
- **원인**: `auto-close-chat` 의 자동 배정 로직이 매니저 로테이션·휴가 미고려
- **확인**: 매니저 ID 매핑 (05-data.md) 과 비교
- **개선**: 매니저별 weekly capacity / off-day 설정 (앞으로 검토)

### 7. 채널톡 메시지가 중복 저장 (기록 측면에서)
- **증상**: `channeltalk_reply_logs` 에 같은 chat_id + 시간 row 가 2개
- **원인**: 상담사가 빠르게 두 번 발송 (또는 클라이언트 중복 호출)
- **확인**:
  ```sql
  SELECT chat_id, manager_name, sent_at, COUNT(*)
  FROM channeltalk_reply_logs
  WHERE sent_at > NOW() - INTERVAL '1 hour'
  GROUP BY chat_id, manager_name, sent_at HAVING COUNT(*) > 1;
  ```
- **방지**: idempotency key 추가 검토 (현재 없음)

### 8. category_prompts 변경 후 추천이 이상함
- **증상**: 카테고리 prompt_rules 수정 후 답변 품질 저하
- **확인**: 변경 전후 응답을 AiCompareModal 로 비교
- **롤백**: `audit_logs` 또는 백업에서 원본 prompt_rules 복원

### 9. RAG 가 무관한 정책 인용
- **증상**: 답변에 엉뚱한 정책 섹션이 붙음
- **원인**: 정책 임베딩 노이즈 / 코사인 유사도 임계값 부적절
- **수정**:
  - 정책 문서 청킹 단위 조정
  - 임계값 (top-K, 유사도 threshold) 조정
  - `tools/channeltalk-ai/embed-consultations.ts` 재실행

### 10. 백오피스 캐시 비정상 (오래된 데이터 반환)
- **증상**: 24h 캐시 hit 인데 실제로는 정보 변경됨
- **확인**:
  ```sql
  SELECT phone, cached_at FROM backoffice_cache
  WHERE phone = '01012345678';
  ```
- **수동 강제 무효화**:
  ```sql
  DELETE FROM backoffice_cache WHERE phone = '01012345678';
  ```
- **개선**: 변경 가능성 높은 데이터 (주문 상태) 는 짧은 TTL 검토

## 자주 사용하는 SQL

### 한 줄 요약 (오늘)
```sql
WITH today AS (
  SELECT (NOW() AT TIME ZONE 'Asia/Seoul')::date AS d
)
SELECT
  (SELECT COUNT(*) FROM channeltalk_reply_logs
   WHERE sent_at >= ((SELECT d FROM today) - INTERVAL '15 hours')::timestamptz + INTERVAL '15 hours') AS replies_today,
  (SELECT COUNT(*) FROM channeltalk_reply_logs
   WHERE sent_at > NOW() - INTERVAL '1 hour') AS last_hour,
  (SELECT COUNT(*) FROM backoffice_requests
   WHERE created_at > NOW() - INTERVAL '1 hour' AND status = 'pending') AS bo_pending,
  (SELECT COUNT(*) FROM backoffice_cache) AS cached_total;
```

### AI 채택률 vs 직접 답변 (오늘)
```sql
SELECT manager_name,
       COUNT(*) FILTER (WHERE reply_kind = 'ai_auto') AS auto,
       COUNT(*) FILTER (WHERE reply_kind = 'ai_assist') AS assist,
       COUNT(*) FILTER (WHERE reply_kind = 'human') AS human,
       COUNT(*) AS total,
       ROUND(100.0 * COUNT(*) FILTER (WHERE reply_kind LIKE 'ai_%') / NULLIF(COUNT(*), 0), 1) AS ai_pct
FROM channeltalk_reply_logs
WHERE sent_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '15 hours' + INTERVAL '15 hours'
GROUP BY manager_name ORDER BY total DESC;
```

### 백오피스 응답시간 분포
```sql
SELECT EXTRACT(EPOCH FROM (completed_at - created_at)) AS sec, COUNT(*)
FROM backoffice_requests
WHERE status = 'completed' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1 ORDER BY 1;
```
- 30s 가까이 걸리는 건이 많으면 스크래퍼 부하 증가

### 실패 패턴
```sql
SELECT error_message, COUNT(*)
FROM backoffice_requests
WHERE status = 'error' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_message ORDER BY COUNT(*) DESC;
```

### 카테고리별 분포 (audit_logs 활용)
```sql
-- 추후 channeltalk_reply_logs 에 category 컬럼 추가 검토
-- 현재는 채널톡 콘솔 태그 통계 활용
```

## 디버깅 체크리스트 (장애 발생 시)

- [ ] Vercel Functions 로그 — `[channeltalk]`, `[suggest]`, `[backoffice]` prefix grep
- [ ] Supabase Logs
- [ ] 백오피스 SQL (위 §1 의 status grouping)
- [ ] Anthropic 콘솔 — API 한도·에러
- [ ] Voyage AI 콘솔
- [ ] 채널톡 desk.channel.io — 직접 답변 가능 여부
- [ ] SuggestDebugPanel 단계별 출력
- [ ] Desk Cookie 만료 일자 (30일 카운터)
- [ ] 운영팀 — 스크래퍼 머신 상태

## 새 함정 발견 시

1. 본 문서 추가
2. 진단 SQL / 로그 패턴 첨부
3. 회피·복구 절차
4. 코드 가드 보강 가치 있으면 PR / 이슈로 처리
