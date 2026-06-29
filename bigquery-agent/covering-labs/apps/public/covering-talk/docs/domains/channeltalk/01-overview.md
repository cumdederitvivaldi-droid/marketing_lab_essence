# 01 — Overview

## 한 줄

채널톡 플랫폼 기반 일반 고객지원. 80L/220L 봉투 구독·배송·정책 질의 등 **84+ 카테고리** 의 다양한 인입을 AI 가 분류·추천하고 상담사가 발송. 메시지·세션은 채널톡 플랫폼 소유 — 우리 DB 저장 없음.

## 비즈니스 컨텍스트

- 서비스: 커버링 일반 수거 (80L / 220L 봉투, 일회성 또는 구독)
- 채널: 채널톡 (channel.io) — 카카오 상담톡(해피톡) 과 다른 플랫폼
- 인입 패턴: 매우 다양 (84개 카테고리)
  - 서비스이용 (배출품목·수거방법·시간 등)
  - 구독 (가입·해지·변경)
  - 배송 (수거·운송 일정)
  - 결제·환불·쿠폰
  - 정책·약관
  - 기타 (잘못 들어옴 등)
- 응대 방식:
  - AI 가 답변 추천 (Sonnet 분류 + RAG + 생성 + Haiku 톤)
  - 상담사가 검토 후 발송 (또는 직접 작성)
  - 채택 시 `채널톡_reply_logs` 에 분류 기록

## 해피톡(방문수거) vs 채널톡 비교

| | 해피톡 (방문수거 / 런치) | 채널톡 (일반 수거) |
|---|---|---|
| 문의 유형 | 1개 카테고리 (방문 / 런치) | **84+ 카테고리** |
| AI 방식 | Phase 상태머신 (9 / 4단계) | 분류 + RAG + 생성 + 톤 4단계 파이프라인 |
| 답변 생성 | AI 자유 생성 | RAG 인용 + 자유 생성 hybrid |
| DB 저장 | conversations / messages 테이블 | **없음** (분류 카운트만) |
| 위치 | `/conversations` `/lunch` | `/channeltalk` |
| API | 해피톡 카카오 | 채널톡 Open API + Desk API |
| Webhook | ✓ (메시지 push) | ✗ (클라이언트 폴링) |
| 자동 종료 | conversations.status 업데이트 | `auto-close-chat` cron 이 채널톡 closeChat API 호출 |

## 고객 → 답변 시나리오

1. 고객이 채널톡으로 메시지 (예: "150L 봉투는 220L 으로 바뀐 건가요?")
2. **클라이언트 폴링** — `/channeltalk` 페이지가 채널톡 Open API 로 10초마다 chats 조회
3. AI 자동 분류 (Sonnet) — 카테고리 결정 (예: `정책_봉투규격변경`)
4. **RAG 병렬 로드** (Voyage 임베딩):
   - 정책 문서 매칭 섹션
   - 매크로 후보 (macro_embeddings 172건)
   - 과거 Q&A (consultation_embeddings)
5. **답변 생성** (Sonnet) — 카테고리별 prompt_rules + RAG 결과로 답변 작성
6. **톤 다듬기** (Haiku, 선택) — 친근한 톤 보정
7. SuggestPanel 에 표시 → 상담사 검토
8. 상담사가 발송 (채택 / 일부 수정 / 직접 작성)
9. `channeltalk_reply_logs` INSERT (chat_id + manager_name + reply_kind + draft_char_overlap)
10. `auto-close-chat` cron 이 회신 없는 상담 자동 종료

## 백오피스 스크래퍼 통합

채널톡 메시지 응대 중 고객 정보·과거 주문 조회가 필요할 때:
- 별도 머신에서 Puppeteer 스크래퍼가 `admin.covering.app` 로그인 + 데이터 추출
- `app/api/backoffice/lookup` POST 호출 → `backoffice_requests` INSERT (status: pending)
- 스크래퍼가 Supabase Realtime 으로 polling → 처리 → result 채움
- 클라이언트가 polling 으로 결과 수신
- 24시간 캐시 (`backoffice_cache`) 로 같은 phone 재조회 즉시 반환

**스크래퍼는 별도 머신** — 그 머신 다운 시 채널톡 응대에 영향. circuit breaker 클라이언트 측 (3회 실패 → 5분 skip).

## AI 응대 통계

상담사가 답변 발송 시 자동 분류:
- **`ai_auto`** — AI 추천 그대로 채택 (overlap ≥ 1.0)
- **`ai_assist`** — AI 추천 일부 수정 (overlap ≥ 0.6)
- **`human`** — 직접 작성 / 매크로 (overlap < 0.6)

저장: `channeltalk_reply_logs` 테이블 (메시지 본문은 저장 안 함).

## 핵심 KPI

| KPI | 정의 | 출처 |
|---|---|---|
| AI 채택률 | (ai_auto + ai_assist) / total | `/api/new_dashboard/cs-realtime` |
| 분류 정확도 | 카테고리 분류 후 사후 수정률 | (수동 검증) |
| 백오피스 가용성 | backoffice_requests completed / total | 본 도메인 08 SQL |
| 평균 응답시간 | 채널톡 cases API 의 응답시간 | 채널톡 콘솔 (자체 메트릭 없음) |

## 도메인 경계

- **포함**: backoffice_requests, backoffice_cache, channeltalk_reply_logs, category_prompts (+ 임베딩)
- **제외**: 방문수거 / 런치 — 절대 import 금지
- **공유**: macros, consultation_tags (방문/런치도 사용 가능), audit_logs, app_settings
- **외부**: 채널톡 Open API + Desk API (메시지·세션 진본), Voyage AI (임베딩)

## 신규 개발자 첫 진입점

| 알고 싶은 것 | 시작 파일 |
|---|---|
| AI 추천이 어떻게 동작 | `lib/channeltalk-ai/suggest.ts` |
| 카테고리 분류 | `lib/channeltalk-ai/normalize.ts` + `category-prompts.ts` |
| 채널톡 API 호출 | `lib/channeltalk/client.ts` (`ctFetch`) |
| 메시지 발송 | `lib/channeltalk/client.ts:sendMessage` |
| 자동 종료 | `app/api/cron/auto-close-chat/route.ts` |
| 백오피스 스크래퍼 | `app/api/backoffice/lookup/route.ts` + `scripts/backoffice-scraper/` |
| AI 학습 데이터 | `tools/channeltalk-ai/` (신규 위치) |
