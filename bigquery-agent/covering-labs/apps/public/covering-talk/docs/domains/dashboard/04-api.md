# 04 — API 카탈로그

> ~15 라우트. 모두 `/api/new_dashboard/*` + presence heartbeat + 1 cron.
> 권한: `ADMIN_DASHBOARD_ALLOWED_USERS` (강성진/유대현/김원빈) 만 200, 나머지 403.

## 통합 분석

| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| GET | `/api/new_dashboard/analytics` | KR + Journey + Health + Traffic 통합 | CS-ADM-016 |

응답 구조:
```json
{
  "kr": {...},
  "journey": {...},     // Phase 1~8 funnel
  "health": {...},      // no_pickup, cancel, no_payment, complaint, nps
  "traffic": {...}      // 채널별·지역별·시간대별
}
```

## 메모

| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| GET | `/api/new_dashboard/notes` | 메모 조회 (summary 모드는 셀별 카운트만) | CS-ADM-017 |
| POST | `/api/new_dashboard/notes` | 신규 메모 | CS-ADM-018 |
| PATCH | `/api/new_dashboard/notes/[id]` | 수정 / 해결 처리 | CS-ADM-019 |
| DELETE | `/api/new_dashboard/notes/[id]` | 삭제 (작성자 본인만) | CS-ADM-020 |

## AI 인사이트 / 분류

| 메서드 | 경로 | 설명 | 코드 |
|---|---|---|---|
| POST | `/api/new_dashboard/insight` | Customer Journey AI 인사이트 (Sonnet, DB 캐시) | CS-ADM-021 |
| POST | `/api/new_dashboard/p5-reasons` | P5 이탈 사유 분류 (Haiku on-demand, DB 캐시) | CS-ADM-022 |
| POST | `/api/new_dashboard/cs-report` | 상담사 리포트 (Sonnet, 캐시) | — |

## 불만

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/new_dashboard/complaints` | 불만 목록 (분류 카테고리·기간·상담사 필터) |
| GET | `/api/new_dashboard/complaints/conversations` | 불만 + 해당 conversation 메시지 |
| POST | `/api/new_dashboard/complaints/unmark` | 카테고리 → `none` 으로 변경 (false positive) |

## 이탈 사유

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/new_dashboard/churn-reasons` | Phase 2/4/5/8 이탈 사유 분포 |
| GET | `/api/new_dashboard/churn-reasons/conversations` | 사유별 conversation 목록 |

## 부가 분석

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/new_dashboard/region-stats` | 지역별 통계 (RegionMapInner 용) |
| GET | `/api/new_dashboard/orders-detail` | 특정 셀 (예: 어떤 phase 의 어떤 status) 의 raw orders 목록 |

## CS Realtime

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/new_dashboard/cs-realtime` | KPI 통합 (큐·처리량·FRT·AI breakdown·상담사 카드) |
| GET | `/api/new_dashboard/cs-realtime/work-history` | 일별 근무 기록 (7-day 컬럼별) |
| POST | `/api/cs-realtime/heartbeat` | 클라이언트 1분 heartbeat | (CS-DSH-041 류) |

### `cs-realtime/work-history` 파라미터
- `counselor` — 상담사 이름 (필수)
- `days` (선택) — 최근 N일
- `from`, `to` (선택) — 사용자 정의 범위 (max 180)

응답: 시스템별 (visit/lunch/channeltalk) 일별 consults / replies / minutes.

## Cron

| 경로 | KST | 설명 | 코드 |
|---|---|---|---|
| `/api/cron/classify-complaints` | 5분 | 최근 7일 user 메시지 Haiku 배치 분류 → `dashboard_complaints` UPSERT | CS-CRON-011 |

자세히는 [`../../architecture/cron.md`](../../architecture/cron.md).

## 권한

```ts
// app/api/new_dashboard/cs-realtime/route.ts (다른 라우트도 동일 패턴)
const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const user = await getCurrentUser();
if (!user) return 401;
if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) return 403;
```

추가 권한 부여 시: 본 set 갱신 + 여러 라우트에 일괄 적용 (utility 화 검토).

## Cache 전략 요약

| 라우트 | 캐시 방식 | 비고 |
|---|---|---|
| `analytics` | (없음 — 매 호출 fresh) | 호출당 ~수백ms |
| `insight` | DB (`dashboard_insights`) | hash 같으면 hit |
| `p5-reasons` | DB (`dashboard_p5_reasons`) | session_id 단위 |
| `churn-reasons` | DB (`dashboard_churn_reasons`) | session_id 단위 |
| `complaints` | DB (`dashboard_complaints`) | cron 이 미리 채움 |
| `cs-report` | 메모리 + DB | 사용자 prefetch + 백그라운드 |
| `cs-realtime` | (없음 — 10초 polling) | 응답 ~수백ms |
| `cs-realtime/work-history` | (없음 — 모달 진입 시 1회) | |

## 코드 컨벤션

- API 태그: `[CS-ADM-XXX]` (대시보드 분석은 ADM), `[CS-DSH-XXX]` (presence 류)
- 권한: 모든 라우트 첫 줄에 ALLOWED_USERS 체크
- 응답 시간 측정: `console.log("[realtime] elapsed:", Date.now() - start)` 류

전체 카탈로그: [`../../api/tags.md`](../../api/tags.md).
