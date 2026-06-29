# 04 — API 카탈로그

> ~25 라우트. 채널톡 Open API 프록시 + AI 추천 + 백오피스 브릿지.

## 채널톡 메시지 / 채팅 (`/api/channeltalk/*`)

| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| GET | `/api/channeltalk/chats` | 유저챗 목록 | CS-CT-001 |
| GET | `/api/channeltalk/chats/[chatId]/messages` | 메시지 조회 | CS-CT-002 |
| POST | `/api/channeltalk/chats/[chatId]/messages` | 메시지 전송 | CS-CT-003 |
| POST | `/api/channeltalk/polish` | 메시지 말다듬기 | CS-CT-004 |
| POST | `/api/channeltalk/chats/[chatId]/upload` | 이미지/파일 업로드 전송 | CS-CT-005 |
| GET / POST | `/api/channeltalk/chats/[chatId]/assign` | 담당자 배정 | CS-CT-006/007 |
| GET | `/api/channeltalk/file` | CDN 파일 프록시 (서명 필요 파일) | CS-CT-021 |
| PATCH | `/api/channeltalk/chats/[chatId]/tags` | 태그 추가/삭제 | CS-CT-022 |
| GET | `/api/channeltalk/tags` | 태그 마스터 목록 | CS-CT-008 |

### 챗 상태 / 액션
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/channeltalk/chats/[chatId]/close` | 챗 종료 |
| POST | `/api/channeltalk/chats/[chatId]/snooze` | 보류 |
| POST | `/api/channeltalk/chats/[chatId]/auto-tag` | 자동 태깅 (Sonnet) |
| POST | `/api/channeltalk/chats/[chatId]/description` | 챗 설명 갱신 |
| POST | `/api/channeltalk/chats/[chatId]/delete-message` | 메시지 삭제 (Desk API 사용) |
| POST | `/api/channeltalk/chats/[chatId]/send-image` | 이미지 발송 |
| POST | `/api/channeltalk/chats/[chatId]/vehicle-auto` | 차량 자동 추천 |

### 사용자 정보
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/channeltalk/users/[userId]/chats` | 한 user 의 모든 chats |
| GET | `/api/channeltalk/users/[userId]/profile` | user 프로필 |
| GET | `/api/channeltalk/stats` | 통계 (분석 페이지용) |

## AI 추천 (`/api/channeltalk-ai/*`)

| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| POST | `/api/channeltalk-ai/suggest` | AI 추천 (non-streaming) | CS-CAI-001 |
| POST | `/api/channeltalk-ai/suggest/send` | 추천 답변 채널톡 전송 | CS-CAI-002 |
| POST | `/api/channeltalk-ai/suggest/stream` | 스트리밍 (파이프라인 실시간 표시) | CS-CAI-003 |

### `suggest` 입력
```json
{
  "chatId": "...",
  "messages": [...],   // 최근 N개
  "userProfile": {...},
  "backofficeData": {...}  // /api/backoffice/lookup 결과 (선택)
}
```

### `suggest` 출력
```json
{
  "categories": ["이용_배출품목"],
  "stage0": "new",
  "answer": "고객님, ...",
  "answerWithoutTone": "...",  // Haiku 적용 전
  "macros": [...],             // 후보
  "policyRefs": [...],         // 인용 섹션
  "ragHits": [...],            // 디버그용
  "modelUsed": {...}
}
```

## 백오피스 (`/api/backoffice/*`)

채널톡 응대 중 고객 정보 조회.

| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| POST | `/api/backoffice/lookup` | 고객 phone → admin.covering.app 정보 조회 | CS-EXT-014 |
| POST | `/api/backoffice/order-detail` | 주문 URL → 상세 (실패 사유, 방문 이미지) | CS-EXT-016 |

### `lookup` 흐름
1. 클라이언트 POST → 캐시 확인 (`backoffice_cache` 24h)
2. 캐시 hit → 즉시 반환
3. 캐시 miss → `backoffice_requests` INSERT (status=pending)
4. 5분 timeout 까지 polling — status=completed → 반환
5. timeout / status=error → 504 응답
6. **특이점**: maxDuration = 30 (Vercel function timeout)

## Cron (채널톡 관련)

| 경로 | KST | 설명 | 코드 |
|---|---|---|---|
| `/api/cron/auto-close-chat` | 2분 | 채널톡 자동 종료 + 자동 배차 + backoffice_requests GC | CS-CRON-001 |

채널톡 전용 cron 은 이 1개만. 자세히는 [`../../architecture/cron.md`](../../architecture/cron.md#1-auto-close-chat--채널톡-자동-종료).

## 채널톡 Open API (외부) 매핑

`lib/channeltalk/client.ts` 의 `ctFetch` 가 다음 경로를 호출:

| 우리 라우트 | 채널톡 API |
|---|---|
| `/api/channeltalk/chats` | `GET /open/v5/user-chats` |
| `/api/channeltalk/chats/[chatId]/messages` | `GET/POST /open/v5/user-chats/{id}/messages` |
| `/api/channeltalk/chats/[chatId]/close` | `PATCH /open/v4/user-chats/{id}/close` |
| (자동 배차 cron 안에서) | `PUT /open/v4/user-chats/{id}/open` |
| `/api/channeltalk/chats/[chatId]/assign` | `PATCH /open/v4/user-chats/{id}/assign-to/managers/{managerId}` |
| (auto-tag 쓰는 곳) | `GET /open/v4/managers` |

Base URL: `https://api.channel.io`. 인증: `x-access-key` + `x-access-secret`.

## 채널톡 Desk API (메시지 삭제)

`lib/channeltalk/desk-api.ts` — 쿠키 기반 (CHANNELTALK_DESK_COOKIE, **30일 로테이션**).

- 메시지 삭제만 — Open API 에 없음
- 호출처: `/api/channeltalk/chats/[chatId]/delete-message`
- 쿠키 만료 시 콘솔에서 재로그인 → DevTools 로 쿠키 추출 → env 갱신

## 코드 컨벤션

- API 태그: `[CS-CT-XXX]` (채널톡), `[CS-CAI-XXX]` (AI), `[CS-EXT-014/016]` (백오피스)
- 타입: `lib/channeltalk/types.ts` 집중 관리
  - 내부 변환: `CT` 접두사 (CTChat, CTMessage, CTMessageFile)
  - API 응답: `ChannelTalk` 접두사 (ChannelTalkUserChat, ChannelTalkMessage)
- 컴포넌트: `components/channeltalk/` 디렉토리
- AI 파이프라인: `lib/channeltalk-ai/` (도메인 분리)

전체 카탈로그: [`../../api/tags.md`](../../api/tags.md).
