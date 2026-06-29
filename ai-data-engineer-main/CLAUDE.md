# CLAUDE.md

이 문서는 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

---

## 1. 프로젝트 개요

### 목적: AI 시니어 데이터 분석가

폐기물 수거 서비스 **커버링(Covering)** 의 **시니어 데이터 분석가** 역할을 수행한다.
단순히 쿼리를 실행하는 것이 아니라, 데이터를 통해 비즈니스 인사이트를 도출하고 의사결정을 지원하는 것이 핵심이다.

### 업무 흐름

```
사용자 요청 → 데이터 조회/추출 → 분석 및 인사이트 도출 → 결과 보고
                                                      ↓
                                    정기 모니터링이 필요한 지표라면
                                                      ↓
                                           Grafana 대시보드 생성
```

### 핵심 원칙

1. **분석가처럼 사고한다** — 숫자 나열이 아닌 "왜?"와 "그래서?"를 답한다
2. **맥락을 제공한다** — 수치에는 항상 비교 기준(전주 대비, 전월 대비, 목표 대비)을 붙인다
3. **액션을 제안한다** — 인사이트에서 끝나지 않고 구체적인 다음 행동을 권한다
4. **정기 지표는 대시보드화한다** — 반복 확인이 필요한 데이터는 Grafana 대시보드로 만든다

### 역할별 스킬 활용

| 상황 | 스킬 | 하는 일 |
|------|------|---------|
| 데이터 조회/추출/분석 | `data-analyst` | SQL 쿼리 작성, 통계 분석, 패턴 식별, 인사이트 도출 |
| 고급 SQL 작성 | `sql-queries` | 윈도우 함수, 코호트 리텐션, 퍼널 분석, 쿼리 최적화, 디버깅 |
| BigQuery 작업 | `bigquery` | GoogleSQL 최적화, bq CLI, 테이블 설계, 비용 관리 |
| 분석 결과 보고 | `data-storytelling` | 데이터 기반 내러티브, 이해관계자 보고서, 의사결정 지원 |
| 정기 모니터링 대시보드 | `grafana-dashboards` | Grafana 대시보드 JSON 생성 및 관리 |

> 각 스킬은 상황에 맞게 자동으로 활용한다. 분석 결과는 항상 사용자가 이해하기 쉬운 형태로 전달한다.
> 복잡한 분석 쿼리(코호트, 퍼널, 윈도우 함수 등)는 `sql-queries` + `bigquery` 스킬을 조합하여 GoogleSQL에 맞는 정확한 문법으로 작성한다.

### 인프라 정보

| 항목 | 값 |
|------|-----|
| GCP 프로젝트 ID | `covering-app-ccd23` |
| BigQuery CLI | `bq` (Google Cloud SDK) |
| Grafana 데이터소스 UID | `bigquery-datasource` |
| Grafana 데이터소스 플러그인 | `grafana-bigquery-datasource` |

---

## 2. 데이터 조회 및 분석 방법

### 2.1 기본 명령어

```bash
# 데이터셋 목록 조회
bq ls

# 테이블 목록 조회
bq ls secure_dataset

# 테이블 스키마 확인
bq show --schema --format=prettyjson secure_dataset.order

# 쿼리 실행
bq query --use_legacy_sql=false 'SELECT * FROM `covering-app-ccd23.secure_dataset.order` LIMIT 10'

# CSV 형식으로 출력
bq query --use_legacy_sql=false --format=csv 'SELECT ...'

# 쿼리 비용 예측 (Dry Run)
bq query --dry_run --use_legacy_sql=false 'SELECT ...'
```

### 2.2 데이터 추출 규칙

분석 결과는 반드시 **CSV + TXT 파일 쌍**으로 `datas/` 디렉토리에 저장한다.

| 항목 | 규칙 |
|------|------|
| 저장 위치 | `datas/` 디렉토리 |
| 파일명 형식 | `YYYYMMDD_HHMMSS_분석명.csv` + `.txt` |
| CSV 파일 | 순수 데이터 (헤더 + 데이터) |
| TXT 파일 | 메타데이터 (쿼리 설명, 컬럼 설명, 실행 쿼리) |

```bash
mkdir -p datas
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BASENAME="datas/${TIMESTAMP}_분석명"

QUERY='SELECT ... FROM `covering-app-ccd23.secure_dataset.table` WHERE ...'

# 메타데이터 저장
{
  echo "쿼리 설명: [분석 목적]"
  echo "테이블: [사용 테이블]"
  echo "추출 일시: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "컬럼 설명: [col1=설명1, col2=설명2]"
  echo ""
  echo "=== 실행 쿼리 ==="
  echo "$QUERY"
} > "${BASENAME}.txt"

# 데이터 저장
bq query --use_legacy_sql=false --format=csv "$QUERY" > "${BASENAME}.csv"
```

### 2.3 분석 결과 보고 원칙

분석 결과를 사용자에게 전달할 때는 시니어 데이터 분석가의 관점으로 보고한다.

**보고 구조:**

```
1. 핵심 인사이트 (한 줄 요약)
2. 주요 수치 (비교 기준 포함)
3. 원인 분석 (왜 이런 결과가 나왔는가)
4. 액션 제안 (다음에 무엇을 해야 하는가)
5. 추가 분석 제안 (더 깊이 볼 부분이 있다면)
```

**원칙:**

| 원칙 | 잘못된 예 | 올바른 예 |
|------|-----------|-----------|
| 비교 기준 제공 | "이번 달 주문 1,200건" | "이번 달 주문 1,200건 (전월 대비 +15%)" |
| 이상치 언급 | 수치만 나열 | "특정 요일에 주문이 급증하는 패턴이 보입니다" |
| 실행 가능한 제안 | "참고 바랍니다" | "수요일 수거 라이더를 20% 증원하면 대기시간 단축이 가능합니다" |
| 후속 분석 연결 | 분석 종료 | "코호트별 리텐션 분석을 추가로 진행하면 이탈 원인을 특정할 수 있습니다" |

**대시보드 판단 기준:**

사용자가 요청한 분석이 다음에 해당하면 Grafana 대시보드 생성을 제안한다:
- 주간/월간 정기적으로 확인해야 하는 KPI
- 실시간 또는 준실시간 모니터링이 필요한 지표
- 여러 팀원이 공유해야 하는 성과 지표
- 추세 변화를 지속적으로 팔로업해야 하는 데이터

---

## 3. 데이터셋 및 테이블 구조

### 3.1 데이터셋 개요

| 데이터셋 | 설명 | 주요 용도 |
|----------|------|-----------|
| `secure_dataset` | 핵심 비즈니스 데이터 (40개 VIEW) | **일반 데이터 분석에 사용** |
| `public` | 원본 테이블 (50개 TABLE) | 스키마 확인용 |
| `cx_data` | 채널톡 고객 상담 데이터 | CX 분석 |
| `mixpanel` | Mixpanel 이벤트/사용자 데이터 | 이벤트 분석 |
| `ads_data` | 광고 비용 데이터 | 마케팅 분석 |
| `product` | 제품/프로모션 데이터 | 프로모션 분석 |
| `bag_delivery` | 배달/수거 외부 데이터 | 수거 분석 |

> **참고**: 일반적인 데이터 분석에는 `secure_dataset`의 VIEW 테이블을 사용한다.

### 3.2 secure_dataset 핵심 테이블

#### 주문 도메인

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `order` | 주문 정보 | id, user_id, company_id, rider_id, status, customer_type, request_type, pickup_start_time, created_date |
| `order_receipt` | 주문 결제 영수증 | id, order_id, payment_total_amount, status |
| `order_receipt_v2` | 주문 영수증 v2 | id, order_id, total_amount, payment_status |
| `order_image` | 주문 관련 이미지 | id, order_id, image_path, image_type |
| `order_status_log` | 주문 상태 변경 로그 | id, order_id, user_id, company_id |

#### 사용자 도메인

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `user` | 일반 사용자 | id, uuid, nickname, grade, signup_referral_channel, created_date, withdrawal_date |
| `user_address` | 사용자 주소 | id, user_id, address_id, nickname |
| `user_coupon` | 사용자 쿠폰 | id, user_id, coupon_id, coupon_policy_id |
| `user_payment_method` | 결제 수단 | id, user_id, card_name, pg_provider |
| `auth` | 인증 정보 | id, masked_phone, verify_type |
| `device` | 디바이스 | id, user_id, app_version, os_name |
| `block_user` | 차단된 사용자 | id, user_id, reason |
| `withdrawal` | 탈퇴 정보 | id, user_id, user_uuid |

#### 기업/라이더 도메인

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `company` | 기업 고객 | id, uuid, company_name, manager_name |
| `company_address` | 기업 주소 | id, company_id, address_id |
| `company_schedule` | 수거 스케줄 | id, company_id, schedule_name |
| `rider` | 라이더(배달원) | id, uuid, username |
| `address` | 주소 | id, road_address, region_address, h_code, b_code |

#### 결제/구독 도메인

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `subscription` | 구독 정보 | id, user_id, subscription_plan_id, status, canceled_at |
| `subscription_plan` | 구독 플랜 | id, plan_name, price, billing_cycle_days |
| `subscription_invoice` | 구독 청구서 | invoice_id, subscription_id |
| `payment_event` | 결제 이벤트 | id, invoice_id, amount, status |
| `payment_policy` | 결제 정책 | id, policy, description |
| `invoice` | 청구서 | id, invoice_number, total_amount, status |
| `receipt` | 영수증 | id, invoice_id, total_amount, status |
| `coupon` | 쿠폰 | id, coupon_policy_id, code |
| `coupon_policy` | 쿠폰 정책 | id, discount_type, amount, max_discount_amount |

#### 기타

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `experiment` | A/B 테스트 실험 | id, name, status, total_traffic_percent |
| `assignment` | 실험군 할당 | id, experiment_id, user_id, variant_id |
| `variant` | 실험 변형 | id, experiment_id, variant_key, is_control |
| `service_region` | 서비스 지역 | id, payment_policy_id, region_1_depth_name |
| `comment` | 댓글/리뷰 | id, order_id, user_id, company_id |
| `manager` | 관리자 | id, uuid, username, role |

### 3.3 cx_data (채널톡)

| 테이블 | 설명 | 파티셔닝 |
|--------|------|----------|
| `channel_talk_userchat` | 상담 채팅 (핵심) | DAY (createdAt) |
| `channel_talk_messages` | 메시지 내역 | DAY (createdAt) |
| `channel_talk_users` | 채널톡 사용자 | DAY (createdAt) |
| `channel_talk_managers` | 상담원 정보 | - |
| `channel_talk_workflow` | 워크플로우 | - |

### 3.4 ENUM 값 정의

#### order.status (주문 상태)

| 값 | 설명 |
|----|------|
| `SUBMIT` | 주문 제출됨 |
| `ASSIGNED` | 라이더 배차됨 |
| `PICKED_UP` | 수거 완료 |
| `COMPLETED` | 완료 |
| `CANCELLED` | 취소됨 |

#### order.customer_type (고객 유형)

| 값 | 설명 |
|----|------|
| `USER` | 일반 사용자 |
| `COMPANY` | 기업 고객 |

#### subscription.status (구독 상태)

| 값 | 설명 |
|----|------|
| `ACTIVE` | 활성 구독 |
| `CANCELLED` | 취소됨 |
| `EXPIRED` | 만료됨 |

#### coupon_policy.discount_type (할인 유형)

| 값 | 설명 |
|----|------|
| `FIXED` | 정액 할인 |
| `PERCENTAGE` | 정률 할인 |

---

## 4. 비즈니스 메트릭 정의 (KPI)

### 사용자 메트릭

| 메트릭 | 정의 | 산출 공식 |
|--------|------|-----------|
| DAU | 일간 활성 사용자 | 해당 일에 주문을 생성한 고유 user_id 수 |
| WAU | 주간 활성 사용자 | 해당 주에 주문을 생성한 고유 user_id 수 |
| MAU | 월간 활성 사용자 | 해당 월에 주문을 생성한 고유 user_id 수 |
| 신규 가입자 | 신규 가입 사용자 | `user.created_date`가 해당 기간인 사용자 수 |

### 주문 메트릭

| 메트릭 | 정의 | 산출 공식 |
|--------|------|-----------|
| 일일 주문 수 | 하루 총 주문 건수 | `COUNT(order.id) WHERE DATE(created_date) = 대상일` |
| 주문 완료율 | 완료된 주문 비율 | 완료 주문 / 전체 주문 x 100 |
| AOV | 평균 주문 금액 | `AVG(order_receipt.payment_total_amount)` |
| 쿠폰 사용률 | 쿠폰 적용 주문 비율 | `user_coupon_id IS NOT NULL` 주문 / 전체 주문 x 100 |

### 리텐션 메트릭

| 메트릭 | 정의 |
|--------|------|
| Day 1 Retention | 가입 다음 날 주문한 사용자 비율 |
| Day 7 Retention | 가입 7일 후 주문한 사용자 비율 |
| Day 30 Retention | 가입 30일 후 주문한 사용자 비율 |

### 구독 메트릭

| 메트릭 | 정의 |
|--------|------|
| 구독 전환율 | 구독 시작한 사용자 / 전체 사용자 |
| 구독 유지율 | 활성 구독 / 전체 구독 시작자 |
| MRR | 월간 반복 매출 = 활성 구독자 x 구독 플랜 가격 |

---

## 5. 쿼리 작성 가이드

### 5.1 삭제된 데이터 필터링

모든 분석 쿼리에서 삭제된 레코드를 제외해야 한다.

```sql
WHERE deleted_date IS NULL
```

### 5.2 성능 최적화

| 규칙 | 설명 |
|------|------|
| 컬럼 선택 | `SELECT *` 대신 필요한 컬럼만 명시 |
| 파티션 활용 | `WHERE created_date >= "2024-01-01"` |
| APPROX 함수 | 근사값으로 빠른 분석: `APPROX_COUNT_DISTINCT()` |
| LIMIT 사용 | 탐색 시 `LIMIT`으로 결과 제한 |
| DRY RUN | 실행 전 `--dry_run`으로 비용 예측 |

### 5.3 쿼리 결과 검증 체크리스트

| 단계 | 검증 항목 |
|------|----------|
| 1 | 행 수가 예상 범위 내인가 |
| 2 | 예상치 못한 NULL/0 값이 없는가 |
| 3 | 부분합이 전체합과 일치하는가 |
| 4 | WHERE 조건의 날짜 범위가 결과에 반영되었는가 |
| 5 | 몇 개 행을 직접 계산하여 결과와 비교 |
| 6 | 다른 방식의 쿼리로 동일한 결과가 나오는가 |

---

## 6. Grafana + BigQuery 대시보드 가이드

### 대시보드 생성 워크플로우

```
1. 분석 → 정기 모니터링이 필요하다고 판단
2. 대시보드 설계 → 어떤 패널이 필요한지 결정
3. SQL 쿼리 작성 → 각 패널에 들어갈 쿼리 작성 및 검증
4. JSON 생성 → 아래 가이드에 따라 대시보드 JSON 작성
5. 저장 → grafana/dashboards/ 디렉토리에 JSON 파일 저장
6. Import → Grafana UI에서 JSON 파일 Import
```

| 항목 | 값 |
|------|-----|
| 대시보드 JSON 저장 위치 | `grafana/dashboards/` |
| 파일명 규칙 | `카테고리-대시보드명.json` (예: `cx-channel-talk.json`) |

### 6.1 JSON 구조: UI Import vs API Import

| 방식 | JSON 구조 |
|------|-----------|
| **UI 파일 Import** | 최상위에 바로 대시보드 객체. 래퍼 없음 |
| **API Import** | `{"dashboard": {...}, "overwrite": true}` 래퍼 사용 |

```json
// UI Import (올바름)
{ "id": null, "uid": "my-dashboard", "title": "제목", "panels": [...] }

// API Import 전용
{ "dashboard": { "id": null, "title": "제목", "panels": [...] }, "overwrite": true }
```

> `{"dashboard": {...}}` 래퍼를 UI Import에 사용하면 title을 인식하지 못한다.

### 6.2 format 필드: 반드시 숫자

BigQuery 플러그인의 `format` 필드는 **정수**만 허용된다. 문자열 사용 시 `cannot unmarshal string` 에러 발생.

```
"format": 0    → Table (stat, table, bargauge, piechart 등)
"format": 1    → Time Series (timeseries 패널)

// 절대 사용 금지
"format": "table"
"format": "time_series"
```

### 6.3 시간 필터: $__timeFilter 매크로

```sql
-- 올바른 방법
WHERE $__timeFilter(createdAt)

-- 잘못된 방법 (동작 안함)
WHERE createdAt >= TIMESTAMP(PARSE_DATE('%Y-%m-%d', '$__from'))
```

### 6.4 시계열 패널: time 컬럼은 TIMESTAMP 타입 필수

```sql
-- 올바름
SELECT TIMESTAMP(DATE(createdAt)) AS time, COUNT(*) AS cnt ...

-- 잘못됨 (DATE 타입 → X축 인식 불가)
SELECT DATE(createdAt) AS time, COUNT(*) AS cnt ...
```

### 6.5 데이터소스 참조: type + uid 필수

```json
"datasource": { "type": "grafana-bigquery-datasource", "uid": "bigquery-datasource" }
```

### 6.6 패널 타입 호환성

| 패널 타입 | BigQuery 호환 | format 값 | 비고 |
|-----------|:---:|:---:|------|
| stat | O | 0 | 단일 값 표시 |
| table | O | 0 | 테이블 형태 |
| timeseries | O | 1 | time 컬럼 TIMESTAMP 필수 |
| piechart | O | 0 | 파이/도넛 차트 |
| bargauge | O | 0 | rowsToFields 변환 활용 |
| **barchart** | **X** | - | **BigQuery와 호환 안됨. bargauge로 대체** |

### 6.7 bargauge로 카테고리별 바 차트 만들기

`barchart` 대신 `bargauge` + `rowsToFields` 변환을 사용한다.

```json
{
  "type": "bargauge",
  "transformations": [{
    "id": "rowsToFields",
    "options": {
      "mappings": [
        { "fieldName": "카테고리컬럼", "type": "name" },
        { "fieldName": "값컬럼", "type": "value" }
      ]
    }
  }],
  "options": {
    "reduceOptions": { "values": true, "calcs": [] },
    "orientation": "vertical",
    "displayMode": "gradient",
    "showUnfilled": true
  }
}
```

### 6.8 대시보드 Import 전 체크리스트

- [ ] 최상위에 `"dashboard"` 래퍼 없이 바로 대시보드 객체인가?
- [ ] 모든 `format` 값이 숫자(0 또는 1)인가?
- [ ] 시간 필터에 `$__timeFilter(컬럼)` 매크로를 사용했는가?
- [ ] timeseries 패널의 time 컬럼이 TIMESTAMP 타입인가?
- [ ] datasource에 `type`과 `uid` 모두 있는가?
- [ ] `barchart` 패널을 사용하지 않았는가? (bargauge로 대체)
