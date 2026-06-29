# disposal-guide

폐기물 종류·상황에 맞는 커버링 서비스를 추천해주는 진단형 플로우

## 목적

사용자가 버리려는 폐기물의 종류와 상황을 2단계 질문으로 진단하고, 커버링 봉투(80L/150L) / 대형 봉투 / 방문수거 중 적합한 서비스를 추천한다.

## 진단 플로우

```text
1단계: 어떤 걸 버리려 하시나요?
  ├─ 봉투에 담을 수 있는 일반 쓰레기 → 2단계A
  ├─ 들고 내려갈 수 있는 부피 있는 물건 → 2단계B
  ├─ 혼자 옮기기 힘든 대형 가구·가전 → 방문수거
  └─ 이사·대청소 후 대량 폐기물 → 방문수거

2단계A: 양이 어느 정도인가요?
  ├─ 1~3개면 충분 → 커버링 봉투 80L
  └─ 4개 이상 → 커버링 봉투 80L / 150L

2단계B: 봉투에 들어가나요?
  ├─ 들어가요 → 커버링 봉투 150L
  └─ 안 들어가요 → 커버링 대형 봉투
```

## 실행 환경

- 실행 방식: PM2 (Next.js)
- 실행 서버: covering-labs-public (public VM)
- 배포 URL: `https://public-labs.covering.app/disposal-guide`

## 주요 파일

| 파일 | 역할 |
|---|---|
| `src/DisposalGuideApp.tsx` | 앱 루트 — 상태 관리 및 화면 라우팅 |
| `src/types.ts` | TypeScript 타입 정의 |
| `src/data/flow.ts` | 질문·선택지 fallback 데이터 |
| `src/data/defaultGuideConfig.ts` | Supabase 미설정·실패 시 사용하는 추천 fallback config |
| `src/lib/loadGuideConfig.ts` | Supabase 운영 데이터 로더 |
| `src/screens/QuestionScreen.tsx` | 질문 화면 (공통) |
| `src/screens/ResultScreen.tsx` | 추천 결과 화면 |
| `src/components/ChoiceCard.tsx` | 선택지 카드 컴포넌트 |
| `src/components/ProgressDots.tsx` | 진행 단계 표시 |

## 실행 방법

```bash
cd apps/public/disposal-guide
npm install
npm run dev
# → http://localhost:3000
```

## 환경변수

| 변수명 | 필수 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | optional | Supabase 프로젝트 URL. 설정하면 추천 config를 Supabase에서 읽는다. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional | Supabase anon key. RLS select 정책으로 active row만 읽는다. |
| `SUPABASE_URL` | optional | 피드백 API의 서버 저장용 Supabase 프로젝트 URL. 미설정 시 `NEXT_PUBLIC_SUPABASE_URL`을 사용한다. |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | 서버 빌드/ISR에서 Supabase를 읽고 피드백을 저장하기 위한 server-only key. 피드백 저장에는 필수다. |
| `SUPABASE_SERVICE_KEY` | optional | `SUPABASE_SERVICE_ROLE_KEY` 대체 이름. |
| `COVERING_SUPABASE_URL` | optional | public VM 공용 Supabase URL fallback. 표준 URL 이름이 없을 때 사용한다. |
| `COVERING_SUPABASE_KEY` | optional | public VM 공용 Supabase service role key fallback. 표준 key 이름이 없을 때 사용한다. |
| `DISPOSAL_GUIDE_FEEDBACK_TABLE` | optional | 피드백 저장 테이블명. 기본값은 `disposal_guide_feedback`. |
| `DISPOSAL_GUIDE_ITEM_SEARCH_EVENTS_TABLE` | optional | 품목 검색어 로그 테이블명. 기본값은 `disposal_guide_item_search_events`. |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | optional | Mixpanel browser token. 미설정 시 앱에 포함된 public token을 사용한다. |
| `SLACK_BOT_TOKEN` | optional | Supabase 저장 성공 후 Slack 알림 발송용 bot token. 미설정 시 저장만 수행하고 Slack은 건너뛴다. |
| `DISPOSAL_GUIDE_FEEDBACK_SLACK_CHANNEL` | optional | 피드백 알림 채널. 기본값은 `C0B2TRG6DCK` (`#제품팀_링퀴즈_피드백`). |
| `NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL` | optional | 폐의약품·유해 폐기물 키워드 Google Sheets CSV export URL. 미설정 시 `src/data/hazardousKeywords.ts`의 fallback 리스트 사용. |

## Supabase 데이터 관리

추천 데이터의 1차 운영 원천은 Supabase다. 환경변수가 없거나 Supabase 조회가 실패하면 기존 정적 fallback으로 동작한다.

| 테이블 | 역할 |
|---|---|
| `disposal_guide_step_choices` | 카테고리, 무게, 체감 무게, 나눠 담기 선택지 |
| `disposal_guide_recommendation_rules` | 추천 결정 규칙. `priority` 오름차순으로 첫 매칭 rule을 적용 |
| `disposal_guide_result_copy` | 추천 결과별 제목, 설명, CTA 문구 |
| `disposal_guide_hazardous_keywords` | 커버링 수거 불가 키워드 |
| `disposal_guide_item_search_events` | 사용자가 입력한 물품 검색어 로그. 이메일·전화번호는 redaction 후 저장 |

마이그레이션과 초기 seed는 앱 내부에 둔다.

```bash
cd apps/public/disposal-guide
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260506000000_disposal_guide_config.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260511000000_disposal_guide_feedback.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260512000000_disposal_guide_feedback_message.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260514000000_disposal_guide_item_search_events.sql
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

SQL editor를 사용해도 된다. 운영 DB 적용에는 회사 Supabase 프로젝트의 `SUPABASE_DB_URL` 또는 SQL editor 권한이 필요하다.

`disposal_guide_recommendation_rules.condition`은 JSONB다. 지원 키는 다음과 같다.

| 키 | 예시 |
|---|---|
| `categoryMode` | `"GENERAL_ONLY"`, `"SPLITTABLE_ONLY"` |
| `lengthIn` | `["OVER_150"]` |
| `weightIn` | `["OVER_15_UNDER_25", "OVER_25"]` |
| `perceivedWeightIn` | `["HARD_TO_LIFT"]` |
| `bagAcceptableLength` | `true` |
| `anyOf`, `allOf`, `not` | 조건 조합 |

`action`은 `VISIT_PICKUP`, `LARGE_COVERING_BAG`, `GENERAL_BAG_MULTIPLE`, `GENERAL_BAG_SINGLE`, `HEAVY_SPLIT_DECISION` 중 하나다.

### 폐기물 키워드 시트 구조

Supabase 키워드가 비어 있으면 `NEXT_PUBLIC_HAZARDOUS_SHEET_CSV_URL`을 fallback으로 사용한다. 이 URL은 Google Sheets에서
**파일 → 공유 → 웹에 게시 → 시트 선택 + CSV → 게시** 후 받는 URL을 사용한다.

| keyword | category | enabled |
|---|---|---|
| 알약 | PHARMACEUTICAL | TRUE |
| 페인트 | HAZARDOUS_WASTE | TRUE |
| ... | ... | ... |

- `category`: `PHARMACEUTICAL` 또는 `HAZARDOUS_WASTE` (그 외는 무시)
- `enabled`: `FALSE` / `0` / `NO` 면 무시
- 1시간(ISR `revalidate: 3600`) 단위로 자동 갱신
- 시트 fetch 실패 시 fallback 리스트로 대체

## 검색어 로그와 이벤트

물품 설명 단계에서 사용자가 입력하고 다음으로 진행하면 `/api/item-search-events`를 통해 Supabase에 저장한다. 제한 품목으로 감지되어 안내 모달이 뜬 경우도 `restricted_item_detected` 이벤트로 저장한다.

- 저장값: 정규화된 `item_search_keyword`, 세션 ID, 선택 카테고리, 길이·무게 상태, 제한 품목 여부, UTM context
- 저장하지 않는 값: 원문 전체 입력값, IP, 쿠키
- 개인정보 완화: 이메일·전화번호는 `[redacted_email]`, `[redacted_phone]`으로 치환하고 80자까지만 저장
- 저장 경로: 브라우저가 직접 Supabase에 쓰지 않고, 서버 API가 service role 환경변수로만 insert한다
- 저장 실패 시 추천 플로우는 계속 진행

Mixpanel 이벤트는 route, step click, result view, feedback action, hazardous modal에 심어져 있다. 브라우저 CORS 영향을 피하기 위해 `mixpanel-browser` 전송은 same-origin `/api/mixpanel/track` 프록시를 거쳐 Mixpanel로 전달된다.

## 의존 서비스

- Supabase (선택, 권장) — 추천 룰·선택지·결과 문구·수거 불가 키워드 운영용
- Supabase (필수) — 피드백 저장용. 서버 전용 service role key로만 insert한다.
- Supabase (선택, 권장) — 품목 검색어 로그 저장용. 서버 전용 service role key로만 insert한다.
- Slack (선택) — Supabase 저장 성공 후 `#제품팀_링퀴즈_피드백`에 링퀴즈 피드백 알림 발송
- Google Sheets (선택 fallback) — 폐의약품·유해 폐기물 키워드 운영용

## 주의사항

- 폰트: Noto Sans KR (Google Fonts, 로컬 개발용). Pretendard로 교체 시 large-coveringbag-order 앱의 fonts 방식 참고
- 디자인 확정 후 Figma MCP 연동해서 색상·간격 업데이트 예정
- 결과 화면 CTA 버튼은 현재 앱 딥링크 미연결 상태
- 피드백 API는 사용자가 입력한 품목명을 원문으로 저장하거나 Slack에 보내지 않는다. 입력 여부와 글자 수만 저장한다.
