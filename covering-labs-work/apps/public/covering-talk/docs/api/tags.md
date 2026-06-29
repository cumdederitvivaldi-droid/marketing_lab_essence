# API 관리번호 태그 목록

> 태그 형식: `// [CS-카테고리-번호] 설명`
> 최종 갱신: 2026-04-28 · 총 201개 태그 / 160개 route.ts (CS-LAB-016/017 전환 추적 추가)

## 요약

| 카테고리 | 설명 | API 수 |
|----------|------|--------|
| ADM | 어드민 | 15 |
| AUTH | 인증 | 8 |
| CAI | 채널톡 AI 상담 | 3 |
| CRON | 크론 작업 | 7 |
| CT | 채널톡 | 25 |
| DH | 두발히어로 | 2 |
| ETC | 기타 | 59 |
| EXT | 외부연동 | 12 |
| ITM | 품목 | 13 |
| LAB | 실험실 (브랜드메시지) | 15 |
| MSG | 메시지 | 1 |
| NTF | 알림 | 5 |
| ORD | 주문 | 9 |
| PAY | 결제 | 2 |
| PLC | 정책 문서 | 1 |
| SLT | 슬롯 | 2 |
| **합계** | | **175** |


---

## ADM — 어드민 (22)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-ADM-001 | GET | `/api/dashboard/stats` | 일별 통계 조회 |
| CS-ADM-002 | GET | `/api/dashboard/monthly` | 월별 통계 조회 |
| CS-ADM-014 | GET | `/api/dashboard/analytics` | 운영 분석 — 날짜 범위 기반 상담사별 퍼포먼스 + 시간대 분포 + 응답 시간 |
| CS-ADM-015 | GET | `/api/dashboard/analytics/export` | 운영 분석 CSV 내보내기 — 상담사별 퍼포먼스 메트릭 (기간/총답변/AI사용률/활동시간/응답시간 등) |
| CS-ADM-016 | GET | `/api/new_dashboard/analytics` | 관리자 대시보드 통합 분석 — KR + Customer Journey + Health Check + Traffic (admin_dashboard_spec.md) |
| CS-ADM-017 | GET | `/api/new_dashboard/notes` | 관리자 대시보드 셀 메모 조회 (summary 모드는 셀별 카운트만) |
| CS-ADM-018 | POST | `/api/new_dashboard/notes` | 관리자 대시보드 셀 메모 신규 생성 |
| CS-ADM-019 | PATCH | `/api/new_dashboard/notes/[id]` | 관리자 대시보드 셀 메모 수정 / 해결 처리 |
| CS-ADM-020 | DELETE | `/api/new_dashboard/notes/[id]` | 관리자 대시보드 셀 메모 삭제 (작성자 본인만) |
| CS-ADM-021 | POST | `/api/new_dashboard/insight` | 관리자 대시보드 AI 인사이트 (Sonnet, DB 캐시) |
| CS-ADM-022 | POST | `/api/new_dashboard/p5-reasons` | 관리자 대시보드 P5 넛지 이탈 사유 분류 (Haiku on-demand, DB 캐시) |
| CS-ADM-003 | GET | `/api/settings` | 설정 조회 |
| CS-ADM-004 | PATCH | `/api/settings` | 설정 수정 |
| CS-ADM-005 | GET | `/api/counselors` | 상담사 목록 조회 |
| CS-ADM-006 | GET | `/api/macros` | 매크로 목록 조회 |
| CS-ADM-007 | POST | `/api/macros` | 매크로 등록 |
| CS-ADM-008 | PATCH | `/api/macros` | 매크로 수정 |
| CS-ADM-009 | DELETE | `/api/macros` | 매크로 삭제 |
| CS-ADM-010 | GET | `/api/audit-logs` | 감사 로그 조회 |
| CS-ADM-011 | GET | `/api/settings/category-prompts` | 카테고리 프롬프트 전체 조회 |
| CS-ADM-012 | PATCH | `/api/settings/category-prompts` | 카테고리 프롬프트 수정 (upsert) |
| CS-ADM-013 | ? | `/api/dashboard/abc-funnel` | ABC 시간안내 발송 → 예약 이탈·블록/지정 집계 |

## AUTH — 인증 (8)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-AUTH-001 | POST | `/api/auth/login` | 로그인 처리 |
| CS-AUTH-002 | POST | `/api/auth/logout` | 로그아웃 처리 |
| CS-AUTH-003 | GET | `/api/auth/me` | 현재 사용자 정보 조회 |
| CS-AUTH-004 | POST | `/api/auth/change-password` | 비밀번호 변경 |
| CS-AUTH-005 | GET | `/api/auth/google` | Google OAuth 인증 시작 |
| CS-AUTH-007 | GET | `/api/auth/profile` | 프로필 조회 |
| CS-AUTH-006 | GET | `/api/auth/google/callback` | Google OAuth 콜백 처리 |
| CS-AUTH-008 | PATCH | `/api/auth/profile` | 프로필 수정 (채널톡 닉네임) |

## CRON — 크론 작업 (7)

> 전체 11 cron 의 비즈니스 동작 / 시간대 / 코드 위치는 [`../architecture/cron.md`](../architecture/cron.md) 참조.
> 일부는 legacy 카테고리(NTF / ETC)로 태그됐고 신규는 CRON 카테고리로 등록.

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-CRON-001 | GET | `/api/cron/auto-close-chat` | 채널톡 자동 종료 + 자동 배차 + backoffice_requests GC (2분) |
| CS-CRON-002 | GET | `/api/cron/daily-sheet-push` | 방문수거 orders → Google Sheet 동기화 (5분) |
| CS-CRON-003 | GET | `/api/cron/lunch-sheet-push` | 런치 lunch_orders → Google Sheet 동기화 (5분) |
| CS-CRON-004 | GET | `/api/cron/tomorrow-pickup-slack` | 익일 수거 Slack 브리핑 (매일 18시) |
| CS-CRON-005 | GET | `/api/cron/auto-cancel` | §6.1 방문수거 선결제 미완료 자동취소 (30분, feature flag `prepayment_enabled`) |
| CS-CRON-011 | GET | `/api/cron/classify-complaints` | 고객 불만 사전 분류 (5분) |
| CS-CRON-014 | GET | `/api/cron/nps-daily` | NPS 일일 자동 발송 (매일 12:00 KST) — 어제 수거+결제완료 건에 4-버튼 NPS 송출, phone 평생 1회 |

## CAI — 채널톡 AI 상담 (3)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-CAI-001 | POST | `/api/channeltalk-ai/suggest` | 커버링 AI 상담 답변 추천 |
| CS-CAI-002 | POST | `/api/channeltalk-ai/suggest/send` | 추천 답변 채널톡 전송 |
| CS-CAI-003 | POST | `/api/channeltalk-ai/suggest/stream` | AI 추천 답변 — 스트리밍 (파이프라인 실시간 표시) |

## CT — 채널톡 (25)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-CT-001 | GET | `/api/channeltalk/chats` | 채널톡 유저챗 목록 조회 |
| CS-CT-002 | GET | `/api/channeltalk/chats/[chatId]/messages` | 채널톡 메시지 조회 |
| CS-CT-003 | POST | `/api/channeltalk/chats/[chatId]/messages` | 채널톡 메시지 전송 |
| CS-CT-004 | POST | `/api/channeltalk/polish` | 채널톡 메시지 말다듬기 |
| CS-CT-005 | POST | `/api/channeltalk/chats/[chatId]/upload` | 채널톡 이미지/파일 업로드 전송 |
| CS-CT-006 | GET | `/api/channeltalk/chats/[chatId]/assign` | 채널톡 상담사 배정 |
| CS-CT-021 | GET | `/api/channeltalk/file` | 채널톡 파일 프록시 (CDN 서명 필요 파일) |
| CS-CT-007 | POST | `/api/channeltalk/chats/[chatId]/assign` | 채널톡 상담사 배정 |
| CS-CT-022 | PATCH | `/api/channeltalk/chats/[chatId]/tags` | 채팅 태그 추가/삭제 |
| CS-CT-008 | GET | `/api/channeltalk/tags` | 상담 태그 마스터 목록 조회 |
| CS-CT-009 | POST | `/api/channeltalk/chats/[chatId]/close` | 상담 종료 (태그는 별도 /auto-tag 엔드포인트에서 처리) |
| CS-CT-010 | POST | `/api/service-areas` | 서비스 지역 조회 (주소→동 변환 + DB 매칭) |
| CS-CT-011 | GET | `/api/service-areas` | 서비스 지역 전체 목록 |
| CS-CT-012 | POST | `/api/channeltalk/chats/[chatId]/auto-tag` | 자동 태깅 (비동기, fire-and-forget) |
| CS-CT-023 | PATCH | `/api/channeltalk/chats/[chatId]/description` | 채널톡 상담 설명 수정 |
| CS-CT-013 | POST | `/api/channeltalk/chats/[chatId]/snooze` | 상담 보류 처리 |
| CS-CT-024 | GET | `/api/channeltalk/users/[userId]/chats` | 채널톡 고객별 상담 목록 조회 |
| CS-CT-014 | POST | `/api/channeltalk/chats/[chatId]/send-image` | 채널톡 이미지 URL 직접 전송 (매크로 이미지 등) |
| CS-CT-025 | POST | `/api/channeltalk/chats/[chatId]/vehicle-auto` | 차량등록 자동 처리 (답변 전송 + 태그 + 배정 + 보류) |
| CS-CT-015 | POST | `/api/channeltalk/tags` | 상담 태그 추가 |
| CS-CT-016 | DELETE | `/api/channeltalk/tags` | 상담 태그 삭제 (비활성화) |
| CS-CT-017 | PATCH | `/api/channeltalk/tags` | 상담 태그 수정 |
| CS-CT-018 | GET | `/api/channeltalk/stats` | 채널톡 상담 통계 (cases API 기반) |
| CS-CT-019 | PATCH | `/api/channeltalk/users/[userId]/profile` | 채널톡 유저 프로필 수정 (이름 등) |
| CS-CT-020 | POST | `/api/channeltalk/chats/[chatId]/delete-message` | 채널톡 메시지 삭제 (Desk API) |

## DH — 두발히어로 (2)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-DH-001 | GET | `/api/dhero/deliveries` | 두발히어로 배송 조회 (bookId 또는 전화번호) |
| CS-DH-002 | POST | `/api/dhero/deliveries/create` | 두발히어로 배송 접수 |

## ETC — 기타 (59)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-ETC-001 | GET | `/api/conversations` | 상담 목록 조회 (cursor 기반 페이지네이션 + 검색) |
| CS-ETC-002 | GET | `/api/conversations/[sessionId]` | 상담 상세 조회 |
| CS-ETC-003 | GET | `/api/conversations/updates` | 상담 업데이트 조회 |
| CS-ETC-004 | POST | `/api/conversations/[sessionId]/memo` | 상담 메모 저장 |
| CS-ETC-005 | POST | `/api/conversations/[sessionId]/name` | 고객 이름/연락처 수정 |
| CS-ETC-006 | PATCH | `/api/conversations/[sessionId]/phase` | 상담 단계 변경 |
| CS-ETC-007 | PATCH | `/api/conversations/[sessionId]/status` | 상담 상태 변경 |
| CS-ETC-008 | PATCH | `/api/conversations/[sessionId]/assignee` | 상담사 배정 |
| CS-ETC-009 | POST | `/api/conversations/[sessionId]/read` | 상담 읽음 처리 |
| CS-ETC-010 | POST | `/api/conversations/[sessionId]/reset` | 대화 초기화 (테스트용) |
| CS-ETC-011 | DELETE | `/api/conversations/[sessionId]/reset` | 대화 삭제 (테스트용) |
| CS-ETC-012 | PATCH | `/api/conversations/[sessionId]/draft` | AI 초안 수정 |
| CS-ETC-013 | POST | `/api/conversations/[sessionId]/regenerate` | AI 응답 재생성 |
| CS-ETC-014 | POST | `/api/conversations/[sessionId]/polish` | AI 메시지 다듬기 |
| CS-ETC-015 | GET | `/api/lunch` | 런치 주문 목록 조회 |
| CS-ETC-016 | PATCH | `/api/lunch` | 런치 주문 수정 |
| CS-ETC-017 | POST | `/api/lunch` | 런치 주문 등록 |
| CS-ETC-020 | POST | `/api/lunch/payment/check-unsettled` | 미정산 런치 결제 확인 |
| CS-ETC-021 | GET | `/api/download-image` | 이미지 다운로드 |
| CS-ETC-023 | GET | `/api/lunch/vendors` | 런치 벤더 목록 조회 |
| CS-ETC-024 | POST | `/api/lunch/vendors` | 런치 벤더 등록 |
| CS-ETC-025 | PATCH | `/api/lunch/vendors/[id]` | 런치 벤더 수정 |
| CS-ETC-026 | GET | `/api/cron/auto-close-chat` | 채널톡 자동 상담종료 + 자동배차 크론 (2분 주기) |
| CS-ETC-057 | DELETE | `/api/lunch/vendors/[id]` | 런치 벤더 비활성화 |
| CS-ETC-027 | GET | `/api/notifications` | 알림 목록 조회 |
| CS-ETC-028 | POST | `/api/notifications` | 알림 생성 (멘션 등) |
| CS-ETC-029 | DELETE | `/api/lunch` | 런치 주문 삭제 |
| CS-ETC-058 | PATCH | `/api/notifications` | 알림 읽음 처리 |
| CS-ETC-030 | GET | `/api/dispatch` | 배차 통합 조회 |
| CS-ETC-059 | DELETE | `/api/notifications` | 알림 삭제 |
| CS-ETC-031 | POST | `/api/dispatch/assign` | 배차 배정/순서 변경 |
| CS-ETC-032 | GET | `/api/drivers` | 기사 목록 조회 |
| CS-ETC-033 | POST | `/api/drivers` | 기사 등록 |
| CS-ETC-034 | PATCH | `/api/drivers` | 기사 수정 |
| CS-ETC-035 | DELETE | `/api/drivers` | 기사 삭제 |
| CS-ETC-036 | GET | `/api/vehicles` | 차량 목록 조회 |
| CS-ETC-037 | POST | `/api/vehicles` | 차량 등록 |
| CS-ETC-038 | PATCH | `/api/vehicles` | 차량 수정 |
| CS-ETC-039 | DELETE | `/api/vehicles` | 차량 삭제 |
| CS-ETC-040 | GET | `/api/lunch/invoices` | 세금계산서 발행 이력 조회 |
| CS-ETC-041 | POST | `/api/lunch/invoices/issue` | 세금계산서 발행 요청 (단건 + 월말 합산) |
| CS-ETC-042 | GET | `/api/lunch/invoices/[issuanceKey]` | 세금계산서 상세 조회 (볼타 API 프록시) |
| CS-ETC-043 | POST | `/api/lunch/vendors/[id]/cert` | 사업자등록증 업로드 |
| CS-ETC-044 | GET | `/api/lunch/conversations` | 런치 대화 목록 조회 |
| CS-ETC-045 | GET | `/api/lunch/conversations/[sessionId]` | 런치 대화 상세 조회 (메시지 포함) |
| CS-ETC-046 | PATCH | `/api/lunch/conversations/[sessionId]` | 런치 대화 메타데이터 수정 (status, assignee, memo 등) |
| CS-ETC-047 | POST | `/api/lunch/conversations/[sessionId]/send` | 런치 채팅 메시지 발송 |
| CS-ETC-048 | POST | `/api/lunch/conversations/[sessionId]/read` | 런치 대화 읽음 처리 |
| CS-ETC-060 | POST | `/api/lunch/conversations/[sessionId]/send-image` | 런치 채팅 이미지 발송 |
| CS-ETC-049 | POST | `/api/lunch/conversations/[sessionId]/send-file` | 런치 채팅 파일 발송 |
| CS-ETC-061 | POST | `/api/lunch/invoices/[issuanceKey]/cancel` | 세금계산서 취소 (수정발행 · 계약의 해제) |
| CS-ETC-050 | POST | `/api/address/normalize` | 주소 정규화 (Kakao Local API 프록시) |
| CS-ETC-062 | POST | `/api/lunch/conversations/[sessionId]/regenerate` | 런치 AI 초안 재생성 |
| CS-ETC-051 | POST | `/api/conversations/[sessionId]/requested-date` | 사이드 드롭박스 — 수거 희망일 저장 (상담사 수동 변경) |
| CS-ETC-063 | POST | `/api/lunch/conversations/[sessionId]/polish` | 런치 AI 메시지 다듬기 |
| CS-ETC-052 | DELETE | `/api/lunch/conversations/[sessionId]` | 런치 대화 삭제 (디버그용) |
| CS-ETC-053 | DELETE | `/api/conversations/[sessionId]/read` | 상담 안읽음 처리 (unread_count = 1) |
| CS-ETC-054 | DELETE | `/api/lunch/conversations/[sessionId]/read` | 런치 대화 안읽음 처리 (unread_count = 1) |
| CS-ETC-055 | GET | `/api/cron/lunch-auto-payment` | 런치 자동 결제 요청 크론 (전일 수거건, 매일 15시 KST) |
| CS-ETC-056 | GET | `/api/cron/lunch-payment-sync` | 런치 결제 상태 자동 동기화 크론 (10분 주기) |
| CS-ETC-069 | POST | `/api/lunch/conversations/[sessionId]/internal-read` | 런치 내부 멘션 읽음 처리 |
| CS-ETC-064 | POST | `/api/invoices/issue` | 방문수거 단건 세금계산서 발행 |
| CS-ETC-065 | GET | `/api/invoices` | 방문수거 세금계산서 발행 이력 목록 |
| CS-ETC-066 | GET | `/api/invoices/[id]` | 방문수거 세금계산서 상세 (Bolta detail 포함) |
| CS-ETC-067 | POST | `/api/invoices/[id]/cancel` | 방문수거 세금계산서 취소 (수정발행 · 계약의 해제) |

## EXT — 외부연동 (12)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-EXT-001 | POST | `/api/webhook` | 웹훅 메시지 라우팅 |
| CS-EXT-002 | GET | `/api/webhook` | 웹훅 상태 확인 |
| CS-EXT-003 | POST | `/api/webhook/message` | 고객 메시지 수신 및 AI 응답 생성 |
| CS-EXT-004 | POST | `/api/webhook/metadata` | 사용자 메타데이터 수신 |
| CS-EXT-005 | POST | `/api/webhook/session-end` | 채팅 세션 종료 처리 (legacy kebab path) |
| CS-EXT-019 | POST | `/api/webhook/reference` | 사용자 메타정보 수신 (해피톡 spec path, referrer 추적) |
| CS-EXT-020 | POST | `/api/webhook/sessionEnd` | 채팅 세션 종료 (해피톡 spec camelCase path alias) |
| CS-EXT-011 | POST | `/api/conversations/[sessionId]/send` | 고객에게 메시지 발송 |
| CS-EXT-012 | POST | `/api/conversations/[sessionId]/send-image` | 고객에게 이미지 발송 |
| CS-EXT-013 | POST | `/api/conversations/[sessionId]/send-file` | 고객에게 파일 발송 |
| CS-EXT-018 | POST | `/api/conversations/[sessionId]/send-guide` | 방문수거 가이드 이미지 발송 |
| CS-EXT-014 | POST | `/api/backoffice/lookup` | 백오피스 고객 정보 조회 (Puppeteer 브릿지 + 24시간 캐시) |
| CS-EXT-016 | POST | `/api/backoffice/order-detail` | 백오피스 주문 상세 조회 (실패 사유, 방문 이미지) |
| CS-EXT-019 | POST | `/api/webhook/lunch/session-end` | 런치 웹훅 — 세션 종료 |

## ITM — 품목 (13)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-ITM-001 | GET | `/api/products/list` | 품목 목록 조회 |
| CS-ITM-002 | POST | `/api/products/list` | 품목 등록 |
| CS-ITM-003 | PATCH | `/api/products/list` | 품목 수정 |
| CS-ITM-004 | DELETE | `/api/products/list` | 품목 삭제 |
| CS-ITM-005 | GET | `/api/products/search` | 품목 검색 |
| CS-ITM-006 | GET | `/api/products/siblings` | 유사 품목 조회 |
| CS-ITM-007 | POST | `/api/products/ai-lookup` | AI 품목 조회 |
| CS-ITM-008 | POST | `/api/quote/calculate` | 견적 계산 |
| CS-ITM-009 | GET | `/api/ladder-fees` | 사다리차 요금 조회 |
| CS-ITM-010 | GET | `/api/region-prices` | 지역별 가격 조회 |
| CS-ITM-011 | POST | `/api/conversations/[sessionId]/quote` | 견적 저장 |
| CS-ITM-012 | POST | `/api/conversations/[sessionId]/extract-items` | 메시지에서 품목 추출 |
| CS-ITM-013 | POST | `/api/conversations/[sessionId]/extract-items-v2` | 프롬프트 기반 품목 추출 (v2 테스트) |

## MSG — 메시지 (1)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-MSG-051 | POST | `/api/conversations/[sessionId]/send-abc-slots` | ABC 타임 슬롯 버튼 메시지 발송 |

## NTF — 알림 (5)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-NTF-001 | GET | `/api/nudge` | 넛지 목록 조회 |
| CS-NTF-002 | POST | `/api/nudge` | 넛지 생성 |
| CS-NTF-003 | POST | `/api/nudge/seed` | 넛지 시드 데이터 생성 |
| CS-NTF-004 | GET | `/api/reminder` | 리마인더 목록 조회 |
| CS-NTF-005 | POST | `/api/reminder` | 리마인더 생성 |

## ORD — 주문 (9)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-ORD-001 | GET | `/api/orders` | 주문 목록 조회 |
| CS-ORD-002 | POST | `/api/orders` | 주문 생성 |
| CS-ORD-003 | PATCH | `/api/orders/[id]` | 주문 수정 |
| CS-ORD-004 | DELETE | `/api/orders/[id]` | 주문 삭제 |
| CS-ORD-005 | POST | `/api/orders/[id]/payment` | 주문 결제 링크 생성 |
| CS-ORD-006 | GET | `/api/orders/[id]/payment` | 주문 결제 상태 조회 |
| CS-ORD-007 | POST | `/api/orders/batch` | 주문 일괄 상태 변경 |
| CS-ORD-008 | POST | `/api/orders/batch-payment` | 주문 일괄 결제 발송 |
| CS-ORD-009 | POST | `/api/orders/payment-nudge` | 주문 결제 넛지 일괄 발송 (이미지 + 텍스트) |
| CS-ORD-010 | POST | `/api/orders/[id]/ladder-prepayment` | 사다리차 선결제 — 별도 Order 생성 + NicePay 링크 |

## PAY — 결제 (2)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-PAY-006 | POST | `/api/lunch/payment` | 런치 결제 링크 발송 |
| CS-PAY-007 | GET | `/api/lunch/payment` | 런치 결제 상태 조회 |

## SLT — 슬롯 (2)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-SLT-001 | GET | `/api/schedule` | 스케줄 조회 (orders + lunch_orders DB 기반, 2026-04-21부터 Google Sheets 의존 제거) |
| CS-SLT-002 | GET | `/api/schedule/abc` | ABC 블록별 예약 현황 (orders + lunch_orders 기반, 런치 100인분 미만 제외. 2026-04-21부터 bookings 제거) |
| CS-SLT-003 | GET | `/api/schedule/abc/month` | 월간 ABC 집계 (달력 뷰용, 42일 일괄 조회) |
| CS-CONV-061 | POST | `/api/conversations/[sessionId]/assistant-hint` | 커바니 어시스턴트 — JSON `{hint, section}` 반환. 공휴일 판정 서버측 사전 계산(app_settings.abc_capacity.holidays + 2026 fallback), 관련 정책 섹션 heading 같이 전달 (PolicyModal 연동) |

## DSH — 신규 대시보드 (6)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-DSH-043 | GET | `/api/new_dashboard/conversion-time` | 전환 인입 시간 분석 — 시간대별 전환 건수/매출 + 요일×시간 히트맵 |
| CS-DSH-044 | GET | `/api/new_dashboard/price-tiers` | 견적 가격대별 전환률 — 5개 구간별 전환/취소/평균매출 |
| CS-DSH-045 | GET | `/api/new_dashboard/region-conversion` | 지역별 전환률·객단가 — 구별 인입/전환/매출, 상위10+기타 |
| CS-DSH-046 | GET | `/api/new_dashboard/response-time` | 첫 응답 속도 ↔ 전환률 — 구간별 전환률 + AI vs 사람 분리 |
| CS-DSH-047 | GET | `/api/new_dashboard/repeat-customers` | 재예약(LTV) — 재예약률·평균 리드타임·고객 생애 가치·Top10 |
| CS-DSH-048 | GET | `/api/new_dashboard/nps` | NPS 응답 집계 — 기간 내 발송·응답 통계(응답률·평균점수·점수별 분포) + 응답 목록 |

## PLC — 정책 문서 (1)

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-PLC-001 | GET | `/api/policies/pickup` | 방문수거 정책 문서 raw 텍스트 + heading slug 목록 반환 (PolicyModal) |

## LAB — 실험실 브랜드메시지 (8)

> 접근 권한: 김원빈 / 강성진 전용. 그 외 403.

| 번호 | 메서드 | 경로 | 설명 |
|------|--------|------|------|
| CS-LAB-001 | GET | `/api/lab/brand-message/campaigns` | 캠페인 목록 조회 (최근 50개) |
| CS-LAB-001 | POST | `/api/lab/brand-message/campaigns` | 캠페인 신규 생성 — multipart form-data (label, group_tag, message_type, notes, excel_file) → 파싱 + recipients INSERT. 응답: campaign_id, 수신자 수, 첫 3행 미리보기, FW 초과 경고 |
| CS-LAB-002 | GET | `/api/lab/brand-message/campaigns/[id]` | 캠페인 상세 (campaign + 첫 50 recipients + stats) |
| CS-LAB-002 | DELETE | `/api/lab/brand-message/campaigns/[id]` | 캠페인 삭제 (draft/cancelled 상태만 허용, recipients cascade) |
| CS-LAB-003 | POST | `/api/lab/brand-message/campaigns/[id]/test-send` | 테스트 발송 — `{ phone }` 으로 첫 row 메시지 1건 즉시 발송. DB 기록 없음 |
| CS-LAB-004 | POST | `/api/lab/brand-message/campaigns/[id]/send-now` | 즉시 발송 — `{ confirm: "SEND_NOW_AGREED", batch_size_per_invocation?: number }` (default 1000). 비동기(202), 1000건씩 분산 발송 + cron 자동 이어짐 |
| CS-LAB-005 | POST | `/api/lab/brand-message/campaigns/[id]/schedule` | 예약발송 등록 — `{ scheduled_at }` (ISO 8601). status=scheduled |
| CS-LAB-006 | POST | `/api/lab/brand-message/campaigns/[id]/cancel` | 캠페인 취소 (scheduled/sending 상태만) |
| CS-LAB-007 | GET | `/api/lab/brand-message/campaigns/[id]/recipients` | 수신자 목록 페이징 — ?status=pending|sent|failed&limit&offset |
| CS-LAB-008 | GET | `/api/cron/brand-message-scheduler` | Vercel Cron 1분마다 — scheduled(due) + sending 캠페인 1개 선택 → runSendBatchOnce(1000) 이어서 발송 |
| CS-LAB-013 | POST | `/api/lab/brand-message/campaigns/[id]/resume` | 분산 발송 재개 — sending/failed/cancelled 상태에서 다음 1000건 즉시 발송. 비동기(202) |
| CS-LAB-016 | GET | `/api/cron/brand-message-conversion` | Vercel Cron 5분마다 — 발송 후 7일 이내 캠페인의 phone 매칭으로 orders 전환 backfill |
| CS-LAB-017 | GET | `/api/lab/brand-message/campaigns/[id]/conversion-stats` | 캠페인 전환 통계 — total_sent / converted / conversion_rate / avg_conversion_hours / 최근 50건 |
| CS-LAB-018 | GET | `/api/lab/nps/preview` | NPS 일회성 bulk 사전 건수 — 이번 달 completed 중 발송 가능 (phone 미발송 + 세션 alive) |
| CS-LAB-019 | POST | `/api/lab/nps/bulk-send` | NPS 일회성 bulk 발송 — `{confirm: "BULK_NPS_SEND", month?}` after() 백그라운드 |

