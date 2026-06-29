# AI Productivity Scan Batch 플랜

> 유형: 플랜
> 작성일: 2026-04-17
> 상태: 완료

## 목표

- `AI생산성` 채널 아이디어 스캔을 로컬 훅이 아니라 `covering-labs` 정식 batch로 옮긴다.
- 후보는 자동 적용하지 않고 `wjh 승인 대기` 상태로만 누적한다.

## 현황 분석

- 기존 구현은 `~/.codex/hooks.json` SessionStart에 붙은 로컬 자동화였다.
- 이 방식은 노트북 세션/훅 상태에 의존해서 운영 배치로 보기 어렵고, `covering-labs PR 원칙`에도 맞지 않는다.
- 이미 로컬에서 후보 분류 로직과 registry 포맷은 검증됐다.

## 구현 계획

### 단계별 작업

1. 로컬 SessionStart 자동 실행 경로가 남아 있지 않은지 다시 확인하고, 남은 수동 진입점도 배치 이관 안내로 막는다.
2. `covering-labs/apps/ai-productivity-scan-batch`를 batch 앱으로 추가한다.
3. Slack 채널 스캔 → 후보 분류 → `approval pending` registry/report 생성 흐름을 앱 안으로 옮긴다.
4. README와 deploy 설정을 추가해 PR 가능한 형태로 정리한다.
5. 작업 문서와 검증 기록을 `covering-labs 이관 완료` 기준으로 갱신한다.

## 작업 계약

- 이번에 끝낼 범위: 로컬 배치 진입점 정리, `covering-labs` batch 앱 생성, 승인 대기 registry/report 생성, 문서/검증 갱신
- 이번에 하지 않을 범위: 실제 PR 생성/머지, 서버 스케줄 운영값 조정, Slack 알림 발송 추가, problem discovery 추가 확장
- Done 판단: 로컬 경로는 더 이상 운영 경로가 아니고, `covering-labs/apps/ai-productivity-scan-batch`에서 같은 결과물을 직접 만들 수 있는 상태
- 실제 확인 방법: 앱 dry-run/full run, 생성된 `data/*.json|md` 확인, 로컬 훅 진입점 비활성화 확인
- 주요 리스크: Slack 토큰 권한, 기존 dirty worktree, 서버 cron 시간대는 아직 운영값 확정 전

## 변경 파일

- `apps/ai-productivity-scan-batch/*`
- `works/plan/2026-04-17-covering-labs-ai-productivity-scan-batch.md`
- `~/.codex/hooks/ai-productivity-daily-scan.sh`
- `work-dashboard-app/task-state/OPS-2601.linear.md`
- `work-dashboard-app/task-state/OPS-2601.task-state.md`

## 완료 기준

- 로컬 훅이 더 이상 일일 스캔의 운영 경로가 아니다.
- `covering-labs/apps/ai-productivity-scan-batch` 안에서 배치가 직접 실행 가능하다.
- 생성 산출물에 `wjh 승인 대기`가 명시된다.
- 변경 사항이 PR 가능한 diff로 정리된다.
