# Disposal Guide Analytics Fix Plan

> 유형: 플랜
> 작성일: 2026-05-14
> 상태: 완료

## 목표

Ringquiz/disposal-guide 운영 QA에서 확인된 Mixpanel browser CORS 오류를 제품 기능과 분리해 해결하고, 핵심 이벤트 계측이 안정적으로 전송되는지 검증한다.

## 현황 분석

- 운영 기능 QA는 통과했지만 WebKit 콘솔에서 `api-js.mixpanel.com/track` access-control 오류가 1건 감지됐다.
- 현재 `mixpanel-browser`가 브라우저에서 Mixpanel endpoint로 직접 전송한다.
- 이벤트 계측은 route, step click, result view, feedback action, hazardous modal에 분산돼 있다.

## 구현 계획

### 단계별 작업

- [x] Mixpanel 전송을 same-origin API proxy로 우회해 브라우저 CORS 오류를 제거한다.
- [x] analytics 초기화 설정과 proxy route 테스트를 추가한다.
- [x] 검색어 로그 endpoint를 server-side service role insert 방식으로 추가한다.
- [x] 검색어 redaction/길이 제한/invalid payload 테스트를 추가한다.
- [x] 이벤트 계측 목록을 확인하고 누락/중복 위험을 점검한다.
- [x] 로컬 테스트, typecheck, build를 수행한다.
- [x] WebKit 운영 또는 로컬 smoke QA를 수행한다.
- [x] peer 검토 후 PR/배포 필요 여부를 보고한다.

## 변경 파일

- `apps/public/disposal-guide/src/lib/analytics.ts`: Mixpanel `api_host`를 `/api/mixpanel`로 변경하고 track route만 사용.
- `apps/public/disposal-guide/app/api/mixpanel/[...route]/route.ts`: Mixpanel track/engage 전용 same-origin proxy 추가.
- `apps/public/disposal-guide/src/lib/itemSearchKeyword.ts`: 검색어 normalization/redaction 공용 함수 추가.
- `apps/public/disposal-guide/src/lib/itemSearchEvents.ts`: 브라우저 검색어 로그 payload 생성 및 API 호출 추가.
- `apps/public/disposal-guide/src/server/itemSearchEvents.ts`: 서버 측 payload validation과 Supabase insert 추가.
- `apps/public/disposal-guide/app/api/item-search-events/route.ts`: 검색어 로그 API 추가.
- `apps/public/disposal-guide/supabase/migrations/20260514000000_disposal_guide_item_search_events.sql`: 검색어 로그 테이블 생성/보강 및 anon/authenticated 권한 회수.
- `apps/public/disposal-guide/README.md`, `.env.example`: 운영 env와 이벤트/검색어 로그 문서화.
- 테스트: `analytics.test.ts`, `itemSearchKeyword.test.ts`, `itemSearchEvents.test.ts`, `app/api/mixpanel/[...route]/route.test.ts`.

## 검증 결과

- `npm test -- --runInBand`: 통과, 10 suites / 133 tests
- `npm run typecheck`: 통과
- `npm run build`: 통과
- WebKit local smoke: 통과. `api-js.mixpanel.com` 직접 요청 없음, `/api/mixpanel/track`/`engage`만 사용, `item_search_keyword`는 email/phone redaction 후 전송 확인.
- peer 2차 검토: 우려 없음. 운영 배포 후 Supabase row 생성, raw email/phone 미저장, grants/policies 확인 필요.

## 완료 기준

- `npm test -- --runInBand`, `npm run typecheck`, `npm run build` 통과
- analytics track 요청이 same-origin `/api/mixpanel/track`으로 향함
- proxy route가 request body/query를 Mixpanel upstream으로 전달하고 실패해도 제품 흐름을 막지 않음
- 이벤트 계측 상태와 남은 caveat를 Linear/사용자에게 보고
