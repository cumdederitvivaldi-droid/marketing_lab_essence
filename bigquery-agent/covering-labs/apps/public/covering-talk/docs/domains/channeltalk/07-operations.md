# 07 — 운영 (Cron · 모니터링 · 백오피스)

## Cron (채널톡 전용 1개)

| Path | KST | 영향 | 상세 |
|---|---|---|---|
| `auto-close-chat` | 2분 | 채널톡 자동 종료 + 자동 배차 + backoffice_requests GC | [cron.md §1](../../architecture/cron.md#1-auto-close-chat--채널톡-자동-종료) |

### 채널톡 측 동작
1. opened state 의 채팅 목록 조회 (`listAllUserChats({state:"opened"})`)
2. 마무리 인사 패턴 (예: "*별도의 회신이 없을 경우, 상담이 종료됩니다") 보낸 후 N분간 회신 없는 채팅 → `closeChat`
3. 신규 chat 에 자동 태깅 (`autoTagChat` — Sonnet 분류)
4. 담당자 미배정 chat → 자동 배정 (`assignChat`)
5. 일부는 `snoozeChat` 으로 보류

### 실패 시
- closeChat 실패 → 다음 실행에서 재시도
- 자동 배정 실패 → 미배정 누적
- 자동 태깅 실패 → 카테고리 빈 채로 운영 (수동 태깅으로 보완)

## 모니터링

### 백오피스 가용성
```sql
SELECT status, COUNT(*),
       MIN(created_at) AS first, MAX(created_at) AS last
FROM backoffice_requests
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;
```

| 결과 | 해석 |
|---|---|
| pending 0 + completed N | 정상 (스크래퍼 가동) |
| pending N + completed 0 | **스크래퍼 다운** — 운영팀 알림 |
| processing 누적 | 스크래퍼가 처리 중 정지 (재시작 필요) |
| error 다수 | admin.covering.app 변경 또는 자격증명 만료 |

### AI 채택률 (시간대별)
```sql
SELECT date_trunc('hour', sent_at) AS hour,
       COUNT(*) FILTER (WHERE reply_kind = 'ai_auto') AS auto,
       COUNT(*) FILTER (WHERE reply_kind = 'ai_assist') AS assist,
       COUNT(*) FILTER (WHERE reply_kind = 'human') AS human,
       COUNT(*) AS total
FROM channeltalk_reply_logs
WHERE sent_at > NOW() - INTERVAL '24 hours'
GROUP BY hour ORDER BY hour DESC;
```

채택률 (`(auto + assist) / total`) 가 시간대별로 일정한 게 정상. 갑자기 떨어지면 AI 품질 저하 (백오피스 다운, 임베딩 누락 등) 의심.

### 카테고리 분포
```sql
-- (channeltalk_reply_logs 에 category 컬럼 없음 → suggest 호출 로그가 별도 있어야 함)
-- 또는 채널톡 콘솔의 태그 통계 활용
```

### 응답시간
- 채널톡 cases API 활용 (DB에 저장 안 함)
- `/channeltalk/analytics` 에서 시각화

## 배포

방문수거와 동일:
- main push → Vercel 자동
- env 변경 → 재배포

채널톡 특이점:
- `lib/channeltalk-ai/category-prompts.ts` 변경 시 즉시 반영 (코드)
- `category_prompts` 테이블 변경 시 즉시 반영 (DB - 다음 호출부터)
- `tools/channeltalk-ai/embed-*.ts` 실행은 **수동** (배포 후 알맞은 타이밍에)

## 백오피스 스크래퍼 운영

### 시작 / 재시작
- 운영팀이 별도 머신에서 `node scripts/backoffice-scraper/index.js` 류로 실행
- 또는 PM2 / systemd 등으로 데몬화

### 헬스체크
- `backoffice_requests` 의 최근 1분 처리량 확인
- 1분 이상 처리 0 + pending 0 → 스크래퍼 idle (정상)
- 5분 이상 pending 누적 → 다운

### 로그
- 스크래퍼 머신의 stdout / 파일 로그
- Supabase Realtime 연결 상태

### 비상 우회
- 스크래퍼 다운 → AI 추천에서 백오피스 정보 inline 안 됨
- 상담사가 admin.covering.app 직접 보고 답변 (수동)
- 그동안 회로 차단기로 클라이언트 호출 빈도 줄임

## 운영 알림

### Slack
- 별도 alert 채널 없음
- 검토 가치: 백오피스 다운 자동 알림 (스크래퍼 hb 끊기면)

### 사내 알림 (notifications)
- 공유 시스템

## 배포 영향 — 변경 시 주의

| 변경 영역 | 영향 |
|---|---|
| `lib/channeltalk-ai/suggest.ts` | 즉시 다음 호출부터 새 파이프라인 |
| `lib/channeltalk-ai/category-prompts.ts` | 카테고리 매핑 변경 → DB 와 정합성 검증 |
| `category_prompts` 테이블 | 즉시 반영 (DB) |
| `consultation_embeddings` 재시드 | embed-* 스크립트 실행 (몇 분 소요) |
| `lib/channeltalk/desk-api.ts` | 채널톡 콘솔 업데이트 시 깨질 수 있음 |
| `auto-close-chat` cron | 채널톡 전용 — backoffice_requests GC 부수 효과 포함 |
| `botName` 변경 | 고객에게 표시되는 상담사명 — 카카오 채널 변경처럼 인지 |

## 트래픽 패턴

- 일반 고객지원 → 평일 9-22시 분산
- 점심·저녁 peak 일부 있음
- 주말도 일정 트래픽 (구독 고객의 수거 일정 문의 등)
- 야간 인입은 자동 종료 cron 이 처리 (closing greeting 후 N분 wait)

## 데이터 백업

- 채널톡 메시지: `scripts/backup-channeltalk.js` (운영팀 수동 실행)
- 우리 DB: Supabase 자동 백업
- 임베딩: 재생성 가능 (학습 데이터로부터)
