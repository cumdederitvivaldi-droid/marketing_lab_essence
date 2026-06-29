# 배포 (Deployment)

> ⚠️ **마이그레이션 안내 (2026-05-13)** — 본문 전반이 Vercel 가정. covering-labs 이관 이후 배포 흐름은 `apps/public/covering-talk/README.md` 의 "배포" 섹션 참조. 이 파일의 Vercel 콘솔·환경변수 그룹·롤백 절차 본문은 후속 PR 에서 covering-labs GitHub Actions 기준으로 재작성 예정. Supabase 마이그레이션 부분은 그대로 유효.

> Vercel 자동 배포 + Supabase 마이그레이션. 코드는 main 푸시면 끝, DB 는 별도.

## 자동 배포

- main 브랜치 push → Vercel 자동 빌드 + 배포
- 빌드 명령: `npm run build` (Next.js 16)
- 빌드 시간: 2~3분
- Preview 배포: feature 브랜치 push 시 자동 (Vercel 콘솔에 PR 별 URL)

## 환경변수 변경

1. Vercel 콘솔 → Project → Settings → Environment Variables
2. 변경 후 **재배포 필수** (기존 deployment 는 옛 env 유지)
3. Production / Preview / Development 환경 분리 가능
4. 시크릿은 Production 만 — Preview 에는 dummy 또는 testing 키 사용 권장

자세한 키 목록: [`environment.md`](environment.md).

## 롤백

### 코드 롤백
- Vercel 콘솔 → Deployments → 안정적인 이전 배포 → "Promote to Production"
- 즉시 전환 (수십초 내)

### DB 롤백
- 마이그레이션 영향 있는 변경은 코드 롤백만으로 부족
- 직접 SQL 로 reverse 처리 (DOWN migration 자동화 안 됨)
- 가능한 모든 마이그레이션은 forward-only 로 작성하고 데이터 손실 안 나게 설계

### Cron 롤백
- `vercel.json` 변경 후 푸시 → 자동 반영 (24시간 내)
- 즉시 비활성화 필요 시: Vercel 콘솔 → Functions → 해당 cron → Disable

## DB 마이그레이션 절차

1. `migrations/NNN_xxx.sql` 파일 추가 (번호는 마지막+1)
2. Supabase Studio (https://supabase.com/dashboard) 또는 CLI 로 적용
   - Studio: SQL Editor 에 붙여넣고 Run
   - CLI: `supabase db push` (CLI 셋업 시)
3. 적용 확인 (`SELECT COUNT(*) FROM <new_table>` 류)
4. 코드 측 변경 푸시 (테이블 사용)
5. 운영 시작 후 30분 모니터링 (Vercel Functions 로그)

순서 주의:
- 신규 테이블 추가 → DB 먼저, 그 다음 코드 (코드가 없는 테이블 read 시도하면 throw)
- 컬럼 추가 → DB 먼저, 코드 나중 (NOT NULL + DEFAULT 가드)
- 컬럼 제거 → 코드 먼저 (안 쓰는 상태로), DB 나중
- 테이블 제거 → 코드 먼저, 한참 운영 후 DB DROP

## Cron 등록 / 변경

- `vercel.json` 의 `crons` 배열 — main 푸시 시 자동 반영
- 등록 후 첫 실행: 24시간 이내 (Vercel 정책)
- 시간대: **UTC 기준 입력**, KST 환산 신중
  - KST 10:00 = UTC 01:00 (`0 1 * * *`)
  - KST 18:00 = UTC 09:00 (`0 9 * * *`)
  - KST 20:00 = UTC 11:00 (`0 11 * * *`)
- 로그: Vercel Functions → 해당 cron 함수
- maxDuration 60s 한도 — 초과 가능성 있으면 페이징 또는 분리

자세히는 [`../architecture/cron.md`](../architecture/cron.md).

## 빌드 타임 vs 런타임 영향

| 변경 영역 | 즉시 반영 | 빌드 필요 |
|---|---|---|
| `app/api/**/route.ts` | (재배포 후 즉시) | ✓ |
| `lib/ai/prompt.ts` 등 | (재배포 후 즉시) | ✓ |
| `lib/ai/pickup-policy.md` | — | ✓ **빌드 타임 로드** |
| `lib/ai/lunch-policy.md` | — | ✓ **빌드 타임 로드** |
| `category_prompts` 테이블 | ✓ (다음 호출부터) | ✗ |
| `app_settings` 테이블 | ✓ (다음 호출부터) | ✗ |
| `dashboard_settings` 테이블 | ✓ (다음 호출부터) | ✗ |
| `vercel.json` (cron) | (~24h) | ✓ (푸시 필요) |
| `next.config.ts` | — | ✓ |

## 외부 서비스 영향 사전 체크

배포 전 영향받는 외부 콘솔:

| 변경 | 영향 |
|---|---|
| `/api/webhook/*` 경로 변경 | 해피톡 콘솔 webhook URL 갱신 필요 |
| `/api/orders/[id]/payment` 같은 결제 라우트 | NicePay 는 우리가 polling — 영향 없음 |
| `cron/*` 신규/변경 | Vercel 자동 |
| 채널톡 native function URL | 채널톡 콘솔 갱신 필요 |
| Slack 채널 ID / 봇 토큰 | Slack 앱 설정 |
| Bolta API endpoint | Bolta 사이드 변경 시 |

자세히는 도메인별 06-integrations.md.

## 모니터링

### 배포 직후
- [ ] Vercel 콘솔 → Deployments → 최신 build 성공 확인
- [ ] Functions → 최근 5분 에러 없음
- [ ] 핵심 페이지 1번씩 열기 (`/conversations`, `/lunch`, `/channeltalk`, `/new_dashboard`)
- [ ] Cron 변경 시: 다음 실행 시간 확인

### 운영 중
- Vercel Logs (실시간 stream)
- Supabase Logs (SQL 에러)
- Anthropic / Voyage / Bolta / Slack 콘솔 (한도·에러)

## 비상 절차

### 즉시 롤백
1. Vercel 콘솔 → 이전 안정 deployment → Promote
2. 30초 내 전환

### 부분 비활성화
- Cron 1개만 비활성: Vercel Functions → Disable
- API 1개만 비활성: 코드에서 `return 503` 하드코딩 후 푸시 (1분 내)

### DB 회복
- Supabase 자동 백업 (PITR — Point-in-Time Recovery)
- 콘솔에서 시점 지정 복원 (몇 분 소요)

### 외부 시스템 다운
- 해피톡 다운: webhook 인입 멈춤. 우리 시스템 자체는 정상
- 채널톡 다운: `/channeltalk` 페이지 빈 상태
- NicePay 다운: 자동결제 cron 실패 → 다음 cycle 재시도
- Anthropic 다운: AI 추천 / 인사이트 / 분류 멈춤. 상담사 직접 답변으로 우회

## 배포 체크리스트 (큰 변경 시)

- [ ] DB 마이그레이션 SQL 검증 (rollback 가능한가)
- [ ] 빌드 통과 (`npm run build`)
- [ ] 영향받는 라우트 grep + 테스트
- [ ] 환경변수 추가/변경 시 Vercel 콘솔 갱신
- [ ] 외부 콘솔 (해피톡/채널톡/Slack) URL 변경 필요한가
- [ ] cron 영향 (시간 / 빈도) 검토
- [ ] 운영팀에게 사전 공유 (UI 변경, 새 KPI 등)
- [ ] 배포 후 30분 모니터링 (Vercel + Supabase 로그)
- [ ] 핵심 도메인 페이지 1번씩 열어보기
- [ ] 새 부채 발견 시 PR / 이슈로 추적
