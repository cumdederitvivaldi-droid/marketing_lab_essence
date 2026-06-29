# disposal-guide Mixpanel 이벤트 플랜

> 유형: 플랜
> 작성일: 2026-04-30
> 상태: 완료

## 목표

`public-labs.covering.app/disposal-guide`에 기존 Mixpanel 이벤트 taxonomy를 따르는 이벤트를 심는다.

## 현황 분석

- 라이브 `disposal-guide`에는 Mixpanel SDK와 이벤트 호출이 없다.
- 기존 가이드 이벤트는 `[ROUTE] Guide...Screen`, `[CLICK] Guide...Screen_action`, `[VIEW] Guide...Screen_section` 형식을 사용한다.
- 서버 소스는 `covering-labs-public:/shared/apps/disposal-guide`에 있고, 로컬 관리본에는 없어서 `apps/public/disposal-guide`로 동기화했다.

## 구현 계획

- [x] `src/lib/analytics.ts`에 Mixpanel 초기화와 공통 context 등록을 추가한다.
- [x] 진단 플로우 화면 전환, 선택, 결과, CTA, 피드백에 `GuideServiceRecommendation*Screen` 계열 이벤트를 추가한다.
- [x] 원문 물품 입력값은 전송하지 않고 입력 여부/길이, 선택 ID/라벨, 결과 타입만 전송한다.
- [x] 앱 lint, test, typecheck, build로 검증한다.

## 반영

- 서버 소스를 `apps/public/disposal-guide`로 동기화해 로컬 관리본을 만들었다.
- `mixpanel-browser` 기반 client analytics helper를 추가했다.
- 기존 `lint` 스크립트가 대화형 설정 프롬프트로 멈추지 않도록 앱 로컬 ESLint 설정을 추가했다.
- 이벤트 taxonomy는 기존 가이드 계열과 맞춰 `[ROUTE] Guide...Screen`, `[CLICK] Guide...Screen_action`, `[VIEW] Guide...Screen_content` 형식으로 잡았다.
- 공통 속성은 `app_name=disposal-guide`, `guide_name=service_recommendation`, `guide_title=서비스 추천`, `screen_name`, `screen_title`, `funnel_step`, `session_id`, `url` 기준으로 통일했다.
- 화면 진입, 시작 버튼, 카테고리 다음 버튼, 라디오 선택, 길이 다음 버튼, 제한 품목 모달, 결과 노출, 결과 CTA, 다시 시작, 피드백 클릭을 추적한다.

## 검증

- `npm run lint` 통과.
- `npm run typecheck` 통과.
- `npm test` 통과. 1개 test suite, 68개 test.
- `npm run build` 통과.
- 로컬 `http://127.0.0.1:3310`에서 Playwright로 주요 플로우를 실행하고 Mixpanel 네트워크 요청이 생성되는 것을 확인했다.
- 확인된 대표 이벤트:
  - `[ROUTE] GuideServiceRecommendationIntroScreen`
  - `[CLICK] GuideServiceRecommendationIntroScreen_startButton`
  - `[CLICK] GuideServiceRecommendationCategoryScreen_nextButton`
  - `[CLICK] GuideServiceRecommendationFoodWasteScreen_choice`
  - `[CLICK] GuideServiceRecommendationWeightScreen_choice`
  - `[ROUTE] GuideServiceRecommendationResultScreen`
  - `[VIEW] GuideServiceRecommendationResultScreen_result`

## 배포 상태

- 사용자 명시 배포 요청 전이므로 public VM 운영 배포와 프로세스 재시작은 하지 않았다.
- PR: https://github.com/covering-app/covering-labs/pull/171

## 리뷰 수정

- CodeRabbit 수정 요청에 따라 route 이벤트 effect를 `state.screen` 변경 때만 실행되게 조정했다.
- 미사용 `getTrackingContext` export를 제거했다.
- 결과 노출 이벤트 effect 의존성을 `phase` 기준으로 줄였다.
- CodeRabbit 추가 수정 요청에 따라 Mixpanel 이벤트의 `url` 속성에서 query string을 제외하고 origin+pathname만 전송하도록 조정했다.
- 배포 후 이벤트 QA에서 Mixpanel 기본 `$current_url`이 전체 query string을 싣는 문제를 확인해 `property_blacklist`로 제거했다.
- 사용자 요청에 따라 입력 물품 키워드를 `item_search_keyword`로 추가했다. 전화번호와 이메일은 마스킹하고, 공백 정리와 길이 제한을 적용했다.
- 수정 후 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`를 다시 통과했다.

## 완료 기준

- [x] Mixpanel SDK가 `NEXT_PUBLIC_MIXPANEL_TOKEN` 또는 기존 public token fallback 기반으로 로드된다.
- [x] 화면 진입/선택/결과/CTA/피드백 이벤트가 기존 taxonomy 형식으로 전송된다.
- [x] `npm run lint`, `npm test`, `npm run typecheck`, `npm run build`가 통과한다.
