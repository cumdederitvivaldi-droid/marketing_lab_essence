# web2form 친구톡 FI — 카카오 도달 0% 해결 + H열 자동 마킹 + 1회 재발송

> 유형: 플랜
> 작성일: 2026-05-20
> 상태: 확정 (이중 발송 방지 + 마이그레이션 스크립트 보강 — 2026-05-20)

## 목표

세 가지를 함께 해결한다.

1. **카카오 도달 0% 해결** — FlareLane 친구톡 FI 호출에 `targeting` 파라미터 추가
2. **시트 H열(발송 성공 여부) 자동 마킹** — 발송 결과에 따라 '성공' / '실패' / '실패_재시도' 기입
3. **실패 시 1회 자동 재발송** — H='실패' 행을 다음 cron tick에서 재시도, 또 실패하면 '실패_재시도'로 종결

## 현황

### 카카오 도달 0% 확인

| 발송 시간 | 전체 유저 | 발송 유저 | 상태 |
|---|---|---|---|
| 2026-05-20 08:35:03 | 1 | **0** | row 4 실패 |
| 2026-05-20 01:45:05 | 1 | **0** | row 5 실패 |
| 2026-05-20 01:31:33 | 1 | **0** | 실패 |

FlareLane 콘솔 실패 사유: **"잘못된 값(전화번호 오류/메시지 내용, 설정 오류)"**

### 사용자 ground truth

> "지금까지 누적된 휴대폰 번호들은 전부 실패야"

시트의 모든 row가 G='O' (API 호출 성공) 마킹되어 있지만 실제로는 카카오 도달 0건. 배포 후 H열을 일괄 '실패' 마킹 후 다음 cron이 자동 재발송 처리.

### 시트 컬럼 구조

| 열 | 헤더 | 용도 |
|---|---|---|
| A | 타임스탬프 | 폼 입력 시각 |
| B | 성함 | 발송 대상 이름 |
| C | 휴대폰 번호 | 발송 대상 번호 (raw `010...`) |
| D | 거주 지역 | 메타 |
| E | 동의 | 마케팅 수신 동의 |
| F | 확인 | 서비스 지역 |
| **G** | **발송 여부** | API 호출 성공 = `O` |
| **H** | **발송 성공 여부** | 카카오 도달 = `성공` / `실패` / `실패_재시도` |
| I | phoneNumber | 콘솔 수동 업로드용 E.164 (수동 입력) |
| J | #{nickname} | 콘솔 변수 |
| K | #{coupon_code} | 콘솔 변수 |
| L | #{coupon_name} | 콘솔 변수 |

## 원인 분석

### 1차 가설 (탈락) — 전화번호 형식 오류

FlareLane `sample-kakao_friendtalk.xlsx` 양식의 phoneNumber 컬럼 형식 = `+821000000000`.
우리 코드 `normalize_phone()` 출력 = `+821075899117` → 양식과 일치. **형식 문제 아님.**

### 확정 원인 — 수신자 타겟팅 파라미터 누락

FlareLane 친구톡 발송 수신자 타겟팅 3종:

| 코드 | 의미 | 사전 승인 |
|---|---|---|
| **M** | 선택 유저 전체 (친구 + 비친구) | 필요 |
| **N** | 채널친구 제외 (비친구만) | 필요 |
| **I** | 채널친구에게만 | 불필요 |

콘솔 UI는 라디오버튼으로 강제 선택. API 호출엔 우리 페이로드에 `targeting` 누락 → 비친구 발송 차단. 폼 입력자는 거의 다 카카오 채널 비친구이므로 카카오 단에서 reject → "발송 유저 0".

## 구현 계획

### 1) `src/config.py`

- `RESULT_COL` (`"H"`), `RESULT_SUCCESS` (`"성공"`), `RESULT_FAILURE` (`"실패"`), `RESULT_RETRIED` (`"실패_재시도"`) 상수 추가
- `TARGETING` (`"M"`) 상수 추가 — `WEB2FORM_FRIENDTALK_TARGETING` env로 override 가능

### 2) `src/flarelane.py`

- 페이로드에 `"targeting": TARGETING` 필드 추가
- 응답 body trim 200 → 1500자 (향후 sentUserCount 같은 필드 노출 시 발견 용이)

### 3) `src/sheets.py`

- `RESULT_IDX` 계산 + 관련 import
- `find_pending_rows()` 기준 변경: G 무관 → **H 빈 칸** 인 행 (신규)
- `find_retry_rows()` 신규: H == '실패' 인 행 (재발송 1회 대상)
- `mark_result(row_num, value)` 신규: H열 update
- 기존 `mark_sent()` (G='O') 유지

### 4) `src/main.py`

- 신규 발송 + 재발송을 같은 cron 사이클에서 처리
- API status 201 → `G='O'` + `H='성공'`
- API 실패 (status != 201 또는 전화번호 normalize 실패)
   - 신규 → `H='실패'` (다음 사이클에서 retry pickup)
   - 재시도 → `H='실패_재시도'` (종결 — 추가 pickup 안 함)

상태 다이어그램:

```
신규 폼 입력
   │ G='', H=''
   ▼
cron tick — 신규 발송
   ├─ status 201 → G='O', H='성공' [종결]
   └─ 실패        → G='', H='실패' [재시도 대기]
                    │
                    ▼
                cron tick — 재발송 1회
                    ├─ status 201 → G='O', H='성공' [종결]
                    └─ 실패        → H='실패_재시도'  [종결, 추가 pickup 안 함]
```

### 5) 누적 row 마이그레이션 (1회 SSH 작업, 배포 후)

지금까지 누적된 모든 row에 대해 사용자 ground truth 반영:

```
모든 row (G='O', H='') → H='실패' 일괄 마킹
```

→ 배포 직후 다음 cron tick이 모두 재발송 시도 → 결과에 따라 H 갱신.

**스크립트**: `apps/private/web2form-alimtalk-batch/scripts/migrate_empty_h_to_failure.py` (2026-05-20 추가)

```bash
cd /shared/apps/web2form-alimtalk-batch
sudo -u sa_109369409955768144646 python3 scripts/migrate_empty_h_to_failure.py --dry-run
sudo -u sa_109369409955768144646 python3 scripts/migrate_empty_h_to_failure.py
```

내부적으로 `gspread.batch_update`로 한 번에 N개 cell update 호출 → Sheets API 1회로 종료. dry-run은 대상 행만 로그.

### 6) 부분 실패 시 이중 발송 방지 (2026-05-20 추가 보강)

`mark_sent(G='O')` 와 `mark_result(H='성공')` 의 순서가 G→H 였다면, G 마킹 OK + H 마킹 NG 인 부분 실패에서 다음 cron tick의 `find_pending_rows`가 H='' 기준으로 같은 행을 다시 픽업 → 이중 발송 사고. 마킹 순서를 H→G 로 뒤집어 H='성공' 이 먼저 박히면 부분 실패에서도 다음 사이클 픽업이 자동 차단되도록 수정.

## 완료 기준

- [ ] payload에 `targeting: "M"` 포함
- [ ] H열 자동 마킹 동작 확인
- [ ] 재발송 1회 제한 동작 확인 (실패_재시도 마커 종결)
- [ ] PR 머지 후 자동 배포
- [ ] 시트 누적 row 일괄 H='실패' 마킹 (SSH 1회)
- [ ] 다음 cron tick에서 누적 row 일괄 재발송 시도 + 결과 자동 마킹 확인
- [ ] 카카오톡 도달 확인 (콘솔 발송 유저 ≥ 1)

## 위험 / 추가 작업

- **`M` 사전 승인**: 카카오 정책상 비친구 발송은 광고 수신 동의 증적 등 사전 승인 가능성. 머지 후에도 도달 0% 면 FlareLane 한규호 매니저에게 비친구 발송 자격 신청 진행. 환경변수 `WEB2FORM_FRIENDTALK_TARGETING` 으로 N/I 즉시 전환 가능.
- **FlareLane 응답 body에 도달 결과 포함 여부**: 현재 status 201 = API 큐잉 성공만 의미하므로 H='성공' 마킹이 false positive 가능. trim 1500 으로 늘려 응답 body 전체 확인 후 sentUserCount 같은 필드 발견 시 정확한 도달 기준으로 보강 (별도 PR).
- **재발송 1회 제한**: `실패_재시도` 마커가 다시 비워지면 무한 루프 가능. 운영 중 시트 수동 편집 주의.

## 참고

- 양식 파일: `sample-kakao_friendtalk.xlsx` (phoneNumber = `+821000000000`)
- 콘솔 UI: `console.flarelane.com/friendtalk/new`
- FlareLane API 문서: <https://docs.flarelane.co.kr/kakao-friendtalk-overview>
