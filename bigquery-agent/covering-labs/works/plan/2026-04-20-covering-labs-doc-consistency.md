# 문서 전수 조사 — 정합성 수정 플랜

> 유형: 플랜
> 작성일: 2026-04-20
> 상태: 완료 (2026-04-21)

## 목표

`docs/`, `CLAUDE.md`, `AGENTS.md`, `apps/AGENTS.md`, PR 템플릿 전체를 대상으로 정합성 불일치를 탐지하고 수정한다.

## 현황 분석

> **관측 시점: 2026-04-20 오전** — 아래 항목은 PR 작업 이전 관측된 불일치이며, 이 PR에서 모두 수정 완료되었습니다.

전수 조사 결과 5개 유형의 불일치 발견:

| # | 유형 | 영향 파일 | 심각도 |
|---|---|---|---|
| 1 | Codex → CodeRabbit 미반영 | CLAUDE.md, AGENTS.md, apps/AGENTS.md, docs/02, docs/08, PR 템플릿 | 높음 |
| 2 | GitHub Actions 배포 SA 오기재 | AGENTS.md | 높음 |
| 3 | 방화벽 상태 구버전 | docs/06, docs/07 | 중간 |
| 4 | VPN 필수 안내 누락 | docs/02, docs/08 | 중간 |
| 5 | docs/10 문서 인덱스 누락 | AGENTS.md, CLAUDE.md | 낮음 |

### 상세 내용

**[1] Codex → CodeRabbit**
- PR 리뷰어가 Codex → CodeRabbit으로 변경되었으나 다수 문서에 반영 안 됨
- .github/PULL_REQUEST_TEMPLATE.md도 main 브랜치 기준 미반영

**[2] GitHub Actions 배포 SA 오기재 (AGENTS.md)**
- 오기재: `covering-labs@covering-app-ccd23.iam.gserviceaccount.com` / `sa_113995973298337322457`
- 정답: `covering-labs-deploy@covering-app-ccd23.iam.gserviceaccount.com` / `sa_109369409955768144646`
- docs/04, docs/06, docs/07 모두 `sa_109369409955768144646`로 일치하므로 AGENTS.md가 오기재
- GCP_SA_KEY 설명도 `covering-labs` → `covering-labs-deploy` SA로 수정 필요

**[3] 방화벽 상태 구버전**
- docs/07 방화벽 섹션: `default-allow-http/https`를 `0.0.0.0/0 공개`로 표시 (2026-04-14 변경 기준)
- docs/06 nginx 섹션 주석: "방화벽은 공개(`0.0.0.0/0`)지만"
- 실제 현재 상태 (2026-04-17 저녁): VPN 전용으로 복구 완료 (L4+L7 이중 방어)

**[4] VPN 필수 안내 누락**
- docs/02 배포 완료 Slack 알림 섹션: "VPN 없이 접근 가능합니다"
- docs/08 배포 후 확인하기: "VPN 없이 바로 열립니다"
- 2026-04-17부터 VPN 필수이므로 틀린 정보

**[5] docs/10 인덱스 누락**
- docs/00 목차에는 있으나 AGENTS.md 문서 구조, CLAUDE.md 문서 인덱스에 없음

## 구현 계획

### 단계별 작업

- [x] PRD 작성
- [x] .github/PULL_REQUEST_TEMPLATE.md — Codex → CodeRabbit, 변경 성격 체크박스 추가
- [x] CLAUDE.md — Codex → CodeRabbit, docs/10 추가
- [x] AGENTS.md — Codex → CodeRabbit, 배포 SA 수정, docs/10 추가, GCP_SA_KEY 설명 수정
- [x] apps/AGENTS.md — Codex → CodeRabbit, SA ID 수정
- [x] docs/02_이용_가이드.md — Codex → CodeRabbit, VPN 필수 안내
- [x] docs/06_서버_관리.md — 방화벽 주석 수정
- [x] docs/07_인프라_관리.md — 방화벽 섹션 현행화, GitHub Actions SA 키 명령어 수정
- [x] docs/08_비개발자_가이드.md — Codex → CodeRabbit, VPN 필수 안내

## 완료 기준

- 전체 문서에서 "Codex 리뷰" 언급이 "CodeRabbit 리뷰"로 통일됨
- GitHub Actions 배포 SA가 `covering-labs-deploy@` / `sa_109369409955768144646`으로 통일됨
- 방화벽 상태가 "VPN 전용 (L4+L7 이중 방어)"으로 통일됨
- VPN 필수 안내가 누락 없이 반영됨
- docs/10이 AGENTS.md, CLAUDE.md 인덱스에 추가됨
