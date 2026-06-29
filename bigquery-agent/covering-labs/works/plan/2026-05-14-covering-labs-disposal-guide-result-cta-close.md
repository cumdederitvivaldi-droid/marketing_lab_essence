# Disposal Guide Result CTA Close Plan

> 유형: 플랜
> 작성일: 2026-05-14
> 상태: 검토중

## 목표

ENG-3061 QA 추가 이슈 중 결과 화면 CTA 동작을 정정한다. 대형 커버링 봉투와 일반 커버링 봉투 추천 결과에서는 CTA 라벨과 운영 설정은 유지하면서, CTA 클릭 시 봉투 신청 URL이 아니라 현재 페이지 또는 웹뷰 종료 동작을 실행한다.

## 현황 분석

- 현재 결과 화면 CTA는 `ResultScreen`의 `BottomBar` 클릭에서 부모 `onCta`를 호출한다.
- 부모 `onCta`는 방문수거면 카카오톡 견적 URL, 봉투 추천이면 봉투 신청 URL을 새 창으로 연다.
- 부모 `onCta` 안에서 이미 CTA 클릭 이벤트를 추적하므로, 방문수거 경로에서 `ResultScreen`이 같은 이벤트를 다시 보내면 중복 추적이 생긴다.
- 모바일 키패드 노출 시 BottomBar 위치 이상은 인앱 WKWebView 실측이 먼저 필요하다. 이번 PR에서는 사용자 지정 범위에 따라 BottomBar와 keyboard offset 코드는 변경하지 않는다.

## 구현 계획

### 단계별 작업

- [x] `ResultScreen.tsx`의 종료 유틸을 `src/lib/closeDisposalGuide.ts`로 분리하고, `history.back` fallback을 제거한다.
- [x] CTA 클릭 핸들러를 추가해 `VISIT_PICKUP`은 기존 `onCta` 호출을 유지한다.
- [x] `LARGE_COVERING_BAG`, `GENERAL_BAG_MULTIPLE`, `GENERAL_BAG_SINGLE`은 클릭 이벤트를 추적한 뒤 종료 유틸을 호출한다.
- [x] CTA 라벨, Supabase copy, 부모 `onCta` prop 시그니처, BottomBar 컴포넌트는 변경하지 않는다.
- [x] typecheck, lint, test, build를 실행한다.
- [x] PR 본문에 키패드 이슈는 별도 실측 필요로 남기고, 결과 CTA 변경 검증 범위를 명시한다.

## 완료 기준

- 방문수거 추천 CTA는 기존 카카오톡 견적 URL 동작을 유지한다.
- 대형 봉투와 일반 봉투 추천 CTA는 RN WebView 환경에서 `{ type: "close" }` 메시지를 보낸다.
- RN WebView가 아니어도 브라우저 history를 뒤로 보내지 않고, 마지막 fallback으로 `window.close()`만 호출한다.
- 결과 CTA 라벨과 운영 copy 데이터는 변경되지 않는다.

## 검증 결과

- `npm run typecheck` 통과.
- `npm run lint` 통과.
- `npm test -- --runInBand` 통과. 13개 suite, 159개 test 통과.
- `npm run build` 통과.
- WebKit 로컬 QA에서 `GENERAL_BAG_SINGLE`, `GENERAL_BAG_MULTIPLE`, `LARGE_COVERING_BAG` CTA 클릭 시 RN WebView 메시지 `{ "type": "close" }` 발송 확인.
- WebKit 로컬 QA에서 `VISIT_PICKUP` CTA 클릭 시 기존 URL `https://abr.ge/7sx2me` open 호출 확인.

## 2026-05-15 운영 배포 후 회귀 수정

- 운영 배포본 JS에 `history.back` fallback이 포함되어 있어, 앱 WebView에서 봉투 신청 CTA 클릭 시 웹뷰 닫힘 대신 설문 이전 단계로 이동하는 증상이 확인됐다.
- `closeDisposalGuide`에서 history fallback을 제거하고 RN WebView close message와 `window.close()`만 실행하도록 변경했다.
- `src/lib/closeDisposalGuide.test.ts`를 추가해 native bridge 유무와 관계없이 `history.back()`을 호출하지 않는 조건을 고정했다.
- 검증: `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, `npm run build` 통과.
- WebKit 실제 흐름 검증: 일반 봉투 CTA는 native close message 1회, `window.close()` 1회, `history.back()` 0회, `window.open()` 0회. 방문수거 CTA는 `https://abr.ge/7sx2me` open 1회, close 0회, `history.back()` 0회.

## 2026-05-15 QA 보고

- 운영 URL `https://public-labs.covering.app/disposal-guide/` JS 번들에서 `history.back`이 확인됐다.
- 운영 URL WebKit QA: native bridge 없는 조건에서 일반 봉투 CTA 클릭 시 `history.back()` 1회, `window.close()` 0회, 결과 화면 이탈 후 `예상 무게를 알려주세요` 단계로 이동했다.
- 운영 URL WebKit QA: native bridge 있는 조건에서는 `{ "type": "close" }` message 1회, `history.back()` 0회였다.
- 수정본 로컬 프로덕션 빌드 WebKit QA: native bridge 없는 조건에서 일반 봉투 CTA는 `window.close()` 1회, `history.back()` 0회, `window.open()` 0회였다.
- 수정본 로컬 프로덕션 빌드 WebKit QA: native bridge 있는 조건에서 일반 봉투 CTA는 `{ "type": "close" }` message 1회, `window.close()` 1회, `history.back()` 0회였다.
- 수정본 로컬 프로덕션 빌드 WebKit QA: 방문수거 CTA는 기존 `https://abr.ge/7sx2me` open 1회, `window.close()` 0회, `history.back()` 0회였다.

## 2026-05-15 앱 WebView 닫기 호환 수정

- 운영 배포 후 실제 앱 QA에서 봉투 추천 CTA가 여전히 화면을 종료하지 않는다고 확인됐다.
- 원인 판단: 웹 history fallback은 제거됐지만 실제 앱 WebView가 `{ "type": "close" }` 단일 메시지를 처리하지 않는 계약일 가능성이 높다. 현재 GitHub org와 로컬 저장소에는 네이티브 앱 WebView handler 코드가 없어 앱 계약을 직접 확인하지 못했다.
- 변경: `closeDisposalGuide`가 RN `postMessage`, iOS WebKit `messageHandlers`, Flutter InAppWebView `callHandler`, iframe parent `postMessage`, `window.close()`를 순서대로 시도한다.
- RN 메시지는 `{ type, action, event, command }`를 한 메시지에 담고, `CLOSE_WEBVIEW`, `closeWebView` type fallback을 80ms 간격으로 보낸다.
- 검증: `npm test` 13개 suite, 161개 test 통과. `npm run typecheck` 통과. `npm run build` 통과.
- WebKit 로컬 QA: 일반 봉투 결과 CTA 클릭 시 RN 메시지 3종, WebKit handler 2종, Flutter handler 5종, `window.close()` 1회, `history.back()` 0회 확인.
- peer 리뷰 요청은 Codex bridge가 `status: failed`로 응답해 완료하지 못했다.

## 2026-05-15 운영 배포 및 운영 QA

- PR: https://github.com/covering-app/covering-labs/pull/274
- 머지 커밋: `b9bda85d7172ebcc3a0f6278668af67401df038f`
- 배포 런: https://github.com/covering-app/covering-labs/actions/runs/25909966775
- 배포 결과: success. `Deploy Disposal Guide Blue/Green` 완료.
- 운영 JS 번들: `CLOSE_WEBVIEW`, `closeWebView`, `flutter_inappwebview`, `ReactNativeWebView` 포함 확인. `history.back` 미포함 확인.
- 운영 WebKit QA: 일반 봉투 결과 CTA 클릭 시 RN 메시지 3종, WebKit handler 7종, Flutter handler 5종, `window.close()` 1회, `history.back()` 0회 확인.
- 교차 리뷰: CodeRabbit이 초기 테스트 보강을 요구했고, fallback timer 테스트 보강 후 최신 커밋을 승인했다. Codex peer bridge는 재시도해도 `status: failed`로 종료됐다.

## 2026-05-15 직접 URL 무반응 후속 수정

- 사용자가 운영 URL을 일반 브라우저에서 직접 열어 QA하면 CTA 클릭 후 아무 반응이 없다고 확인했다.
- 원인: 일반 브라우저에는 닫을 앱 WebView가 없고, 사용자가 직접 연 탭의 `window.close()`는 브라우저가 막는다. 따라서 native bridge가 없는 환경에서는 시각적 반응이 없었다.
- 변경: 봉투 추천 CTA는 native close bridge를 먼저 보내고, 화면이 닫히지 않는 환경을 위해 350ms 뒤 기존 봉투 신청 Airbridge 링크 `https://abr.ge/wn79bl`로 이동한다.
- 기대 동작: 앱에서 native close가 처리되면 기존처럼 화면이 닫힌다. native close가 없거나 일반 브라우저에서 직접 연 경우에는 봉투 신청 링크로 이동해 무반응 상태를 피한다.
- 검증: `npm test -- --runTestsByPath src/lib/closeDisposalGuide.test.ts` 6개 테스트 통과. `npm run typecheck` 통과. `npm test` 13개 suite, 162개 test 통과. `npm run build` 통과.
- WebKit local production QA: 직접 URL 환경에서 일반 봉투 결과 CTA 클릭 후 `https://abr.ge/wn79bl` fallback이 동작했고 최종 `https://www.covering.app/...short_id=wn79bl...`로 이동했다.
