# disposal-guide Supabase 이관 플랜

> 유형: Plan
> 작성일: 2026-05-06
> 상태: Complete

## 목표

`disposal-guide`의 추천 기준과 운영 키워드를 코드 고정값만으로 관리하지 않고 Supabase(PostgreSQL)에서 읽을 수 있게 만든다.

## 현황 분석

- 현재 추천 결과는 `src/logic/recommend.ts`의 결정 규칙으로 계산된다.
- 선택지와 기본 키워드는 `src/data/*.ts`에 정적 코드로 들어 있다.
- 폐의약품·유해 폐기물 키워드는 Google Sheets CSV를 선택적으로 읽고, 실패하면 코드 fallback을 사용한다.
- 행동 로그는 Mixpanel을 거쳐 BigQuery로 export된다.

## 구현 계획

### 단계별 작업

- [x] Supabase 테이블 마이그레이션과 초기 seed SQL을 추가한다.
- [x] Next.js 서버에서 Supabase REST API로 guide config를 읽는 loader를 추가한다.
- [x] 추천 규칙을 DB rule JSON으로 평가하되, 미설정/실패 시 기존 코드 fallback을 유지한다.
- [x] 선택지, 추천 문구, 금지 키워드를 DB config로 화면에 전달한다.
- [x] README에 Supabase 운영 방식과 환경변수를 문서화한다.
- [x] 기존 추천 테스트가 통과하는지 확인하고, DB rule fallback 테스트를 추가한다.
- [x] CodeRabbit 개선 요청 4건을 반영한다.

## 변경 파일

- `apps/public/disposal-guide/supabase/migrations/20260506000000_disposal_guide_config.sql`
- `apps/public/disposal-guide/supabase/seed.sql`
- `apps/public/disposal-guide/src/lib/loadGuideConfig.ts`
- `apps/public/disposal-guide/src/lib/loadGuideConfig.test.ts`
- `apps/public/disposal-guide/src/data/defaultGuideConfig.ts`
- `apps/public/disposal-guide/src/logic/recommend.ts`
- `apps/public/disposal-guide/src/logic/recommend.test.ts`
- `apps/public/disposal-guide/src/DisposalGuideApp.tsx`
- `apps/public/disposal-guide/src/screens/CategoryScreen.tsx`
- `apps/public/disposal-guide/src/screens/ResultScreen.tsx`
- `apps/public/disposal-guide/src/types.ts`
- `apps/public/disposal-guide/README.md`

## 검증

- `npm test -- --runInBand`: 74 passed
- `npm run typecheck`: passed
- `npm run build`: passed
- `npm run lint`: passed
- 임시 PostgreSQL 16에서 migration 적용, seed 적용, active priority unique index 확인, `SET ROLE anon` select 검증: choices 14, rules 12, result_copy 4, hazardous_keywords 81
- malformed Supabase rule이 catch-all로 승격되지 않고, 부분 Supabase 데이터에서 유해 키워드 시트 fallback이 유지되는지 Jest로 검증했다.

## 운영 적용 상태

- 코드 배포물은 Supabase 우선, 실패 시 기존 fallback으로 동작하게 준비했다.
- 회사 Supabase 적용은 아직 미완료다. 로컬에 남아 있던 covering-spot Supabase ref는 REST URL과 pooler 접속이 모두 활성 응답을 주지 않았다.
- 현재 로컬 Supabase CLI 계정은 회사 org가 아니라 개인 org만 보였으므로, 그쪽 프로젝트에는 테이블을 만들지 않았다.
- `covering-labs-public`의 `/shared/.env`에는 disposal-guide용 Supabase 환경변수가 없고, 현재 계정으로는 직접 수정 권한이 없다.

## 완료 기준

- Supabase schema/seed 파일만 적용하면 운영자가 추천 룰·선택지·키워드·결과 문구를 DB에서 관리할 수 있다.
- Supabase 환경변수가 없거나 조회가 실패해도 기존 앱 동작은 깨지지 않는다.
- `npm test -- --runInBand`, `npm run build`, `npm run typecheck`가 통과한다.
