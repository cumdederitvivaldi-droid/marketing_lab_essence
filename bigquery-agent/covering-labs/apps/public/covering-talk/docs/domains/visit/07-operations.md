# 07 — 운영 (Cron · 모니터링 · 배포)

> ⚠️ **마이그레이션 안내 (2026-05-13)** — Vercel Cron · Vercel 배포 가정으로 작성됐다. covering-labs 이관 이후 cron 호출 주체·배포 흐름은 후속 PR 에서 갱신. path · 스케줄 · 비즈니스 의미는 그대로 유효.

## Cron (방문수거 관련 7개)

| Path | KST | 영향 | 상세 |
|---|---|---|---|
| `auto-close-chat` | 2분 | conversations status, 채널톡 자동 배차 | [cron.md §1](../../architecture/cron.md#1-auto-close-chat--채널톡방문수거-자동-종료) |
| `auto-nudge` | 매일 10:00 | quote_sent_nudge → 넛지 발송 + status 전환 | [cron.md §7](../../architecture/cron.md#7-auto-nudge--견적-넛지-자동-발송) |
| `auto-payment` | 매일 20:00 | confirmed → payment_requested + 결제 링크 발송 | [cron.md §10](../../architecture/cron.md#10-auto-payment--방문수거-자동-결제-요청) |
| `auto-reminder` | 매일 18:00 | 익일 수거 예정 → 리마인드 메시지 | [cron.md §8](../../architecture/cron.md#8-auto-reminder--익일-리마인드) |
| `daily-sheet-push` | 5분 | orders → Google Sheet 동기화 | [cron.md §2](../../architecture/cron.md#2-daily-sheet-push--방문수거-시트-동기화) |
| `payment-sync` | 10분 | NicePay polling → status 전환 | [cron.md §4](../../architecture/cron.md#4-payment-sync--방문수거-결제-상태-동기화) |
| `tomorrow-pickup-slack` | 매일 18:00 | Slack 익일 브리핑 | [cron.md §9](../../architecture/cron.md#9-tomorrow-pickup-slack--익일-수거-slack-브리핑) |

전체 cron 요약: [`../../architecture/cron.md`](../../architecture/cron.md)

## 배포

### 자동 배포
- main 브랜치 push → Vercel 자동 빌드 + 배포
- 빌드 명령: `npm run build` (Next.js 16)
- 빌드 시간: ~2-3분

### 환경변수 변경
- Vercel 콘솔에서 변경 후 **재배포 필요**
- 영향: 모든 라우트가 새 env 사용

### 롤백
- Vercel 콘솔 Deployments → 이전 배포 → "Promote to Production"
- DB 마이그레이션 영향 있는 변경은 롤백 시 SQL 도 되돌려야 함

### Cron 등록
- `vercel.json` 의 `crons` 배열 — main 푸시 시 자동 반영
- 등록 후 24시간 내 첫 실행 (Vercel 정책)
- 실행 로그: Vercel 콘솔 Functions → 해당 cron 함수

## 모니터링

### 응답시간 / 처리량
- 신규 대시보드 `/new_dashboard` 의 "CS Realtime" 카드
- API: `/api/new_dashboard/cs-realtime` (10초 polling)
- 상담사별 카드 — 답변 수, AI 비율, 응답시간 median, 근무시간

### 에러 추적
- Vercel 콘솔 Functions → 에러 로그
- `console.error` 출력 (operational logging — 188개 시점)
- Sentry 미적용 (도입 검토 가치)

### NicePay 결제 상태
```sql
-- 최근 1시간 결제 진행 추적
SELECT order_number, status, total_price,
       jsonb_array_length(payment_ids) AS req_count,
       (SELECT MAX((entry->>'paidAt')::timestamptz)
        FROM jsonb_array_elements(payment_ids) AS entry
        WHERE entry ? 'paidAt') AS paid_at
FROM orders
WHERE updated_at > NOW() - INTERVAL '1 hour'
  AND status IN ('payment_requested', 'completed')
ORDER BY updated_at DESC LIMIT 50;
```

### 자동결제 cron 결과
```sql
-- auto-payment 가 오늘 보낸 건
SELECT order_number, customer_name, total_price,
       jsonb_array_length(payment_ids) AS reqs,
       payment_ids->-1->>'sentAt' AS last_sent
FROM orders
WHERE date = (NOW() AT TIME ZONE 'Asia/Seoul')::date::text
  AND status = 'payment_requested'
ORDER BY (payment_ids->-1->>'sentAt')::timestamptz DESC;
```

### 해피톡 발송 실패
- send/route.ts 가 InvalidSessionException(-502) 감지 → conversations.status = `closed`
- 로그: `console.error("[send] HappyTalk 발송 실패: ...")`

## 운영 알림

### Slack
- `#수거-내일` 채널 — `cron/tomorrow-pickup-slack` 자동 발송
- 담당자 멘션 자동 (유대현, 김원빈)
- 변경: `MENTION_USERS` 상수 + Slack ID

### 사내 알림 (notifications 테이블)
- 멘션 / 배정 → 30초 polling 으로 상담사에게 표시
- API: `/api/notifications`

## 백업

- Supabase 자동 백업 (PITR — Point-in-Time Recovery)
- 채널톡 백업 도구: `scripts/backup-channeltalk.js` (수동, 운영팀)

## 배포 영향 — 변경 시 주의

| 변경 영역 | 영향 |
|---|---|
| `lib/ai/prompt.ts` / `prompt-blocks.ts` | 즉시 다음 호출부터 새 프롬프트 적용. A/B 없음 |
| `lib/ai/pickup-policy.md` | **빌드 타임 로드** — 빌드 후 배포 필요 |
| `app/api/webhook/message/route.ts` | 메인 webhook — 회귀 위험 큼. Phase 머신 영향 검증 필수 |
| Phase 머신 (`phases.ts`, `phase-transitions.ts`) | 진행 중 conversations 의 phase_history 영향. 기존 세션 호환성 검증 |
| `vercel.json` cron | 등록 변경 시 24시간 내 적용. 시간대 KST↔UTC 환산 주의 |
| `next.config.ts` | 빌드 설정 — 빌드 타임 영향 |
| `middleware.ts` (deprecated) | Next.js 16 proxy 로 마이그레이션 권장 (M1) |

## 트래픽 패턴

- 평일 10-22시 (운영시간) 가 ~95% 트래픽
- 점심 (12-14시) / 저녁 (18-20시) peak
- 주말 / 야간은 자동 응답만 (커바니·자동종료 활성)
