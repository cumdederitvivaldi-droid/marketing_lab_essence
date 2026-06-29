> 유형: 플랜
> 작성일: 2026-05-19
> 상태: 초안

# 분기 누적 차단율 일일 리포트

기존 weekly 리포트 외에 매일 KST 19:00 에 현재 분기 누적 AI PR 차단율을 슬랙으로 받기.

## 목표

- 분기 진행 중 KR3 차단율 추이를 매일 모니터링 가능
- 표준 캘린더 분기 (Q1=1/1, Q2=4/1, Q3=7/1, Q4=10/1) 기준 누적 집계
- 사용자 (jun@covering.app) 명시 요청: "매주 KR3 가드레일 지표 받고 있는데, 2분기 누적으로 매일 오후 7시에 전달 받고 싶어"

## 현황 분석

기존 `.github/workflows/weekly-blocking-report.yml`:

- schedule: `0 1 * * 1` (KST 월요일 10:00)
- 기본 7일 집계 (workflow_dispatch 의 `days_back` 으로 변경 가능)
- `critical-detected` & NOT `had-followup` = 차단 / `critical-detected` & `had-followup` = 미차단
- 슬랙 채널: `#개발팀_커버링랩스` (`C0AUK6902BE`)

신규 요구는 (a) daily schedule (b) 누적 시작점이 분기 시작일.

## 구현 계획

### A. 신규 워크플로우 `.github/workflows/quarterly-blocking-report.yml`

기존 weekly 와 공존. 다음만 다름:

- `schedule: '0 10 * * *'` → 매일 UTC 10:00 = KST 19:00
- `since` 가 `days_back` 기반이 아니라 **현재 분기 시작일 (KST 자정)**
- 헤더: `AI PR 차단율 — 분기 누적 ✓/✗`
- 기간 라벨: `Q2 2026 (4월 1일 ~ 5월 19일)` 형태
- `workflow_dispatch` 에 `quarter_start_override` (YYYY-MM-DD) 입력 — 수동 재집계용

### B. 분기 시작일 계산 로직

```js
const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
const year = kstNow.getUTCFullYear();
const month = kstNow.getUTCMonth();              // 0-11
const quarterStartMonth = Math.floor(month / 3) * 3;
const quarterNumber = quarterStartMonth / 3 + 1; // 1-4
// since = KST 자정 = UTC 로는 전날 15:00
const since = new Date(Date.UTC(year, quarterStartMonth, 1) - 9 * 60 * 60 * 1000);
```

분기 경계일 (4/1, 7/1, 10/1, 익년 1/1) 의 KST 00:00 에 정확히 새 분기로 전환.

### C. 페이지네이션 안전 가드

분기 누적은 일수가 늘어날수록 더 많은 PR 을 조회해야 한다. 기존 weekly 와 동일 알고리즘이나 안전 가드 `page > 50` (5000 PR 이상) 추가.

## 완료기준

- [x] `.github/workflows/quarterly-blocking-report.yml` 작성
- [ ] PR 생성 + 머지
- [ ] 머지 후 첫 cron (KST 19:00) 또는 `workflow_dispatch` 로 수동 검증 — Q2 2026 (2026-04-01 ~ 현재) 데이터로 슬랙 메시지 1건 발송 확인
- [ ] 분기 경계일 (다음 7/1) 에 자동으로 Q3 시작점으로 전환됨

## 비목표

- 기존 weekly 리포트 변경 없음 (병행)
- 차단율 계산 로직 변경 없음 — `critical-detected` / `had-followup` 라벨 기반 그대로
- 별도 임계치/알림 정책 (예: 차단율 50% 미만일 때 강조) 추가 없음 — 후속 PR 에서 검토
