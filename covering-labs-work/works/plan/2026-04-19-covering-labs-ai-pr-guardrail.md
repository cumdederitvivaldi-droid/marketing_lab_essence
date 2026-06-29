# AI PR 가드레일 — 이슈 사전 차단율 트래킹

> 유형: 플랜
> 작성일: 2026-04-19
> 상태: 확정

날짜: 2026-04-19
목표: 이슈 사전 차단율 80% 이상 유지

## 구성 요소
1. GitHub 라벨 체계
2. PR 템플릿 업데이트
3. GitHub Actions (3개)
4. 주간 Slack 리포트

## 라벨 정의
- ai-generated: AI가 코드를 생성한 PR
- ai-assisted: AI 보조로 작성한 PR
- no-ai: AI 미사용 PR
- critical-detected: 리뷰봇이 크리티컬 이슈 탐지
- pre-merge-fixed: critical-detected 후 merge 전 수정 완료
- post-release-fix: merge 후 후속 수정 PR (원인 PR 링크 필수)
- hotfix: 장애 대응 핫픽스 (원인 PR 링크 필수)

## 측정 방식
weekly-blocking-report Action이 매주 월요일 집계:
- 차단된 PR: critical-detected + pre-merge-fixed 라벨 보유 + 48h 이내 후속 없음
- 미차단된 PR: post-release-fix/hotfix 라벨 보유 PR이 가리키는 원인 PR
