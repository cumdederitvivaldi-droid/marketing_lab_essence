# 04 — API 카탈로그

> 70+ 라우트. 전체 태그 카탈로그는 [`../../api/tags.md`](../../api/tags.md). 본 문서는 도메인 전용 라우트만 그룹별로.

## 채팅 / 메시지 (`/api/conversations/*`)

### 목록·구독
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/conversations` | 세션 목록 (status·필터·검색) |
| GET | `/api/conversations/updates` | SSE — 새 메시지·신규 세션 push |
| GET / PATCH / DELETE | `/api/conversations/[sessionId]` | 단건 CRUD |

### 메타 갱신
| 메서드 | 경로 | 설명 |
|---|---|---|
| PATCH | `/api/conversations/[sessionId]/assignee` | 담당 상담사 변경 |
| PATCH | `/api/conversations/[sessionId]/memo` | 메모 |
| PATCH | `/api/conversations/[sessionId]/name` | 고객명 |
| PATCH | `/api/conversations/[sessionId]/phase` | Phase 강제 변경 (디버그) |
| PATCH | `/api/conversations/[sessionId]/quote` | 견적 데이터 갱신 |
| POST | `/api/conversations/[sessionId]/read` | 읽음 처리 |
| POST | `/api/conversations/[sessionId]/regenerate` | AI draft 재생성 |
| PATCH | `/api/conversations/[sessionId]/requested-date` | 희망 날짜 |
| POST | `/api/conversations/[sessionId]/reset` | 대화 초기화 (디버그) |
| PATCH | `/api/conversations/[sessionId]/status` | status 변경 |

### 발송 (해피톡)
| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| POST | `/api/conversations/[sessionId]/send` | 텍스트 메시지 | CS-EXT-011 |
| POST | `/api/conversations/[sessionId]/send-image` | 이미지 | CS-EXT-012 |
| POST | `/api/conversations/[sessionId]/send-file` | 파일 | CS-EXT-013 |
| POST | `/api/conversations/[sessionId]/send-guide` | 가이드 이미지 (방문수거 안내) | CS-EXT-018 |
| POST | `/api/conversations/[sessionId]/send-abc-slots` | ABC 시간안내 (시간대 선택 슬롯) | — |

모두 InvalidSessionException(`-502`) 자동 감지 → 채팅 자동 종료.

### AI 보조
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/conversations/[sessionId]/polish` | 메시지 말다듬기 (Haiku 톤 보정) |
| POST | `/api/conversations/[sessionId]/extract-items` | v1 품목 추출 (legacy) |
| POST | `/api/conversations/[sessionId]/extract-items-v2` | v2 품목 추출 (Sonnet) |
| GET | `/api/conversations/[sessionId]/assistant-hint` | 커바니 1줄 코칭 + 정책 섹션 |
| GET | `/api/conversations/[sessionId]/draft` | 현재 ai_draft 조회 |

## 주문 (`/api/orders/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/orders` | 목록 / 신규 |
| GET / PATCH / DELETE | `/api/orders/[id]` | 단건 |
| POST | `/api/orders/batch` | 일괄 처리 |
| POST | `/api/orders/[id]/payment` | 결제 링크 발송 (재발송 포함) |
| POST | `/api/orders/[id]/ladder-prepayment` | 사다리차 선결제 — 별도 Order 생성 + NicePay 링크 + 토글 ON 시 부모 totalPrice 차감 |
| POST | `/api/orders/batch-payment` | 일괄 결제 |
| POST | `/api/orders/payment-nudge` | 결제 넛지 (이미지 + 텍스트, 본문에 NicePay 결제 링크 자동 삽입) |

## 견적 (`/api/quote/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/quote/calculate` | 견적 계산 (665줄, 핵심 로직) |

## 웹훅 (`/api/webhook/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/webhook` | sender_key 분기 라우터 (방문 vs 런치) |
| POST | `/api/webhook/message` | 방문수거 메시지 수신 + AI 응답 (1,091줄, 핵심) |
| POST | `/api/webhook/metadata` | 사용자 메타데이터 수신 |
| POST | `/api/webhook/session-end` | 세션 종료 알림 |

## 운영 (배차·기사·차량)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/dispatch` | 배차 목록 / 신규 |
| POST | `/api/dispatch/assign` | 자동 배차 |
| GET | `/api/drivers` | 기사 마스터 |
| GET | `/api/vehicles` | 차량 마스터 |
| GET | `/api/schedule` | 스케줄 (orders + lunch_orders 통합 뷰) |
| GET | `/api/schedule/abc` | ABC 시간안내 슬롯 |
| GET | `/api/schedule/abc/month` | 월별 ABC 케파 |

## 마스터 데이터

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/products/list` | 품목 전체 |
| GET | `/api/products/search` | 검색 (별칭 + 임베딩) |
| GET | `/api/products/siblings` | 그룹 내 형제 품목 |
| POST | `/api/products/ai-lookup` | AI 자연어 → 품목 매칭 |
| GET | `/api/region-prices` | 지역 가격 |
| GET | `/api/ladder-fees` | 사다리차 요금 |
| GET | `/api/service-areas` | 서비스 가능 지역 |
| GET | `/api/policies/pickup` | 정책 원문 (PolicyModal 용) |

## 세금계산서 (방문)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/invoices` | 발행 이력 / 발행 |
| POST | `/api/invoices/issue` | 단건 발행 |
| GET | `/api/invoices/[id]` | 단건 조회 |
| POST | `/api/invoices/[id]/cancel` | 발행 취소 |

## 외부 연동

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/dhero/deliveries` | 두발히어로 배송 목록·신규 |
| POST | `/api/dhero/deliveries/create` | 배송 등록 |
| GET | `/api/download-image` | CDN 이미지 프록시 |
| POST | `/api/address/normalize` | Kakao Local 주소 정규화 (양 시스템 공유) |

## Cron

| 경로 | KST | 설명 | 코드 |
|---|---|---|---|
| `/api/cron/auto-close-chat` | 2분 | 자동 종료 + 채널톡 자동 배차 | CS-CRON-001 |
| `/api/cron/auto-nudge` | 10:00 | 견적 후 넛지 | CS-NTF-014 |
| `/api/cron/auto-payment` | 20:00 | 당일 confirmed → 결제 링크 | CS-ETC-027 |
| `/api/cron/auto-reminder` | 18:00 | 익일 수거 리마인드 | CS-NTF-013 |
| `/api/cron/daily-sheet-push` | 5분 | Google Sheet 동기화 | CS-CRON-002 |
| `/api/cron/payment-sync` | 10분 | NicePay 상태 polling | CS-ETC-025 |
| `/api/cron/tomorrow-pickup-slack` | 18:00 | Slack 익일 브리핑 | CS-CRON-004 |

자세히는 [`../../architecture/cron.md`](../../architecture/cron.md).

## Legacy 대시보드 (방문 통계)

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `/api/dashboard/stats` | 일별 통계 |
| GET | `/api/dashboard/monthly` | 월별 통계 |
| GET | `/api/dashboard/analytics` | 운영 분석 |
| GET | `/api/dashboard/analytics/export` | CSV 내보내기 |
| GET | `/api/dashboard/abc-funnel` | ABC 시간안내 발송 → 예약 funnel |

→ 신규 대시보드 (`/api/new_dashboard/*`) 와 별개. 통합·폐기 검토 가능.

## Tag 보강

코드의 `// [CS-XXX-NNN]` 주석과 [`../../api/tags.md`](../../api/tags.md) 동기화 유지. 신규 라우트 추가 시 카테고리 마지막 번호 +1.
