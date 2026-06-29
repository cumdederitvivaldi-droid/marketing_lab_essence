# 링퀴즈 피드백 Supabase·Slack 연동 플랜

> 유형: 플랜
> 작성일: 2026-05-11
> 상태: 완료

## 목표

링퀴즈 결과 화면의 “만족해요/별로에요” 의견을 Supabase에 저장하고, 저장 성공 후 Slack `#제품팀_링퀴즈_피드백` 채널로 알림을 보낸다.

## 현황 분석

- 최신 기준 브랜치는 `origin/main`이고, 기존 로컬 작업트리는 오래된 main 기반 변경과 미추적 파일이 섞여 있어 배포 기준으로 사용하지 않는다.
- 실제 작업은 깨끗한 worktree `/Users/wjh/_worktrees/covering-labs-disposal-feedback-slack`의 `feat/disposal-guide-feedback-slack` 브랜치에서 진행한다.
- Slack 테스트 발송은 `C0B2TRG6DCK` 채널에 성공했고, 사용자가 도착을 확인했다.
- 운영 배포는 GitHub Actions 기반 PR merge 또는 manual blue/green workflow가 기준이다. SQL 마이그레이션과 `/shared/.env` 반영은 앱 배포와 별개로 확인해야 한다.

## 구현 계획

### 단계별 작업

1. 결과 화면 피드백 버튼에서 서버 API로 의견 payload를 전송한다.
2. 서버 API는 payload를 검증하고 Supabase `disposal_guide_feedback` 테이블에 저장한다.
3. 저장 성공 후 Slack `chat.postMessage`로 `#제품팀_링퀴즈_피드백`에 알림을 보낸다.
4. Slack 발송 결과를 같은 Supabase row에 `slack_status`, `slack_ts`, `slack_error`로 갱신한다.
5. 품목명 원문은 저장하지 않고 입력 여부와 글자 수만 남긴다.

## 완료 기준

- `npm test -- --runInBand` 통과
- `npm run typecheck` 통과
- `npm run lint` 통과
- `npm run build` 통과
- 피드백 API가 Supabase 미설정 시 503을 반환한다.
- mocked Supabase 경로에서 저장, Slack skip 또는 발송 상태 갱신이 확인된다.
- 운영 전에는 `20260511000000_disposal_guide_feedback.sql` 적용과 `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN` env 존재를 확인한다.

## 배포 판단

운영 배포 자체는 가능하지만, 앱 배포 전에 아래 조건이 필요하다.

- Supabase 운영 DB에 `disposal_guide_feedback` 마이그레이션 적용
- public VM `/shared/.env`에 Supabase service role key와 Slack bot token 반영
- 최신 `origin/main` 기반 브랜치에서 앱 테스트, 타입체크, 린트, 빌드 통과
- PR merge 또는 사용자 승인 후 manual blue/green workflow 실행

## 검증 결과

- `npm test -- --runInBand` 통과: 81 tests
- `npm run typecheck` 통과
- `npm run lint` 통과
- `npm run build` 통과
- 임시 로컬 PostgreSQL에서 `20260511000000_disposal_guide_feedback.sql` 적용 통과
- 임시 로컬 PostgreSQL에서 정상 feedback insert 통과, JSON whitelist 위반 insert 실패 확인
- Supabase 미설정 로컬 API 검증: `503 {"ok":false,"code":"supabase_not_configured"}`
- mock Supabase 저장 검증: `POST /rest/v1/disposal_guide_feedback` 후 `PATCH ...slack_status`
- Slack token 제거 검증: `200`, `slack.status = skipped_missing_config`
- Slack transport 실패 검증: `slack.status = failed`로 Supabase PATCH 확인
- Slack API `ok:false` 검증: `slack.status = failed`, `slack_error` PATCH 확인
- WebKit 화면 검증: 결과 화면에서 `만족해요` 클릭 후 `의견을 보내주셔서 감사합니다` 표시, mock Supabase POST/PATCH 확인
- PR 개선: CodeRabbit pre-merge docstring coverage warning 대응을 위해 피드백 payload/API/server 함수 JSDoc 보강

## 운영 적용 전 체크

- `supabase/migrations/20260511000000_disposal_guide_feedback.sql`을 운영 Supabase DB에 적용한다.
- public VM `/shared/.env`에 `SUPABASE_SERVICE_ROLE_KEY`와 `SLACK_BOT_TOKEN`이 있는지 확인한다.
- 현재 세션에서 VM `/shared/.env`는 권한 때문에 직접 읽지 못했다.
