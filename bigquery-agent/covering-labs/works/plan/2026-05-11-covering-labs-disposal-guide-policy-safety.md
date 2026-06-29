# 링퀴즈 추천 정책 안정화 플랜

> 유형: 플랜
> 작성일: 2026-05-11
> 상태: 검토중

## 목표

Vercel preview QA 전에 링퀴즈 추천 정책을 운영자가 검증할 수 있는 형태로 고정하고, Supabase 추천 설정을 켜더라도 부분 데이터나 잘못된 룰이 조용히 고객 추천으로 나가지 않게 한다.

## 현황 분석

- 운영 URL은 정상 serving 중이다.
- 현재 운영 데이터 원천은 `fallback`이다. Supabase 마이그레이션/시드가 추천 원천으로 활성화된 상태가 아니다.
- 기존 테스트는 현재 구현 의도는 검증하지만, PO가 볼 수 있는 정책 matrix와 DB 활성화 전 preflight는 없다.
- 수거불가 키워드에서 `수은` 같은 generic keyword가 `수은등` 같은 수거 가능/주의 품목을 차단할 가능성이 있다.

## 구현 계획

### 이번 PR 범위

- 추천 결과 trace 추가. 기존 `recommend()` 동작은 유지한다.
- PO/QA용 policy matrix fixture와 생성 스크립트를 추가한다.
- 수거불가 키워드 false-positive를 테스트와 함께 보정한다.
- Supabase config strict validation, sanitized diagnostics, deploy preflight/gate를 추가한다.
- 운영 Supabase 활성화는 이번 PR에서 하지 않는다.

### 제외 범위

- 운영 DB 마이그레이션 실행
- Supabase env 활성화
- production nginx 전환
- 운영 데이터 row 수정

## 완료 기준

- 완료: `npm test -- --runInBand` 통과
- 완료: `npm run typecheck` 통과
- 완료: `npm run lint` 통과
- 완료: `npm run build` 통과
- 완료: `npm run policy:matrix` 실행 가능
- 완료: `npm run validate:config`가 default/fallback 상태에서 통과
- 완료: strict invalid 케이스가 테스트에서 실패 처리됨
- 남음: Vercel preview URL에서 사용자 주요 흐름 QA

## QA 기준

- 일반 쓰레기 단독은 방문수거로 가지 않는다.
- 가전/가구 25kg 이상 또는 혼자 들기 어려움은 방문수거로 간다.
- 이불/의류/잡화 단독은 나눠 담기 가능한 경우 일반 봉투 여러 장으로 간다.
- 150cm 초과는 방문수거로 간다.
- 수은등, 형광등, LED등, 전구, 건전지, 보조배터리는 수거불가 모달로 차단되지 않는다.
- 수은, 수은체온계, 수은 온도계, 폐수은은 수거불가 모달로 차단된다.
- 전구/배터리 같은 수거 가능 품목이 섞여 있어도 폐페인트, 폐유, 수은 같은 수거불가 키워드는 차단된다.

## 변경 파일

- `apps/public/disposal-guide/src/logic/recommend.ts`: 추천 trace 추가. 기존 `recommend()` 결과는 유지한다.
- `apps/public/disposal-guide/src/logic/policyMatrix.ts`: QA용 추천 정책 matrix 정의.
- `apps/public/disposal-guide/src/logic/__fixtures__/policy-matrix.approved.json`: 현재 승인 기준 추천 결과 fixture.
- `works/reports/2026-05-11-covering-labs-disposal-guide-policy-matrix.md`: PO/QA 확인용 추천 정책 리포트.
- `apps/public/disposal-guide/src/data/hazardousKeywords.ts`: 수거 가능/주의 품목 false-positive 보정.
- `apps/public/disposal-guide/src/lib/guideConfigValidation.ts`: Supabase config strict 검증과 checksum 생성.
- `apps/public/disposal-guide/src/lib/loadHazardousKeywords.ts`: hazardous keyword source를 `sheet`/`fallback`으로 명시 반환.
- `apps/public/disposal-guide/src/lib/loadGuideConfig.ts`: 기본 모드, optional 모드, strict 모드 분리.
- `apps/public/disposal-guide/app/api/diagnostics/route.ts`: 비밀값 없는 diagnostics JSON 추가.
- `apps/public/disposal-guide/scripts/validate-guide-config.ts`: 배포 전 config preflight.
- `apps/public/disposal-guide/scripts/generate-policy-matrix.ts`: 정책 matrix fixture/report 생성.
- `scripts/deploy-disposal-guide-bluegreen.sh`: `.env` export, config preflight, candidate/external diagnostics checksum gate 추가.

## 검증 결과

- `npm test -- --runInBand`: 5 suites, 109 tests 통과
- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm run validate:config`: default/fallback 상태 통과
- `GUIDE_CONFIG_MODE=supabase_strict` + Supabase env 없음: exit 1 확인
- `npm run policy:matrix`: fixture/report 생성 성공
- `npm run build`: 통과
- `bash -n scripts/deploy-disposal-guide-bluegreen.sh`: 통과
- `git diff --check`: 통과
- local production server: `/disposal-guide` 200, `/disposal-guide/api/diagnostics` 200 확인

## Peer 재검토 반영

- strict mode에서 choice step별 1개 이상만 보던 검증을 필수 choice id 전체 존재 검증으로 강화했다.
- 중복 choice id를 strict invalid로 처리한다.
- `validate:config` preflight checksum을 파일로 남기고, candidate diagnostics checksum과 비교한다.
- nginx 전환 후 external diagnostics checksum도 preflight checksum과 비교한다.
- 유해 키워드 QA에 `수은 들어간 전구`, `수은전지`, `단추형전지`, `깨진 형광등`, `보조배터리와 수은체온계`를 추가했다.

## CodeRabbit 후속 QA 반영

- diagnostics API는 60초 TTL 캐시를 우회해 요청마다 fresh diagnostics를 읽는다.
- 유해 키워드는 전구/배터리 예외가 다른 수거불가 키워드를 덮지 않게 순서를 바꿨다.
- `수은등`, `수은전지`, `수은 들어간 전구`는 계속 허용하지만 `수은과 전구`는 차단한다.
- 추천 rule id 중복은 strict invalid로 처리한다.
- hazardous CSV URL이 있어도 실제 usable row가 없으면 source를 `fallback`으로 보고한다.
- 침구류와 가전/가구가 섞인 heavy unknown split fallback은 나눠 담기 가능으로 보지 않는다.
