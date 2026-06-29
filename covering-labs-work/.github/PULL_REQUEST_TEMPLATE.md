## 📋 변경 내용 요약

<!-- 무엇을 변경했는지 간략하게 설명하세요 -->

## 🔧 변경 유형

- [ ] 신규 앱 추가 (`apps/[앱이름]/`)
- [ ] 기존 앱 기능 추가/수정
- [ ] 버그 수정
- [ ] 문서 업데이트
- [ ] 기타:

## 📁 변경된 앱 / 파일

- 앱 이름: `apps/`
- 주요 변경 파일:

## ✅ 배포 전 필수 확인

- [ ] `apps/_template/` 파일을 수정하지 않았습니다
- [ ] `.github/workflows/deploy.yml`, `scripts/` 파일을 수정하지 않았습니다
- [ ] `.gitignore` 파일을 수정하지 않았습니다
- [ ] API 키, 비밀번호, 토큰 등 민감 정보가 코드에 직접 입력되지 않았습니다
- [ ] `.env` 파일이 커밋에 포함되지 않았습니다
- [ ] batch 앱의 `deploy.yml`에 `schedule` 값에 인라인 주석(`#`)이 없습니다

## 🤖 CodeRabbit 리뷰

이 PR은 CodeRabbit이 자동으로 코드 리뷰를 진행합니다.
- 코멘트 없음 → 리뷰 확인 후 승인 → 머지 + 브랜치 삭제 + 자동 배포
- 코멘트 있음 → 미해결 대화(unresolved conversation) resolve 전까지 머지 차단

## 🤖 AI 사용 여부 (필수 선택)

- [ ] `ai-generated` — AI가 코드를 생성함
- [ ] `ai-assisted` — AI 보조로 작성함
- [ ] `no-ai` — AI 미사용

## 🚨 후속 수정 여부 (필수 선택 — 정확히 1개)

- [ ] `normal-change` — 일반 변경 PR
- [ ] `post-release-fix` — 배포 후 발견된 문제 수정 PR
- [ ] `hotfix` — 긴급 장애 대응 PR

## 🔗 후속 수정 PR인 경우 필수 입력

원인 PR: <!-- #PR번호 또는 일반 변경이면 N/A -->
문제 코드/파일: <!-- apps/foo/src/bar.ts, apps/foo/deploy.yml 또는 일반 변경이면 N/A -->
