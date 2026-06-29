# 대형봉투 배송불가 리포트 배치 (ENG-3108)

## 목표
5/13 대형봉투 신청 인앱 이관 이후 누락된 "배송불가 지역 엑셀 리포트"를 두발히어로 API 폴링 기반 신규 배치로 복원한다. 예진님 할당 수정 전까지 임시 운영.

리니어: https://linear.app/covering/issue/ENG-3108

## 현황 분석

### 기존 배치 (`apps/private/large-bag-delivery-batch`)
- 09:00 / 15:00 cron 실행, 구글 시트에서 후보 읽기 → 두발히어로 POST → 응답의 `addressNotSupported` 건만 엑셀로 묶어 슬랙 업로드
- 5/13 인앱 이관으로 데이터 흐름이 시트 → 인앱으로 옮겨가면서 본 배치의 시트 입력이 끊김 → 배송불가 리포트 누락

### 두발히어로 API 응답 (2026-05-15 프로브)
- `GET /deliveries?dateFrom=YYYY-MM-DD&pageSize=200&page=N` → `{ rows: [...], totalCount: N }`
- 각 row에 `addressNotSupported: bool` 포함 (리스트 응답에도 노출)
- 시각 필터 기준: `receivedDate` (KST `YYYY-MM-DD HH:MM:SS`)
- 5/13~5/15 sample: 200건 중 ~10건이 `addressNotSupported=true`

## 구현 계획

### 신규 앱: `apps/private/large-bag-unsupported-report-batch`

| 파일 | 역할 |
|---|---|
| `src/main.py` | 진입점. 슬롯 결정 → dhero 폴링 → BQ 대형봉투 필터 → 엑셀 → 슬랙 |
| `src/config.py` | 환경변수 로드 (DHERO_TOKEN, DHERO_API_URL, SLACK_BOT_TOKEN, SLACK_CHANNEL_ID, SLACK_UNSUPPORTED_MENTION_USER_ID) |
| `src/dhero_list.py` | `list_unsupported(...)` — 페이지네이션 + addressNotSupported + receivedDate 윈도우 필터 |
| `src/large_bag_filter.py` | `filter_large_bag(order_numbers)` — BQ 조회로 LARGE_COVERING_BAG 라인을 가진 order_number set 반환 |
| `src/excel_builder.py` | `build_xlsx(rows)` — `[이름, 전화번호, 주소]` 컬럼 |
| `src/slack_notifier.py` | files.getUploadURLExternal 3단계 업로드 |
| `deploy.yml` | type: batch, schedule: `5 11 * * *` (오전만, 오후는 VM crontab 별도) |
| `requirements.txt` | requests, openpyxl, google-cloud-bigquery |

### 대형봉투 필터 매칭 (2026-05-15 검증)
dhero list 응답엔 일반봉투(`COVERING_BAG`) + 대형봉투(`LARGE_COVERING_BAG`)가 섞여 들어옴. BQ join 으로 대형만 분리.

- 매칭 키: dhero `orderIdFromCorp` ↔ covering `order_v2.order_number` (10자리 영문대문자+숫자, 5/5 매칭 확인)
- 인증: VM `covering-batch-sa` 서비스 계정 (`google.auth.default()`)
- 쿼리:
```sql
SELECT DISTINCT o.order_number
FROM secure_dataset.order_v2 o
JOIN secure_dataset.order_line ol ON ol.order_id = o.id AND ol.deleted_at IS NULL
JOIN secure_dataset.product p ON p.id = ol.product_id
WHERE o.order_number IN UNNEST(@numbers)
  AND p.product_code = 'LARGE_COVERING_BAG'
```

### 슬롯 정의
- **morning (cron 11:10 실행)**: 어제 15:35 ~ 당일 11:05 `receivedDate`
- **afternoon (cron 15:40 실행)**: 당일 11:05 ~ 당일 15:35 `receivedDate`

윈도우 cutoff(11:05 / 15:35) 은 인앱 배치 종료 직후로 잡아 인앱이 두발히어로에 등록한 모든 결과 흡수.
cron 은 cutoff 보다 5분 여유 둔 11:10 / 15:40 에 실행 → dhero list API 응답 안정 시점 확보.
**검증(2026-05-16)**: dhero 49건 unsupported (= 개발팀 리포트 대형 39 + 일반 10) → BQ 필터 후 정확히 39건 일치.

슬롯은 실행 시각으로 자동 판단 (KST 11시대 → morning, 15시대 → afternoon).

### cron 운영
- deploy.yml에는 **오전 슬롯만** (`10 11 * * *`) 등록
- 오후 슬롯(`40 15 * * *`)은 VM crontab에 수동 등록 필요 (앱당 단일 cron 제약 우회)
- 등록 절차는 README에 명시

### 출력 (기존 양식 동일)
- 엑셀 시트명: `배송불가`, 컬럼: `이름 / 전화번호 / 주소`
- 파일명: `unsupported_MMDD-HHMM.xlsx`
- 슬랙 메시지: `📮 배송불가 N건 (MM/DD HH시) / 우편 배송 처리 필요합니다. @최정환`
- 0건 시 미발송

### 환경 변수 (`/shared/.env`에서 로드)
기존 `large-bag-delivery-batch`가 쓰는 키를 그대로 재사용 (값/키 모두 동일).
- `DHERO_API_URL`, `DHERO_TOKEN`
- `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `SLACK_UNSUPPORTED_MENTION_USER_ID`

(별도 키를 만들지 않은 이유: 채널/멘션 의미가 100% 동일하고, 신규 키 추가 시 운영 부담만 가중되기 때문)

## 완료 기준
- [ ] `apps/private/large-bag-unsupported-report-batch/` 신규 앱 추가, 로컬에서 시뮬레이션 실행 OK
- [ ] PR 생성, Codex 리뷰 통과
- [ ] VM 배포 (`/shared/.env` 는 기존 `DHERO_*`, `SLACK_*` 키 재사용 — 신규 등록 불필요)
- [ ] VM crontab에 오후 슬롯 (`35 15 * * *`) 수동 등록
- [ ] 다음 슬롯에 실제 슬랙 메시지 + 엑셀 수신 확인 (최정환님 멘션 포함)
- [ ] 기존 large-bag-delivery-batch는 그대로 두고 본 배치만 추가 (영향 없음 확인)
