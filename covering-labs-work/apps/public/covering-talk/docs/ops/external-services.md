# 외부 서비스 (External Services)

> 11개 외부 서비스 — 콘솔 URL · 자격증명 위치 · 로테이션 주기 · 장애 대응 통합.
> 도메인별 06-integrations.md 도 참조.

## 서비스 매트릭스

| # | 서비스 | 우리가 호출 | 푸시 받음 | 도메인 | env |
|---|---|---|---|---|---|
| 1 | 해피톡 (방문 채널) | ✓ | ✓ webhook | 방문 | `HT_*`, `SENDER_KEY` |
| 2 | 해피톡 (런치 채널) | ✓ | ✓ webhook | 런치 | `LUNCH_HT_*`, `LUNCH_SENDER_KEY` |
| 3 | 채널톡 Open API | ✓ | ✗ (폴링) | 채널톡 | `CHANNELTALK_ACCESS_*` |
| 4 | 채널톡 Desk API | ✓ | ✗ | 채널톡 | `CHANNELTALK_DESK_COOKIE` |
| 5 | NicePay | ✓ | ✗ (폴링) | 방문 + 런치 | `NICEPAY_*` |
| 6 | Bolta (세금계산서) | ✓ | ✗ | 런치 | `BOLTA_*` |
| 7 | Dhero (배송) | ✓ | ✗ | 방문 | `DHERO_*` |
| 8 | Google Sheets | ✓ | ✗ | 방문 + 런치 | `GOOGLE_*` |
| 9 | Google OAuth | ✓ | ✓ callback | 공유 | `GOOGLE_CLIENT_*` |
| 10 | Anthropic | ✓ | ✗ | 모든 AI | `ANTHROPIC_API_KEY` |
| 11 | Voyage AI | ✓ | ✗ | 채널톡 RAG | `VOYAGE_AI_API_KEY` |
| 12 | Slack | ✓ | ✗ | 방문 (브리핑) | `SLACK_*` |
| 13 | Kakao Local | ✓ | ✗ | 방문 + 런치 + 채널톡 | `KAKAO_REST_API_KEY` |
| 14 | Covering 외부 Supabase | ✓ | ✗ | 방문 (sync) | `COVERING_SUPABASE_*` |

---

## 1. 해피톡 (방문 채널)

| 항목 | 값 |
|---|---|
| 콘솔 | (운영팀 보유) |
| 자격증명 위치 | Vercel env `HT_CLIENT_ID`, `HT_CLIENT_SECRET`, `SENDER_KEY` |
| 권장 로테이션 | 6개월 |
| 메인 사용 | `lib/happytalk/client.ts` |

**장애 대응**:
- 발송 실패 (인증 에러) → env 만료 → 콘솔 재발급
- InvalidSession (-502) → 자동 conversations.status = `closed` (코드 자체 처리)
- 콘솔 다운 → 인입 멈춤 (드물게)

---

## 2. 해피톡 (런치 채널)

| 항목 | 값 |
|---|---|
| 자격증명 위치 | Vercel env `LUNCH_HT_*`, `LUNCH_SENDER_KEY` |
| 권장 로테이션 | 6개월 (방문과 동기화) |
| 메인 사용 | `lib/happytalk/lunch-client.ts` |
| 운영 시작 | 2026-04-17 |

방문수거와 같은 클라이언트 자격증명이지만 다른 채널 (sender_key).

---

## 3. 채널톡 Open API

| 항목 | 값 |
|---|---|
| 콘솔 | https://desk.channel.io (운영팀 보유) |
| Base URL | `https://api.channel.io` |
| 채널 ID | `64368` (모든 버림은, 커버링) |
| 인증 | `x-access-key` + `x-access-secret` 헤더 |
| 자격증명 | Vercel env `CHANNELTALK_ACCESS_KEY`, `_ACCESS_SECRET`, `APP_ID`, `APP_SECRET` |
| 권장 로테이션 | 변경 없음 (노출 시만) |
| 메인 사용 | `lib/channeltalk/client.ts` (`ctFetch`) |

**Rate limit**: 초당 너무 많은 호출 시 429. 우리는 10초 폴링 → 부하 낮음.

**장애**:
- 429 발생 → 폴링 빈도 줄이기
- 401/403 → 키 만료 / 권한 변경

---

## 4. 채널톡 Desk API

| 항목 | 값 |
|---|---|
| 콘솔 | https://desk.channel.io (운영팀 보유) |
| 인증 | 쿠키 기반 (`CHANNELTALK_DESK_COOKIE`) |
| 권장 로테이션 | **30일 (필수)** |
| 메인 사용 | `lib/channeltalk/desk-api.ts` |

**쿠키 갱신 절차**:
1. desk.channel.io 운영자 계정으로 로그인
2. DevTools → Application → Cookies → 모든 값 복사
3. Vercel env `CHANNELTALK_DESK_COOKIE` 갱신 (전체 cookie 문자열)
4. 재배포

**위험**: 비공식 API → 채널톡 콘솔 업데이트 시 깨질 수 있음. 깨지면 `lib/channeltalk/desk-api.ts` 의 endpoint URL 갱신.

---

## 5. NicePay

| 항목 | 값 |
|---|---|
| 콘솔 | NicePay 사업자 페이지 (운영팀) |
| 자격증명 | Vercel env `NICEPAY_MID`, `_MERCHANT_KEY`, `_USR_ID` |
| 권장 로테이션 | 변경 없음 (계약 변경 시만) |
| 메인 사용 | `lib/nicepay/client.ts` (방문 + 런치 공유) |

**중요**: NicePay → 우리 서버 webhook **없음**. 우리가 polling (`cron/payment-sync` 10분, `cron/lunch-payment-sync` 10분).

**장애**:
- 결제 링크 생성 실패 → API 한도 / 인증 에러
- polling 결과 stale → NicePay 응답 지연 가능 (재시도)

---

## 6. Bolta (세금계산서)

| 항목 | 값 |
|---|---|
| 콘솔 | Bolta 콘솔 (운영팀 보유) |
| 자격증명 | Vercel env `BOLTA_API_KEY`, `_CUSTOMER_KEY`, `_SUPPLIER_*` |
| 권장 로테이션 | 6개월 |
| 메인 사용 | `lib/bolta/client.ts` (런치 전용) |
| API 스펙 | `/Users/wonbinkim/Desktop/chatingbot/볼타 API.json` |

**장애**:
- 사업자번호 검증 실패 → 벤더 정보 (`lunch_vendors.business_number`) 재확인
- 발행 실패 → `lunch_invoices.error_message` 확인
- 발행 후 status pending 지속 → Bolta 사이드 처리 지연 (최대 1일 대기)

---

## 7. Dhero (두발히어로)

| 항목 | 값 |
|---|---|
| 콘솔 | 두발히어로 콘솔 (운영팀) |
| 자격증명 | Vercel env `DHERO_API_URL`, `_TOKEN`, `_SPOT_CODE` |
| 권장 로테이션 | 6개월 |
| 메인 사용 | `lib/dhero/client.ts` (방문 전용) |
| 캐시 | `dhero_deliveries` 테이블 |

**장애**: 두발히어로 운영팀 문의.

---

## 8. Google Sheets

| 항목 | 값 |
|---|---|
| 콘솔 | https://console.cloud.google.com (운영팀 보유) |
| Sheet ID | `1Y8ztdzT-Y08-XOkKSX-jryLJFT4r1ID4nuzRcN9ddTU` |
| 자격증명 | Service Account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`) |
| 권장 로테이션 | 키 노출 시만 |
| 메인 사용 | `cron/daily-sheet-push`, `cron/lunch-sheet-push`, `lib/google/sheets.ts` |

**장애**:
- 시트 권한 변경 시 → Service Account 가 시트에 편집 권한 있는지 확인
- API 한도 → 보통 안 걸림 (일별 제한 큼)

**운영 폐기 예정**: 추후 폐기. 현재는 운영상 유지.

---

## 9. Google OAuth (로그인)

| 항목 | 값 |
|---|---|
| 콘솔 | https://console.cloud.google.com OAuth client |
| 자격증명 | Vercel env `GOOGLE_CLIENT_ID`, `_CLIENT_SECRET` |
| 권장 로테이션 | 변경 없음 |
| 메인 사용 | `app/api/auth/google/route.ts` |

**Redirect URI**: Vercel deployment URL (Production / Preview 별로 등록).

---

## 10. Anthropic

| 항목 | 값 |
|---|---|
| 콘솔 | https://console.anthropic.com |
| 자격증명 | Vercel env `ANTHROPIC_API_KEY` |
| 권장 로테이션 | 변경 없음 (노출 시만) |
| 메인 사용 | `lib/ai/claude.ts` (공유) |

**모델**:
- `claude-sonnet-4-6` — 방문 응답 / 런치 응답 / 채널톡 분류·생성 / 대시보드 인사이트
- `claude-haiku-4-5-20251001` — 채널톡 톤 보정 / 대시보드 분류 / 커바니

**비용 모니터링**: Anthropic 콘솔 일일 사용량.

**장애**:
- 한도 초과 → 모든 AI 멈춤. 한도 상향 또는 캐시 hit률 개선
- 응답 지연 → 클라이언트 timeout 처리 (각 라우트의 maxDuration)

---

## 11. Voyage AI

| 항목 | 값 |
|---|---|
| 콘솔 | https://www.voyageai.com |
| 자격증명 | Vercel env `VOYAGE_AI_API_KEY` |
| 권장 로테이션 | 변경 없음 |
| 메인 사용 | `lib/ai/voyage.ts` |
| 모델 | `voyage-2` (한국어 강세) |

**비용**: 매우 저렴 (1K 토큰 당 $0.00012 정도).

**장애**: Anthropic 과 별개. 다운 시 채널톡 RAG 만 fallback (빈 결과).

---

## 12. Slack

| 항목 | 값 |
|---|---|
| 콘솔 | https://api.slack.com/apps |
| 자격증명 | Vercel env `SLACK_BOT_TOKEN` (xoxb-...), `SLACK_PICKUP_CHANNEL_ID` |
| 권장 로테이션 | 1년 |
| 메인 사용 | `cron/tomorrow-pickup-slack` (방문 익일 브리핑만) |

**채널 ID**: fallback `C0AENH7JW2Y` (코드 하드코딩).

---

## 13. Kakao Local

| 항목 | 값 |
|---|---|
| 콘솔 | https://developers.kakao.com |
| 자격증명 | Vercel env `KAKAO_REST_API_KEY` |
| 권장 로테이션 | 변경 없음 |
| 메인 사용 | `lib/kakao/local.ts` (양 시스템 공유) |

**용도**: 주소 텍스트 → 시·구·동·lat/lng 정규화.

---

## 14. Covering 외부 Supabase

| 항목 | 값 |
|---|---|
| 인증 | Vercel env `COVERING_SUPABASE_URL`, `_KEY` |
| 권장 로테이션 | 변경 시만 |
| 메인 사용 | `lib/covering/client.ts:sendToCovering` |

**현재 활성**: 방문수거 답변 발송 시 외부 `bookings` 테이블에 단방향 INSERT.

**비우면**: throw — 방문수거 send 자체 실패. 비활성화하려면 `sendToCovering` 호출처 (send/route.ts:187, 346) 도 같이 수정.

**2026-04-27**: dead chain 6 라우트 + 미사용 함수 8개 정리 완료.

---

## 백오피스 스크래퍼 (외부 머신, 사내 도구)

| 항목 | 값 |
|---|---|
| 위치 | 별도 머신 (운영팀 노트북 또는 서버) |
| 코드 | `scripts/backoffice-scraper/` |
| 자격증명 | admin.covering.app 계정 (스크래퍼가 보유) |
| 권장 로테이션 | 6개월 또는 노출 시 |
| 통신 | Supabase Realtime (`backoffice_requests` 테이블) |

자세히는 [`../domains/channeltalk/06-integrations.md`](../domains/channeltalk/06-integrations.md).

---

## 응급 차단 절차 (서비스별 셧다운)

| 서비스 | 차단 방법 | 영향 |
|---|---|---|
| 해피톡 (방문) | env 비우기 → 재배포 | 방문 발송 멈춤 |
| 채널톡 | env 비우기 | 채널톡 페이지 fail |
| NicePay | env 비우기 | 결제 발송 fail |
| Bolta | env 비우기 | 세금계산서만 fail |
| Anthropic | env 비우기 | 모든 AI 멈춤 |
| Sheets | service account revoke | cron sheet-push fail (운영 영향 적음) |
| Slack | bot token revoke | 익일 브리핑만 |
| Covering | env 비우기 | 방문 send 시 throw (전체 fail!) ⚠ |

비상 시: env 비우기 + 재배포 (Vercel 콘솔에서 즉시 가능).

## 자격증명 노출 시 대응 절차

자세히는 [`environment.md`](environment.md). 핵심:

1. 즉시 회전 (해당 서비스 콘솔)
2. Vercel env 갱신 + 재배포
3. git history 검사
4. 영향 범위 / 손실 평가
5. 운영팀 / CEO 알림 (영향 큰 경우)
