# 링퀴즈 최신 main 합본 QA Preview 작업 계약

> 유형: 작업 계약
> 작성일: 2026-05-12
> 상태: 검토중

## 목표

최신 `origin/main`에 이미 머지된 PR #226 피드백 Supabase·Slack 백엔드 구현을 보존하면서, PR #222의 클라이언트 UX 개선과 PR #225의 추천 정책 안정화 변경을 한 브랜치에 통합한다. Vercel preview에서 PO가 추천 정책, 피드백 다이얼로그, 키보드 대응, diagnostics를 한 번에 QA할 수 있게 만든다.

## 병합 판단

- PR #226이 `origin/main`에 먼저 머지되어 `app/api/feedback/route.ts`, `src/lib/feedback.ts`, `src/server/feedback.ts`, `feedback.test.ts`, Supabase 마이그레이션이 이미 존재한다.
- PR #222를 그대로 merge하면 PR #226의 백엔드 파일을 삭제하거나 구버전 API로 되돌리는 위험이 있다.
- 따라서 최신 main에서 새 브랜치를 만들고, PR #225 정책 변경은 cherry-pick, PR #222는 클라이언트 UX 파일만 선별 반영한다.
- 피드백 다이얼로그 텍스트는 `message` 필드로 백엔드 payload, Supabase row, Slack 메시지에 연결한다.

## 완료 기준

- 최신 main 기반 브랜치에서 `npm test -- --runInBand` 통과
- `npm run typecheck` 통과
- `npm run lint` 통과
- `npm run build` 통과
- Vercel preview `target=preview`, `status=Ready`
- `/disposal-guide` HTTP 200
- `/disposal-guide/api/diagnostics` `ok=true`
- 피드백 API는 Supabase env가 없으면 성공처럼 보이지 않고 inline 실패 상태를 보여준다.
- 피드백 선택 후 상태 문구는 보조기기에서 읽히고, 다이얼로그를 닫으면 오탭을 다시 선택할 수 있다.

## 운영 전 주의

- `20260511000000_disposal_guide_feedback.sql` 적용 후 `20260512000000_disposal_guide_feedback_message.sql`도 적용해야 텍스트 의견 저장이 가능하다.
- Vercel preview에서 Supabase/Slack E2E를 검증하려면 preview env에 `SUPABASE_URL` 또는 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 선택적으로 `SLACK_BOT_TOKEN`이 필요하다.
- 운영 blue/green 배포는 `/shared/.env`의 Supabase 설정과 `disposal_guide_feedback.message` 컬럼을 REST `limit=0` 조회로 확인한 뒤에만 nginx 전환을 진행한다.

## 2026-05-12 최종 검증

- #226 머지 커밋 `3b75c18`은 #228 브랜치의 조상으로 확인했다.
- `npm test -- --runInBand`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run validate:config`, `bash -n scripts/deploy-disposal-guide-bluegreen.sh`를 통과했다.
- 운영 배포는 PR #228 머지 후 `Deploy Disposal Guide Blue/Green` 워크플로우에서만 진행한다.
