# 대형 커버링봉투 covering-labs 이관 플랜

> 유형: PRD | 플랜
> 작성일: 2026-04-22
> 상태: 완료

## Linear Source

- 이슈: `ENG-2656`
- 링크: `https://linear.app/covering/issue/ENG-2656/대형-커버링봉투-covering-labs-public-앱-이관-및-6개-airbridge-링크-발급`
- 담당: 함정훈

## 목표

- 개인 Vercel에 있던 대형 커버링봉투 신청 페이지를 `covering-labs` 앱으로 이관한다.
- 카카오 웹뷰에서 막히던 주소 검색 동작까지 포함해, 방금 복구한 버전만 그대로 옮긴다.
- 배포 후 6개 Airbridge 딥링크를 모두 새 `public-labs.covering.app` 주소로 바꿀 수 있는 기준을 만든다.

## 왜 지금

- 개인 Vercel URL은 운영 진입점으로 계속 쓸 수 없고, 앱 배너/버튼에서 직접 유입시키려면 `covering-labs`의 자동 배포 경로로 옮겨야 한다.
- 대형봉투 랜딩은 이미 카카오 웹뷰 주소 검색 장애를 한 번 복구한 상태라서, 지금 소스가 아니면 같은 문제가 다시 난다.

## 고객 근거

- 클라이언트는 실제 앱 웹뷰에서 열리는 운영 URL과 6개 Airbridge 딥링크를 요구했다.
- 주소 입력 클릭 시 검색 페이지로 진행되지 않는 장애가 있었고, 이 복구 버전만 써야 한다는 제약이 명확하다.

## 현황 분석

- 기존 개인 Vercel 앱은 주소 검색 팝업 의존을 제거한 상태가 최신 source of truth다.
- `covering-labs/products/figma-26q2`는 이 수정이 반영되지 않았고 자동 배포 대상도 아니다.
- `covering-labs`의 현재 작업트리는 다른 변경이 많이 섞여 있어 clean clone에서 새 앱으로 이관해야 한다.
- `covering-labs` 자동 배포는 `apps/private/**`, `apps/public/**`만 감지한다. 루트 `apps/[앱]`는 배포 대상이 아니다.
- 최종 유입 URL은 일반 사용자 진입이므로 `apps/public/large-coveringbag-order`와 `https://public-labs.covering.app/large-coveringbag-order/`를 써야 한다.
- `public-labs.covering.app`도 앱 이름을 basePath로 쓰므로, 정적 자산과 `/api/*` 호출을 그대로 가져오면 깨진다.

## 구현 계획

### 단계별 작업

- [x] clean clone 준비
- [x] 작업 문서 생성
- [x] `apps/public/large-coveringbag-order` Next.js 앱 생성
- [x] 대형봉투 화면/자산/애널리틱스 이관
- [x] Google Sheets API를 GCP 기본 인증 방식으로 재구현
- [x] basePath 대응 검증
- [x] 로컬 build/lint 통과
- [x] 배포 브랜치/PR 준비
- [ ] 6개 Airbridge 링크 발급

## 작업 계약

- In scope:
  - 대형 커버링봉투 랜딩, 신청, 완료 흐름
  - 주소 검색 embed 레이어 방식 유지
  - 동일한 Google Sheet 저장 계약 유지
  - `https://public-labs.covering.app/large-coveringbag-order/` 기준 링크/쿼리 계약 유지
- Out of scope:
  - referral 화면 이관
  - 개인 Vercel 종료 실행
  - 소비 지면 앱 연결 수정
- Done means:
  - 로컬에서 `build`, `lint`가 통과하고, 배포 가능한 앱 폴더가 clean clone에 생긴다.
  - PR이 배포 가능한 위치와 형식으로 열리고, 같은 랜딩을 가리키는 6개 Airbridge 링크를 발급할 수 있다.
- Verification:
  - 주소 입력 클릭 -> 검색 레이어 노출 -> 주소 선택 -> 값 반영
  - 신청 저장 API 정상 응답
  - `source/surface/banner_id/campaign` query 유지
- Risks:
  - 카카오 웹뷰 QA는 실제 클라이언트 환경에서 마지막 확인이 필요하다.
  - public VM의 런타임 권한이 local/GCP 기본 인증과 다르면 배포 후 시트 API 추가 확인이 필요하다.

## 버린 대안

- `covering-labs/products/figma-26q2` 재사용: 자동 배포 대상이 아니어서 버렸다.
- `apps/large-coveringbag-order` 루트 경로 유지: workflow가 감지하지 않아 버렸다.
- 개인 Vercel URL 유지: 운영 딥링크와 종료 조건에 맞지 않아 버렸다.

## 운영 기준

- Owner: 함정훈
- Due: 04/22
- Readout date: 04/22
- Kill criteria:
  - public 배포 후 주소 검색 embed가 웹뷰에서 열리지 않으면 개인 Vercel 종료를 보류한다.
  - 6개 지면 중 하나라도 새 Airbridge 링크로 목적지 query가 유지되지 않으면 컷오버하지 않는다.

## AI 활용 계획

- AI로 기존 Vite 앱을 Next.js public 앱 구조로 빠르게 이관한다.
- AI로 PR/작업 문서/링크 파라미터 표를 정리하되, 배포 경로와 실제 외부 URL은 workflow/스크립트로 재검증한다.

## 변경 파일

- `apps/public/large-coveringbag-order/app/*`
- `apps/public/large-coveringbag-order/src/*`
- `apps/public/large-coveringbag-order/public/assets/*`
- `apps/public/large-coveringbag-order/public/fonts/*`
- `apps/public/large-coveringbag-order/package.json`
- `apps/public/large-coveringbag-order/next.config.js`
- `works/plan/2026-04-22-covering-labs-large-coveringbag-order.md`

## 현재 구현 상태

- `large-coveringbag-order` Next.js 앱 골격과 deploy 설정을 생성했다.
- 기존 대형봉투 랜딩/신청/완료 화면을 옮기고 `basePath` 대응용 자산/`api` helper를 넣었다.
- Google Sheets 저장/최근 7일 중복 차단 로직을 `google-auth-library` 기반 GCP 기본 인증 방식으로 옮겼다.
- deploy workflow가 `apps/public/**`만 감지하는 것을 확인하고 앱을 `apps/public/large-coveringbag-order`로 옮겼다.
- Linear `ENG-2656`를 생성하고 현재 작업 기준으로 묶었다.
- PR `#107`을 열고 AI guardrail 본문까지 통과시켰다.
- CodeRabbit 머지 차단으로 남은 `check-recent` JSON 400 분기, `submit` append 전환, `Disposal` 미구현 UI disabled 처리, 오탈자 2건, sheets 조회 예외 변환을 04/23에 반영했다.
- `submit` API의 Google Sheets append 호출도 04/23에 다시 감싸서 fetch/json 예외를 `502`로 분류하도록 보강했다.
- 로컬 검증 기준으로 production build와 lint는 모두 통과했다.

## Airbridge Links

| surface | abr.ge | fallback URL |
|---|---|---|
| `home_popup` | `https://abr.ge/mspb8b` | `https://public-labs.covering.app/large-coveringbag-order/?source=large_coveringbag_order&surface=home_popup&banner_id=large_coveringbag_home_popup_v2&campaign=large_coveringbag_order_cutover_20260422` |
| `home_carousel` | `https://abr.ge/ov8nl2` | `https://public-labs.covering.app/large-coveringbag-order/?source=large_coveringbag_order&surface=home_carousel&banner_id=large_coveringbag_home_carousel_v2&campaign=large_coveringbag_order_cutover_20260422` |
| `benefit_banner` | `https://abr.ge/j2sud1` | `https://public-labs.covering.app/large-coveringbag-order/?source=large_coveringbag_order&surface=benefit_banner&banner_id=large_coveringbag_benefit_banner_v2&campaign=large_coveringbag_order_cutover_20260422` |
| `home_purchase_button` | `https://abr.ge/glq1tr` | `https://public-labs.covering.app/large-coveringbag-order/?source=large_coveringbag_order&surface=home_purchase_button&banner_id=large_coveringbag_home_purchase_button_v1&campaign=large_coveringbag_order_cutover_20260422` |
| `item_bottom_sheet_new_user` | `https://abr.ge/av1k12` | `https://public-labs.covering.app/large-coveringbag-order/?source=large_coveringbag_order&surface=item_bottom_sheet_new_user&banner_id=large_coveringbag_item_bottom_sheet_new_user_v1&campaign=large_coveringbag_order_cutover_20260422` |
| `item_bottom_sheet_existing_user` | `https://abr.ge/ii8vvsx` | `https://public-labs.covering.app/large-coveringbag-order/?source=large_coveringbag_order&surface=item_bottom_sheet_existing_user&banner_id=large_coveringbag_item_bottom_sheet_existing_user_v1&campaign=large_coveringbag_order_cutover_20260422` |

## 검증 기록

- `npm run build`
  - 결과: 통과
- `npm run lint`
  - 결과: 통과
- `cd apps/public/large-coveringbag-order && npm run build`
  - 결과: 04/23 follow-up 수정 후 재통과
- `cd apps/public/large-coveringbag-order && npm run lint`
  - 결과: 04/23 follow-up 수정 후 재통과
- `cd apps/public/large-coveringbag-order && npm run build`
  - 결과: 04/23 submit 502 분기 수정 후 재통과
- `cd apps/public/large-coveringbag-order && npm run lint`
  - 결과: 04/23 submit 502 분기 수정 후 재통과
- `PORT=3105 npm run start`
  - 결과: 서버 기동 성공
- `curl -I http://localhost:3105/large-coveringbag-order`
  - 결과: `200 OK`
- `curl -I http://localhost:3105/large-coveringbag-order/assets/bag-150l.svg`
  - 결과: `200 OK`

## 남은 일

- PR `#107`의 마지막 review/approve/merge 게이트를 통과시킨다.
- 머지 후 실제 공개 URL과 주요 흐름을 다시 검증한다.
- 실제 클라이언트 웹뷰 QA와 소비 지면 교체가 끝나면 개인 Vercel 종료 청크로 넘긴다.

## 완료 기준

- `large-coveringbag-order` 앱이 `covering-labs` 규칙에 맞는 public Next.js 앱으로 생성된다.
- 최신 주소 검색 복구 버전이 그대로 동작한다.
- 6개 Airbridge 링크가 새 공개 URL을 가리키고, 그 이후에만 개인 Vercel 종료 청크로 넘어간다.
