# 환경변수 (Environment)

> 47개 키. 시스템별 접두사로 구분. `.env.local.example` 가 정본.

## 빠른 매트릭스

| 그룹 | 접두사 | 도메인 | 비고 |
|---|---|---|---|
| 해피톡 (방문) | `HT_*`, `SENDER_KEY` | 방문수거 | 해피톡 콘솔 |
| 해피톡 (런치) | `LUNCH_HT_*`, `LUNCH_SENDER_KEY` | 런치 | 같은 자격증명, 다른 sender_key |
| 채널톡 | `CHANNELTALK_*` | 채널톡 | Open API + Desk Cookie 30일 |
| 백오피스 (사내) | (스크래퍼 머신 보유) | 채널톡 | `admin.covering.app` 자격 |
| Supabase | `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*` | 공유 | 우리 자체 인스턴스 |
| Covering 외부 Supabase | `COVERING_SUPABASE_*` | 방문 | 단방향 동기화 (sendToCovering) |
| Anthropic | `ANTHROPIC_API_KEY` | 모든 AI | Sonnet + Haiku |
| Voyage AI | `VOYAGE_AI_API_KEY` | 채널톡 RAG | 임베딩 |
| OpenAI | `OPENAI_API_KEY` | (provider 전환 시) | app_settings.ai_provider |
| NicePay | `NICEPAY_*` | 방문 + 런치 | 양 시스템 공유 |
| Bolta | `BOLTA_*` | 런치 | 세금계산서 |
| Dhero | `DHERO_*` | 방문 | 두발히어로 배송 |
| Google Sheets | `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_*`, `GOOGLE_PRIVATE_KEY` | 방문 + 런치 | 시트 동기화 |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 공유 | 로그인 |
| Slack | `SLACK_BOT_TOKEN`, `SLACK_PICKUP_CHANNEL_ID` | 방문 | 익일 브리핑 |
| Kakao Local | `KAKAO_REST_API_KEY` | 방문 + 런치 + 채널톡 | 주소 정규화 |
| Auth | `JWT_SECRET` | 공유 | JWT 서명 |

## 키 목록 (그룹별 상세)

### 해피톡 — 방문수거
```
HT_CLIENT_ID            방문수거 채널 클라이언트 ID
HT_CLIENT_SECRET        방문수거 클라이언트 시크릿
SENDER_KEY              방문수거 카카오 채널 sender key
HAPPYTALK_API_HOST      해피톡 API 호스트 (선택)
```

### 해피톡 — 런치
```
LUNCH_HT_CLIENT_ID      = HT_CLIENT_ID 와 동일 값 (같은 자격증명)
LUNCH_HT_CLIENT_SECRET  = HT_CLIENT_SECRET 와 동일
LUNCH_SENDER_KEY        런치 전용 sender key (다른 값 — 별도 채널)
LUNCH_HAPPYTALK_API_HOST 선택
```

2026-04-17 부 런치 별도 채널 운영 시작.

### 채널톡
```
CHANNELTALK_APP_ID         Native Functions
CHANNELTALK_APP_SECRET     앱 시크릿
CHANNELTALK_ACCESS_KEY     Open API
CHANNELTALK_ACCESS_SECRET  Open API
CHANNELTALK_DESK_COOKIE    Desk API (메시지 삭제) — **30일 로테이션 필수**
```

### Supabase (자체 인스턴스 1개)
```
SUPABASE_URL                       서버 측
SUPABASE_ANON_KEY                  익명 키
SUPABASE_SERVICE_ROLE_KEY          서버 측 service role (RLS 우회)
NEXT_PUBLIC_SUPABASE_URL           브라우저 측 (lib/supabase/browser.ts)
NEXT_PUBLIC_SUPABASE_ANON_KEY      브라우저 측 익명
```

### Covering 외부 Supabase (단방향 sync)
```
COVERING_SUPABASE_URL              외부 Supabase
COVERING_SUPABASE_KEY              service role 키
```

비우면 `lib/covering/client.ts:sendToCovering` 가 throw — 방문수거 send 시 에러.

### Anthropic
```
ANTHROPIC_API_KEY        Sonnet + Haiku 양쪽 사용
```

런타임 provider 전환은 `app_settings.ai_provider` (anthropic / openai).

### OpenAI (선택, provider 전환 시)
```
OPENAI_API_KEY
```

### Voyage AI
```
VOYAGE_AI_API_KEY        모델 voyage-2 (한국어 강세)
```

### NicePay
```
NICEPAY_MID              가맹점 MID
NICEPAY_MERCHANT_KEY     머천트 키
NICEPAY_USR_ID           USER ID
```

### Bolta (세금계산서)
```
BOLTA_API_KEY            API 키
BOLTA_CUSTOMER_KEY       Bolta 고객 키 (우리 = 공급자)
BOLTA_SUPPLIER_*         공급자 (커버링) 정보 (이름·사업자번호·주소 등)
```

API 스펙 파일: `/Users/wonbinkim/Desktop/chatingbot/볼타 API.json` (사용자 메모).

### Dhero (두발히어로)
```
DHERO_API_URL            API 엔드포인트
DHERO_TOKEN              인증 토큰
DHERO_SPOT_CODE          spot 코드
```

### Google Sheets
```
GOOGLE_SHEET_ID                    Sheet ID (양 시스템 공유)
GOOGLE_SHEET_GID                   특정 탭 GID (선택)
GOOGLE_SERVICE_ACCOUNT_EMAIL       service account 이메일
GOOGLE_PRIVATE_KEY                 service account private key (multiline)
```

Sheet ID: `1Y8ztdzT-Y08-XOkKSX-jryLJFT4r1ID4nuzRcN9ddTU`.

### Google OAuth (로그인)
```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

### Slack
```
SLACK_BOT_TOKEN            xoxb-... 봇 토큰
SLACK_PICKUP_CHANNEL_ID    fallback `C0AENH7JW2Y`
```

### Kakao Local
```
KAKAO_REST_API_KEY         REST API 키
```

### Auth
```
JWT_SECRET                 JWT 서명용 (강력한 랜덤)
```

## 새 환경변수 추가 절차

1. `.env.local.example` 에 키 + 빈 값 추가
2. 본 문서의 적절한 그룹에 row 추가
3. 코드에서 `process.env.<KEY>` 사용
4. Vercel 콘솔에 Production / Preview / Development 별로 입력
5. 재배포

## 변경 시 영향

| 변경 | 영향 |
|---|---|
| 해피톡 `HT_*` | 방문수거 발송 즉시 영향 |
| 해피톡 `LUNCH_*` | 런치 발송 즉시 영향 |
| 채널톡 `*_ACCESS_*` | 채널톡 메시지 인입/발송 즉시 영향 |
| `CHANNELTALK_DESK_COOKIE` | 메시지 삭제만 (Open API 와 별개) |
| `SUPABASE_*` | 모든 도메인 다운 (DB 접근 불가) |
| `COVERING_SUPABASE_*` | 방문 send 시 throw (외부 동기화 끊김) |
| `ANTHROPIC_API_KEY` | 모든 AI 멈춤 (대시보드 인사이트·분류 / 채널톡 추천 / 방문·런치 답변) |
| `VOYAGE_AI_API_KEY` | 채널톡 RAG 만 영향 (임베딩 못 만들면 매크로 검색 안 됨) |
| `NICEPAY_*` | 결제 링크 생성 / polling 모두 실패 |
| `BOLTA_*` | 런치 세금계산서 발행만 |
| `DHERO_*` | 방문수거 일부 배송 |
| `GOOGLE_*` | 시트 동기화 cron / OAuth 로그인 |
| `SLACK_*` | 익일 브리핑만 |
| `KAKAO_REST_API_KEY` | 주소 정규화 (없어도 fallback) |
| `JWT_SECRET` | 모든 인증 무효화 — 변경 시 모든 사용자 재로그인 필요 |

## 시크릿 노출 시 대응

1. 해당 키 즉시 회전 (해당 서비스 콘솔)
2. Vercel env 갱신 + 재배포
3. git history 검사 (혹시 commit 됐는지) — 있으면 `git filter-repo` 등
4. 영향 범위 평가 (해당 시스템 결제 / DB / 외부 서비스)
5. 운영팀 알림

## 로컬 개발 (참고)

```
1. .env.local.example 복사 → .env.local
2. 운영팀에서 dev 용 자격증명 받기 (Anthropic / Voyage / Supabase 는 본인 키 권장)
3. npm install
4. npm run dev
5. http://localhost:3000
```

## .env.local.example 와 동기화

본 문서가 stale 한지 검증:
```bash
# .env.local.example 의 키 목록
grep -o "^[A-Z_]*=" .env.local.example | sort -u

# 본 문서에 언급 안 된 키가 있는지
```
