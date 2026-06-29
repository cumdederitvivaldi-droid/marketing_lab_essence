# covering-labs 코드 통합

> 유형: 플랜
> 작성일: 2026-04-14
> 상태: 완료

## 목적
흩어진 모든 사내 코드 작업물을 covering-labs 레포로 일원화.
push → GCP covering-labs 서버 자동 배포 → `https://labs.covering.app/{앱이름}` (VPN 전용)

## 범위
- apps/: 배포 대상 앱 (nextjs, batch)
- products/: 외부 배포 프로덕트 코드 백업
- tools/: 데스크톱 앱 코드 백업
- appscripts/: Apps Script 코드 백업
- cloud-functions/: Cloud Function 코드 백업

## 통합 완료 목록

### apps/ (배포)

| 앱 | 타입 | 설명 |
|---|---|---|
| schema-graph | batch | BQ 스키마 관계도 매일 재생성 |
| event-dictionary | batch | 이벤트 사전 매일 재생성 |
| vehicle-dispatch-monitor | batch | 차량배차 모니터 매일 21:00 KST |
| threads-monitor | batch | Threads AI 소식 → 슬랙 매일 09:00 KST |
| invite-prototype | nextjs | 초대 프로토타입 |
| work-dashboard | nextjs | 업무 대시보드 |
| codex-claude-bridge | - | Claude-Codex 브릿지 (Bun 기반, 수동 배포) |
| eng1559 | batch | FlareLane D7 리텐션 실험 배치 |

### products/ (코드 백업)
- covering-spot (Vercel 배포 유지)
- waste-management-landing (Vercel 배포 유지)
- figma-26q2 (Vercel 배포 유지)
- covering-invite (Vercel 배포 유지)

### tools/ (코드 백업)
- work-dashboard-app, perf-menubar-monitor, claude-rate-limit-bar, warpdoc

### appscripts/ (코드 백업)
- channel-talk-cx, covering-single-collection-slack, 150L-appscript, airbridge-ads-data
- 주의: 하드코딩 API 키 → REDACTED 처리 완료

### cloud-functions/ (코드 백업)
- brand-msg-redirect

## 제외
- jibjabi, laundry-form, dock-buddy (개인 프로젝트)

## 검증 체크리스트
- [x] .env* 파일 커밋 안됨 (.gitignore에 포함)
- [x] 하드코딩 API 키 REDACTED 처리 (channel-talk-cx, airbridge-ads-data)
- [x] nextjs 앱 basePath 추가 (work-dashboard, invite-prototype)
- [x] dist/ 제거 (waste-management-landing)
- [ ] PR 생성 및 배포 확인

## 변경 이력

### 2026-04-16 — fail_photo_bot 제거
- `apps/vehicle-dispatch-monitor/fail_photo_bot/` 전체 삭제
- `docs/2026-04-02-fail-photo-slack-thread-photo-plan.md` 삭제
- `docs/2026-04-02-fail-photo-tech-review-request.md` 삭제
- `requirements.txt`에서 `google-cloud-storage` 제거 (fail_photo_bot 전용 패키지)
- 유지: `security.py`, `backoffice.py`, `backoffice_auth.py` (monitor.py가 직접 사용)

## 다음 단계
1. beige-ian/schema-graph, event-dictionary, vehicle-dispatch-monitor archived 처리 (PR 머지 후)
