# BigQuery 데이터 추출 가이드

BigQuery에서 `bq` 명령줄 도구를 사용하여 데이터셋에 접근하고 데이터를 추출하기 위한 가이드입니다.

> **참고**: 이 가이드는 `bq` CLI(Command Line Interface)를 기본으로 사용합니다.
> **스키마 최종 업데이트**: 2026-04-10 BigQuery 실측 기준 (migration_guide.md 통합 + 신규 테이블 추가)

---

## 목차

1. [시작하기](#1-시작하기)
   - 1.1 [사전 요구사항](#11-사전-요구사항)
   - 1.2 [인증 및 프로젝트 설정](#12-인증-및-프로젝트-설정)
2. [데이터 구조 이해](#2-데이터-구조-이해)
   - 2.1 [프로젝트 정보](#21-프로젝트-정보)
   - 2.2 [데이터셋 목록](#22-데이터셋-목록)
   - 2.3 [마이그레이션 변경 내역 (2026-04-01)](#23-마이그레이션-변경-내역-2026-04-01)
   - 2.4 [현재 테이블 스키마 (secure_dataset)](#24-현재-테이블-스키마-secure_dataset) — order_v2, fulfillment, user, company, rider, payment_policy 등 포함
   - 2.5 [cx_data 스키마](#25-cx_data-스키마)
   - 2.6 [mixpanel 스키마](#26-mixpanel-스키마)
   - 2.7 [Phase 4 미반영 항목](#27-phase-4-미반영-항목)
   - 2.8 [비즈니스 메트릭 정의 (KPI)](#28-비즈니스-메트릭-정의-kpi)
3. [BigQuery 기본 사용법](#3-bigquery-기본-사용법)
   - 3.1 [데이터셋 및 테이블 조회](#31-데이터셋-및-테이블-조회)
   - 3.2 [쿼리 실행](#32-쿼리-실행)
   - 3.3 [데이터 추출 규칙](#33-데이터-추출-규칙)
   - 3.4 [유용한 옵션](#34-유용한-옵션)
4. [데이터 분석 가이드](#4-데이터-분석-가이드)
   - 4.1 [탐색적 데이터 분석 (EDA)](#41-탐색적-데이터-분석-eda)
   - 4.2 [핵심 분석 쿼리 템플릿](#42-핵심-분석-쿼리-템플릿)
   - 4.3 [성능 최적화 팁](#43-성능-최적화-팁)
   - 4.4 [쿼리 결과 검증 (Feedback Loop)](#44-쿼리-결과-검증-feedback-loop)
5. [운영 가이드](#5-운영-가이드)
   - 5.1 [데이터 품질 체크리스트](#51-데이터-품질-체크리스트)
   - 5.2 [문제 해결](#52-문제-해결)
   - 5.3 [스키마 관리](#53-스키마-관리)
6. [부록](#6-부록)

---

## 1. 시작하기

### 1.1 사전 요구사항

#### Google Cloud SDK (gcloud) 설치

**macOS**
```bash
brew install --cask google-cloud-sdk
# 또는
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

**Linux**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

**Windows**

[Google Cloud SDK 설치 페이지](https://cloud.google.com/sdk/docs/install)에서 설치 프로그램을 다운로드하여 실행합니다.

> **Windows 설치 경로**: 기본 설치 시 `C:\Users\{사용자명}\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin`에 설치됩니다.

**설치 확인**
```bash
gcloud --version
bq --version
```

> **Windows 주의사항**: bash 환경에서 `bq` 명령어를 찾지 못할 경우 [5.2 문제 해결 - Windows 환경](#windows-환경-bq-명령어-실행) 섹션을 참고하세요.

### 1.2 인증 및 프로젝트 설정

```bash
gcloud auth login
gcloud config set project covering-app-ccd23
gcloud config get-value project
gcloud auth application-default login  # 선택사항
```

**설정 확인**
```bash
gcloud config list
bq ls
```

---

## 2. 데이터 구조 이해

### 2.1 프로젝트 정보

- **프로젝트 ID**: `covering-app-ccd23`
- 쿼리 기본 prefix: `` `covering-app-ccd23.데이터셋명.테이블명` ``

### 2.2 데이터셋 목록

| 데이터셋 | 역할 | 비고 |
|---|---|---|
| `secure_dataset` | 메인 — 주문, 유저, 결제, 구독 전체 | |
| `cx_data` | 채널톡 고객 상담 데이터 | |
| `mixpanel` | 앱 내 사용자 행동 이벤트 | |
| `ads_data` | 광고비, 채널별 마케팅 지출 | 접근 안 될 경우 권한 요청 필요 |
| `product` | 프로모션, 상품 기획 데이터 | 접근 안 될 경우 권한 요청 필요 |
| `bag_delivery` | 외부 배달 연동 데이터 | 접근 안 될 경우 권한 요청 필요 |

---

### 2.3 마이그레이션 변경 내역 (2026-04-01)

> ⚠️ 아래 레거시 테이블은 BigQuery에 여전히 존재하지만 **신규 쿼리 작성 금지**.
> 구버전 이력 조회 목적으로만 참고.

#### 테이블 대체 현황

| 도메인 | 🚫 레거시 (신규 쿼리 작성 금지) | ✅ 현재 사용 테이블 |
|---|---|---|
| 주문 | `order` | `order_v2` |
| 주문 상태 이력 | `order_status_log` | `order_status_event` |
| 주문 이미지 | `order_image` | `order_image_v2` |
| 결제 영수증 | `order_receipt`, `order_receipt_v2` | `invoice` + `receipt` |
| 수거 실행 | *(없음)* | `fulfillment` (신규) |
| 수거 항목 결과 | *(없음)* | `fulfillment_item` (신규) |
| 주문 항목 변경 이력 | *(없음)* | `order_line_change_event` (신규) |

> `order`, `order_status_log`, `order_image`, `order_receipt`, `order_receipt_v2`, `prev_db_order` 는 레거시

#### 주문 상태 Enum 변경

| 🚫 레거시 `order.status` | ✅ 현재 `order_v2.status` | 의미 |
|---|---|---|
| `SUBMIT` | `CREATED` | 신규 접수 (아직 확정 전) |
| `ASSIGNED` | `READY` | 수거 예정 확정 (22시 배치 후) |
| *(없음)* | `IN_PROGRESS` | 수거 진행 중 |
| `PICKED_UP` → `COMPLETED` | `COMPLETED` | 수거 완료 |
| `CANCELLED` | `CANCELED` | 취소 (철자 변경: LL→L 주의) |

> 구버전 이력 조회 시에만 `order_status_log.status` 참고 (SUBMIT / RUNNING / PAYMENT_COMPLETED / NOTFOUND_FAIL / ENTER_FAIL / POLICY_FAIL / USER_CANCELED / ADMIN_CANCELED)

#### 주요 컬럼 변경

| 항목 | 🚫 레거시 | ✅ 현재 | 주의사항 |
|---|---|---|---|
| 날짜 파티션 | `order.created_date` (DATE) | `DATE(order_v2.created_at)` | WHERE절 파티션 필터 변경 필요 |
| 라이더 정보 | `order.rider_id` | `fulfillment.rider_id` | fulfillment 테이블 조인 필요 |
| 수거 시각 | `order.pickup_start/end_time` | `fulfillment.scheduled_start/end_at` | fulfillment 테이블 조인 필요 |
| 무게 | `order.weight` (kg 단위) | `fulfillment_item.actual_weight_grams` (g 단위) | **÷1000 변환 필수** |
| 봉투 수 | `order.bag_request_count`, `pickup_bag_count` | `order_line.quantity`, `fulfillment_item.actual_quantity` | 요청량/실수행량 분리됨 |
| 취소 주체 | status값에 USER_CANCELED / ADMIN_CANCELED 포함 | `order_status_event.actor_type` = `USER` / `MANAGER` | 별도 컬럼으로 분리 |
| B2C/B2B 구분 | `order.customer_type` (USER / COMPANY) | `order_v2.company_id` NULL 여부 | NULL=B2C, NOT NULL=B2B |

---

### 2.4 현재 테이블 스키마 (secure_dataset)

#### `order_v2` — 주문 (메인)
> 계약의 생명주기 관리. company_id로 B2B/B2C 구분. 파티션 기준: `DATE(created_at)`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | 주문 PK |
| `order_number` | STRING | 고객 조회용 주문 번호 (10자리 영어대문자+숫자, 예: K3MQ7A9BX2) |
| `user_id` | INTEGER | 고객 ID — B2B일 경우 NULL 가능 |
| `company_id` | INTEGER | 기업 ID — **NULL=B2C, NOT NULL=B2B** |
| `status` | STRING | 주문 상태 (Enum 참고) |
| `payment_policy_id` | INTEGER | 주문 시점 확정된 가격 정책 ID |
| `user_coupon_id` | INTEGER | 적용된 쿠폰 ID (NULL=미적용) |
| `is_locked` | BOOLEAN | 결제 완료 후 true — 주문 항목 수정 방지 잠금 |
| `created_at` | TIMESTAMP | 생성 시각 **(파티션 기준: DATE(created_at))** |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |
| `deleted_at` | TIMESTAMP | Soft delete 시각 (회원탈퇴 시 설정) |

**`order_v2.status` Enum**

| 값 | 의미 |
|---|---|
| `CREATED` | 신규 접수 (미확정) |
| `READY` | 수거 예정 확정 |
| `IN_PROGRESS` | 수거 이행 중 |
| `COMPLETED` | 수거 완료 |
| `CANCELED` | 취소 |

**B2B/B2C 필터**
```sql
WHERE company_id IS NOT NULL  -- B2B
WHERE company_id IS NULL      -- B2C
```

---

#### `order_status_event` — 주문 상태 변경 이력
> Append-only 감사 로그. 삭제/수정 없음. 취소 주체 분석 시 핵심 테이블.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `from_status` | STRING | 변경 전 상태 (최초 생성 시 NULL) |
| `to_status` | STRING | 변경 후 상태 |
| `actor_type` | STRING | **USER(고객) / RIDER(기사) / MANAGER(운영자) / SYSTEM(배치)** |
| `actor_id` | INTEGER | 행위자 ID |
| `reason` | STRING | 상태 변경 사유 |
| `metadata` | JSON | 추가 정보 |
| `created_at` | TIMESTAMP | 생성 시각 |

**취소 주체 구분 쿼리 예시**
```sql
WHERE to_status = 'CANCELED' AND actor_type = 'USER'    -- 고객 취소
WHERE to_status = 'CANCELED' AND actor_type = 'MANAGER' -- 운영자 취소
```

---

#### `order_line` — 주문 항목
> 주문 내 청구 가능한 모든 항목 (수거 서비스 + 봉투 등 상품). Soft delete 지원.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `product_id` | INTEGER | 주문한 상품/서비스 (`product` 테이블 참조) |
| `quantity` | INTEGER | 요청 수량 — SERVICE=1 고정, GOODS=요청 개수 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |
| `deleted_at` | TIMESTAMP | Soft delete (항목 삭제 시) |

---

#### `order_line_change_event` — 주문 항목 변경 이력
> Append-only 감사 로그. 주문 항목이 언제, 누가, 어떻게 바뀌었는지 추적 가능.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_line_id` | INTEGER | 변경된 order_line 참조 |
| `field_name` | STRING | 변경된 필드명 (예: quantity, deleted_at) |
| `old_value` | STRING | 변경 전 값 |
| `new_value` | STRING | 변경 후 값 |
| `actor_type` | STRING | USER / RIDER / MANAGER / SYSTEM |
| `actor_id` | INTEGER | 행위자 ID |
| `created_at` | TIMESTAMP | 생성 시각 |

---

#### `order_address_snapshot` — 주문 시점 주소 스냅샷
> 주문 생성 후 변경 불가 (불변). 주문 당시 주소를 정확히 보고 싶을 때 사용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `address_id` | INTEGER | 원본 address 레코드 참조 |
| `road_address` | STRING | 도로명 주소 |
| `jibun_address` | STRING | 지번 주소 |
| `detail_address` | STRING | 상세 주소 — **BigQuery에서 마스킹 처리됨, 사용 불가** |
| `h_code` | STRING | 행정동 코드 |
| `b_code` | STRING | 법정동 코드 |
| `created_at` | TIMESTAMP | 생성 시각 |

---

#### `order_customer_snapshot` — 주문 시점 고객 정보 스냅샷
> 주문 생성 후 변경 불가 (불변). 고객이 나중에 정보를 바꿔도 주문 시점 값 보존.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `customer_name` | STRING | 주문 시점 고객명 (불변) |
| `customer_phone` | STRING | 주문 시점 연락처 (불변) |
| `created_at` | TIMESTAMP | 생성 시각 |

---

#### `order_access_instruction` — 출입 정보
> order_v2와 1:1. READY 전까지 변경 가능. 재방문 시 자동 공유.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `entrance_method` | STRING | 출입 방법 |
| `entrance_password` | STRING | 출입 비밀번호 (암호화) |
| `entrance_detail` | STRING | 출입 상세 안내 |
| `allow_contact_before_arrival` | BOOLEAN | 도착 전 연락 허용 여부 (기본 true) |
| `allow_doorbell` | BOOLEAN | 초인종 사용 허용 여부 (기본 true) |
| `request_note` | STRING | 기사 요청사항 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |

---

#### `order_image_v2` — 주문 이미지
> 업로더/용도별 분류. fulfillment와 연결되어 방문별 이미지 구분 가능.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `fulfillment_id` | INTEGER | 소속 방문 (NULL이면 주문 단위 이미지) |
| `image_type` | STRING | USER_SUBMITTED(유저 배출) / PICKUP_BEFORE/AFTER(수거 전후) / PICKUP_WEIGHT(무게) / PICKUP_FAIL(수거실패) / DELIVERY_COMPLETED/FAILED(배송) |
| `uploader_type` | STRING | USER / RIDER / MANAGER |
| `uploader_id` | INTEGER | 업로더 ID |
| `image_uri` | STRING | 이미지 경로 |
| `content_type` | STRING | MIME 타입 (예: image/jpeg) |
| `bucket_name` | STRING | S3 버킷 이름 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `deleted_at` | TIMESTAMP | Soft delete |

---

#### `fulfillment` — 기사 1회 방문 시도
> **수거 결과 분석의 핵심 테이블.** 재방문 시 새 row 생성 → 1주문에 여러 fulfillment 가능.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | 소속 주문 (order_v2 참조) |
| `status` | STRING | 방문 상태 (Enum 참고) |
| `rider_id` | INTEGER | 배차된 기사 ID (**NULL이면 미배차**) |
| `failure_reason_code` | STRING | 방문 실패 사유 코드 |
| `failure_reason_message` | STRING | 방문 실패 사유 상세 메시지 |
| `scheduled_start_at` | TIMESTAMP | 예정 시작 시각 (22:00 KST 기준, UTC 저장) |
| `scheduled_end_at` | TIMESTAMP | 예정 종료 시각 (익일 06:00 KST) |
| `assigned_at` | TIMESTAMP | 배차 시각 |
| `ready_at` | TIMESTAMP | 수행 확정 시각 |
| `started_at` | TIMESTAMP | 현장 작업 시작 시각 |
| `completed_at` | TIMESTAMP | 방문 완료 시각 |
| `canceled_at` | TIMESTAMP | 방문 취소 시각 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |

**`fulfillment.status` Enum**

| 값 | 의미 |
|---|---|
| `CREATED` | 방문 예약 |
| `READY` | 수행 확정 |
| `RUNNING` | 현장 작업 중 |
| `COMPLETED` | 방문 완료 |
| `FAILED` | 방문 실패 (`failure_reason_code` 확인) |
| `CANCELED` | 방문 취소 |

**`fulfillment.failure_reason_code` Enum**

| 값 | 의미 |
|---|---|
| `NOTFOUND_FAIL` | 미배출 — 봉투가 없음 |
| `ENTER_FAIL` | 출입 실패 — 비밀번호 오류 등 |
| `POLICY_FAIL` | 정책 미준수 |

**수거 결과 집계 패턴 (1주문 다수 방문 대응)**
```sql
SELECT
  order_id,
  CASE
    WHEN COUNTIF(status = 'COMPLETED') > 0 THEN 'COMPLETED'
    WHEN COUNTIF(status = 'RUNNING')   > 0 THEN 'RUNNING'
    WHEN COUNTIF(status = 'READY')     > 0 THEN 'READY'
    ELSE 'FAILED'
  END AS final_result,
  COUNTIF(status = 'FAILED' AND failure_reason_code = 'NOTFOUND_FAIL') AS notfound_cnt,
  COUNTIF(status = 'FAILED' AND failure_reason_code = 'ENTER_FAIL')    AS enter_fail_cnt,
  COUNTIF(status = 'FAILED' AND failure_reason_code = 'POLICY_FAIL')   AS policy_fail_cnt
FROM `covering-app-ccd23.secure_dataset.fulfillment`
GROUP BY order_id
```

---

#### `fulfillment_item` — 방문별 항목 수행 결과
> 기사가 결과 입력 시에만 row 생성. **미수행=row 없음**. 무게는 g 단위.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `fulfillment_id` | INTEGER | 소속 방문 |
| `order_line_id` | INTEGER | 대상 주문 항목 |
| `item_status` | STRING | SUCCESS(성공) / FAILED(실패) — 미수행은 row 자체 없음 |
| `actual_quantity` | INTEGER | 실제 수행 수량 |
| `actual_weight_grams` | INTEGER | **측정 무게 (g 단위) — kg 변환 시 ÷1000** |
| `failure_reason_code` | STRING | 수행 실패 사유 코드 |
| `failure_reason_message` | STRING | 수행 실패 사유 상세 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |
| `deleted_at` | TIMESTAMP | 결과 정정 시 무효화용 Soft delete |

---

#### `fulfillment_status_event` — 방문 상태 변경 이력
> Append-only 감사 로그. 구조는 order_status_event와 동일.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `fulfillment_id` | INTEGER | 소속 방문 |
| `from_status` | STRING | 변경 전 상태 |
| `to_status` | STRING | 변경 후 상태 |
| `actor_type` | STRING | USER / RIDER / MANAGER / SYSTEM |
| `actor_id` | INTEGER | 행위자 ID |
| `reason` | STRING | 상태 변경 사유 |
| `metadata` | JSON | 추가 정보 |
| `created_at` | TIMESTAMP | 생성 시각 |

---

#### `fulfillment_assignment` — 기사 배정 및 작업 순서 큐
> 기사별 배정 정보 및 순서. 경로 최적화 이력 확인 가능.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `rider_id` | INTEGER | 배정된 기사 |
| `fulfillment_id` | INTEGER | 배정된 방문 (UNIQUE — 중복 배정 방지) |
| `sort_order` | INTEGER | 기사의 작업 순서 (1부터 시작, COMPLETED/FAILED 시 NULL) |
| `route_optimized_at` | TIMESTAMP | 마지막 경로 최적화 시각 (NULL이면 미최적화) |
| `assigned_at` | TIMESTAMP | 최초 배정 시각 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |

---

#### `fulfillment_message` — 기사 → 관리자 메시지
> 방문 중 기사가 상황 보고한 메시지.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `fulfillment_id` | INTEGER | 소속 방문 |
| `rider_id` | INTEGER | 메시지 작성 기사 |
| `message_body` | STRING | 메시지 내용 |
| `message_type` | STRING | STATUS_UPDATE(상황보고) / ISSUE_REPORT(이슈) / ACCESS_PROBLEM(출입문제) / OTHER |
| `status_at_message` | STRING | 메시지 작성 시점의 fulfillment 상태 |
| `created_at` | TIMESTAMP | 생성 시각 |

---

#### `product` — 상품/서비스 정의
> 주문 가능한 모든 서비스와 상품 목록.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `product_code` | STRING | 상품 코드 (고유) |
| `name` | STRING | 상품명 |
| `product_type` | STRING | **SERVICE=수거 서비스(무게 기반) / GOODS=봉투 등 상품(수량 기반)** |
| `description` | STRING | 상품 설명 |
| `is_active` | BOOLEAN | 활성 여부 (false면 주문 불가) |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |

---

#### `order_invoice` / `invoice` / `receipt` — 결제 도메인
> 레거시 `order_receipt`를 대체. order_v2 → order_invoice → invoice → receipt 순서로 연결.

**`order_invoice`** — 주문-청구서 연결 (N:M 브릿지)

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `invoice_id` | INTEGER | invoice 테이블 참조 |
| `created_at` | TIMESTAMP | 생성 시각 |

**`invoice`** — 청구서

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `invoice_number` | STRING | 청구서 번호 |
| `total_amount` | INTEGER | 청구 총액 |
| `status` | STRING | 청구 상태 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |

**`receipt`** — 영수증/결제 결과

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `invoice_id` | INTEGER | invoice 참조 |
| `user_payment_method_id` | INTEGER | 사용된 결제수단 |
| `payment_method_type` | STRING | 결제 수단 유형 |
| `status` | STRING | 결제 상태 |
| `total_amount` | INTEGER | 결제 금액 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |
| `deleted_at` | TIMESTAMP | Soft delete |

---

#### `user` — 유저

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `uuid` | STRING | UUID |
| `nickname` | STRING | 닉네임 |
| `grade` | STRING | 등급 |
| `signup_referral_channel` | STRING | 가입 유입 채널 |
| `payment_policy_id` | INTEGER | 유저 결제 정책 ID |
| `masked_phone` | STRING | 마스킹된 전화번호 |
| `created_date` | TIMESTAMP | 가입 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `withdrawal_date` | TIMESTAMP | 탈퇴 시각 (**NULL이면 활성 유저**) |

---

#### `withdrawal` — 탈퇴 기록
> 탈퇴 시점의 유저 정보를 스냅샷으로 보관. 탈퇴 분석 시 활용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | PK |
| `user_id` | INTEGER | 유저 ID |
| `user_uuid` | STRING | UUID |
| `user_invite_code` | STRING | 초대 코드 (가입 시 사용한 코드) |
| `user_nickname` | STRING | 닉네임 |
| `phone_hash` | STRING | 해시된 전화번호 |
| `grade` | STRING | 탈퇴 시점 등급 |
| `withdrawal_reason` | STRING | 탈퇴 사유 |
| `withdrawal_reason_detail` | STRING | 탈퇴 사유 상세 |
| `last_active_address` | STRING | 마지막 활성 주소 |
| `last_order_date` | TIMESTAMP | 마지막 주문 일시 |
| `signup_referral_channel` | STRING | 가입 유입 채널 |
| `signup_date` | TIMESTAMP | 가입 일시 |
| `withdrawal_date` | TIMESTAMP | 탈퇴 일시 |

---

#### `subscription` / `subscription_plan` — 구독

**`subscription`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | 유저 ID |
| `subscription_plan_id` | INTEGER | 구독 플랜 |
| `status` | STRING | ACTIVE / CANCELLED / EXPIRED |
| `current_period_start_date` | DATE | 현재 구독 기간 시작일 |
| `current_period_end_date` | DATE | 현재 구독 기간 종료일 |
| `canceled_at` | TIMESTAMP | 해지 일시 |
| `renewed_at` | TIMESTAMP | 갱신 시각 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 수정 시각 |

**`subscription_plan`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `plan_name` | STRING | 플랜명 |
| `description` | STRING | 플랜 설명 |
| `price` | INTEGER | 가격 |
| `billing_cycle_days` | INTEGER | 결제 주기 (일 단위) |

---

#### `coupon_policy` / `user_coupon` — 쿠폰

**`coupon_policy`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `description` | STRING | 쿠폰 설명 |
| `discount_type` | STRING | FIXED(정액할인) / PERCENTAGE(정률할인) |
| `amount` | INTEGER | 할인 금액 또는 비율 |
| `max_discount_amount` | INTEGER | 최대 할인 한도 |
| `min_order_amount` | INTEGER | 최소 주문 금액 |
| `limit_per_coupon` | INTEGER | 쿠폰 전체 사용 한도 |
| `limit_per_user` | INTEGER | 유저당 사용 한도 |
| `expire_type` | STRING | 만료 방식 (FIXED_DATE / DAYS_AFTER_ISSUE 등) |
| `expire_day` | INTEGER | 발급 후 만료까지 일수 (expire_type=DAYS_AFTER_ISSUE 시 사용) |
| `code_type` | STRING | 코드 유형 |
| `remark` | STRING | 내부 비고 |
| `expire_date` | TIMESTAMP | 만료 일시 (expire_type=FIXED_DATE 시 사용) |

**`user_coupon`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | 유저 ID |
| `coupon_id` | INTEGER | 쿠폰 ID (`coupon` 테이블 참조) |
| `coupon_policy_id` | INTEGER | 쿠폰 정책 ID |
| `expire_date` | TIMESTAMP | 만료 일시 |
| `disabled_date` | TIMESTAMP | 사용/비활성화 일시 |
| `created_date` | TIMESTAMP | 발급 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `deleted_date` | TIMESTAMP | Soft delete |

---

#### `feature_flag` — 기능 플래그
> 마이그레이션 롤아웃 및 앱별 기능 제어. 어떤 기능이 켜져 있는지 확인 가능.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `name` | STRING | 플래그 이름 (`domain.feature_name` 형식, 예: order.read_create) |
| `enabled` | BOOLEAN | 전역 활성화 여부 |
| `description` | STRING | 플래그 설명 및 용도 |
| `service_type` | STRING | CORE(고객앱) / ADMIN(백오피스) / RIDER(기사앱) / BATCH / LIVE / NULL=전체 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 최종 수정 시각 |

---

#### `company` — B2B 기업 정보
> B2B 고객사 기본 정보. order_v2.company_id와 조인하여 기업별 분석에 사용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `uuid` | STRING | UUID |
| `company_name` | STRING | 기업명 |
| `manager_name` | STRING | 담당자 이름 |
| `masked_manager_phone` | STRING | 마스킹된 담당자 전화번호 |
| `manager_email` | STRING | 담당자 이메일 |
| `masked_company_tel` | STRING | 마스킹된 기업 대표 전화번호 |
| `created_date` | TIMESTAMP | 생성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `withdrawal_date` | TIMESTAMP | 탈퇴 시각 (NULL이면 활성) |

---

#### `rider` — 기사 정보
> 수거 기사 기본 정보. fulfillment.rider_id와 조인하여 기사별 분석에 사용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `uuid` | STRING | UUID |
| `username` | STRING | 기사 이름 |
| `masked_phone` | STRING | 마스킹된 전화번호 |
| `active_flag` | BOOLEAN | 활성 여부 |
| `final_destination` | STRING | 최종 거점 |
| `color_code` | STRING | 기사 식별 색상 코드 |
| `work_days` | JSON | 근무 요일 설정 |
| `work_shift` | STRING | 근무 시프트 |
| `vehicle_number` | STRING | 차량 번호 |
| `created_date` | TIMESTAMP | 등록 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `withdrawal_date` | TIMESTAMP | 탈퇴 시각 (NULL이면 활성) |

---

#### `manager` — 운영자 정보
> 백오피스 운영자 계정. order_status_event.actor_type='MANAGER' 분석 시 조인.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `uuid` | STRING | UUID |
| `username` | STRING | 운영자 이름 |
| `role` | STRING | 역할 (ADMIN / OPERATOR 등) |
| `masked_phone` | STRING | 마스킹된 전화번호 |
| `created_date` | TIMESTAMP | 생성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `withdrawal_date` | TIMESTAMP | 탈퇴 시각 |

---

#### `payment_policy` — 가격 정책
> 주문/유저/서비스 지역에 연결된 가격 정책. 세부 요금 규칙은 policy JSON 안에 저장.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `policy` | JSON | 가격 정책 상세 규칙 (kg별 요금 등) |
| `description` | STRING | 정책 설명 |
| `created_date` | TIMESTAMP | 생성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `deleted_date` | TIMESTAMP | Soft delete |

---

#### `address` — 주소 마스터
> 유저/기업 주소 원본 레코드. order_address_snapshot.address_id로 참조됨.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `road_address` | STRING | 도로명 주소 |
| `region_address` | STRING | 지역 주소 |
| `h_code` | STRING | 행정동 코드 |
| `b_code` | STRING | 법정동 코드 |
| `created_date` | TIMESTAMP | 생성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `deleted_date` | TIMESTAMP | Soft delete |

---

#### `service_region` — 서비스 지역
> 수거 서비스 운영 지역. 지역별 분석, 운영 지역 확인에 사용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `payment_policy_id` | INTEGER | 지역 가격 정책 ID (**⚠️ 제거 예정 컬럼**) |
| `days` | JSON | 수거 가능 요일 |
| `region_1_depth_name` | STRING | 시/도 (예: 서울특별시) |
| `region_2_depth_name` | STRING | 구/군 (예: 강남구) |
| `h_name` | STRING | 행정동명 |
| `h_code` | STRING | 행정동 코드 |
| `pickup_start_time` | TIMESTAMP | 수거 시작 시각 |
| `pickup_end_time` | TIMESTAMP | 수거 종료 시각 |
| `active_flag` | BOOLEAN | 운영 여부 |
| `created_date` | TIMESTAMP | 생성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `deleted_date` | TIMESTAMP | Soft delete |

---

#### `comment` — 유저 리뷰
> 유저가 수거 서비스에 남긴 리뷰. `order_id`로 주문과 연결 가능.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `address_id` | INTEGER | 주소 ID |
| `order_id` | INTEGER | order_v2 참조 (**주의**: `comment.order_v2_id` 미반영 — order_id 컬럼 사용) |
| `user_id` | INTEGER | 작성 유저 ID |
| `company_id` | INTEGER | B2B 기업 ID (NULL=B2C) |
| `manager_id` | INTEGER | 관련 운영자 ID |
| `rider_id` | INTEGER | 수거 기사 ID |
| `comment` | STRING | 리뷰 텍스트 |
| `provider_type` | STRING | 작성 주체 유형 |
| `created_date` | TIMESTAMP | 작성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `deleted_date` | TIMESTAMP | Soft delete |

---

#### `coupon` — 쿠폰 코드
> 실제 발급된 쿠폰 코드. coupon_policy와 1:N. user_coupon.coupon_id로 참조됨.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `coupon_policy_id` | INTEGER | 쿠폰 정책 참조 |
| `code` | STRING | 쿠폰 코드 (고유) |
| `created_date` | TIMESTAMP | 생성 시각 |
| `updated_date` | TIMESTAMP | 수정 시각 |
| `deleted_date` | TIMESTAMP | Soft delete |

---

#### `payment_event` — 결제 이벤트 로그
> 결제 시도/완료/실패 이벤트 로그. invoice 기준으로 결제 흐름 추적.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `invoice_id` | INTEGER | invoice 참조 |
| `user_payment_method_id` | INTEGER | 사용된 결제수단 |
| `amount` | INTEGER | 결제 시도 금액 |
| `status` | STRING | 결제 이벤트 상태 |
| `method_type` | STRING | 결제 수단 유형 |
| `trigger_source` | STRING | 결제 트리거 출처 (USER / BATCH 등) |
| `created_at` | TIMESTAMP | 이벤트 발생 시각 |

---

#### `subscription_invoice` — 구독-청구서 연결
> 구독과 invoice의 N:M 브릿지. 구독 결제 내역 추적에 사용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `invoice_id` | INTEGER | invoice 참조 |
| `subscription_id` | INTEGER | subscription 참조 |

---

#### `experiment` / `assignment` — A/B 테스트
> 실험 설정 및 유저 배정 정보. 기능 실험 효과 분석 시 사용.

**`experiment`** — 실험 정의

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `name` | STRING | 실험명 |
| `status` | STRING | 실험 상태 |
| `hashing_salt` | STRING | 배정 해시 솔트 |
| `total_traffic_percent` | INTEGER | 총 트래픽 비율 (%) |
| `start_at` | TIMESTAMP | 실험 시작 시각 |
| `end_at` | TIMESTAMP | 실험 종료 시각 |
| `created_at` | TIMESTAMP | 생성 시각 |
| `updated_at` | TIMESTAMP | 수정 시각 |

**`assignment`** — 유저-변이군 배정

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `experiment_id` | INTEGER | experiment 참조 |
| `user_id` | INTEGER | 배정된 유저 |
| `variant_id` | INTEGER | 배정된 변이군 ID |
| `source` | STRING | 배정 소스 |
| `assigned_at` | TIMESTAMP | 배정 시각 |

---

#### 🚫 레거시 테이블 (참고 전용 — 신규 쿼리 작성 금지)

| 테이블 | 대체 테이블 | 비고 |
|---|---|---|
| `order` | `order_v2` | 마이그레이션 완료 |
| `order_status_log` | `order_status_event` | 마이그레이션 완료 |
| `order_image` | `order_image_v2` | 마이그레이션 완료 |
| `order_receipt` | `invoice` + `receipt` | 마이그레이션 완료 |
| `order_receipt_v2` | `invoice` + `receipt` | 마이그레이션 완료 |
| `prev_db_order` | `order_v2` | 이전 DB 이관 데이터, 폐기 예정 |

---

### 2.5 cx_data 스키마

#### `channel_talk_userchat` — 상담 채팅방 (핵심)
> 고객 1건 상담 = 1 row. 응답 시간·처리 시간 분석의 핵심 테이블.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | 채팅 고유 ID (PK) |
| `userId` | STRING | 채널톡 사용자 ID |
| `state` | STRING | 상태 (opened / closed 등) |
| `assigneeId` | STRING | 할당된 상담사 ID |
| `tags` | STRING | 태그 (콤마 구분) |
| `firstAskedAt` | TIMESTAMP | 최초 문의 시각 |
| `firstOpenedAt` | TIMESTAMP | 최초 상담 오픈 시각 |
| `firstRepliedAt` | TIMESTAMP | 최초 응답 시각 |
| `firstRepliedAtAfterOpen` | TIMESTAMP | 오픈 후 최초 응답 시각 |
| `openedAt` | TIMESTAMP | 오픈 시각 |
| `closedAt` | TIMESTAMP | 종료 시각 |
| `waitingTime` | INTEGER | 대기 시간 (ms) |
| `avgReplyTime` | INTEGER | 평균 응답 시간 (ms) |
| `totalReplyTime` | INTEGER | 총 응답 시간 (ms) |
| `replyCount` | INTEGER | 응답 횟수 |
| `operationWaitingTime` | INTEGER | 운영시간 내 대기 시간 (ms) |
| `operationAvgReplyTime` | INTEGER | 운영시간 내 평균 응답 시간 (ms) |
| `operationTotalReplyTime` | INTEGER | 운영시간 내 총 응답 시간 (ms) |
| `operationReplyCount` | INTEGER | 운영시간 내 응답 횟수 |
| `profile_csat` | INTEGER | CSAT 점수 |
| `profile_csatComment` | STRING | CSAT 코멘트 |
| `workflow_sectionPath` | STRING | 챗봇 경로 |
| `workflow_causeOfEnd` | STRING | 챗봇 종료 원인 |

---

#### `channel_talk_messages` — 개별 메시지

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | 메시지 고유 ID (PK) |
| `chatId` | STRING | 소속 채팅 ID |
| `personType` | STRING | 발신자 유형 (user / manager / bot) |
| `personId` | STRING | 발신자 ID |
| `plainText` | STRING | 메시지 텍스트 |
| `isPrivate` | BOOLEAN | 비공개 여부 (내부 메모) |
| `createdAt` | TIMESTAMP | 생성 시각 |

---

#### `channel_talk_managers` — 상담사 목록

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | 상담사 ID |
| `name` | STRING | 상담사 이름 |
| `email` | STRING | 이메일 |
| `removed` | BOOLEAN | 삭제 여부 |
| `operator` | BOOLEAN | 운영자 여부 |
| `createdAt` | TIMESTAMP | 생성 시각 |

---

#### `channel_talk_users` — 채널톡 사용자

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | 사용자 고유 ID (PK) |
| `memberId` | STRING | 서비스 회원 ID |
| `type` | STRING | lead(비회원) / member(회원) |
| `name` | STRING | 이름/전화번호 |
| `blocked` | BOOLEAN | 차단 여부 |
| `sessionsCount` | INTEGER | 세션 수 |
| `lastSeenAt` | TIMESTAMP | 마지막 접속 |
| `hasChat` | BOOLEAN | 채팅 여부 |
| `tags` | STRING | 태그 (콤마 구분) |

---

### 2.6 mixpanel 스키마

#### `mp_master_event` — 전체 이벤트 로그

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `event_name` | STRING | 이벤트명 |
| `user_id` | STRING | 유저 ID |
| `distinct_id` | STRING | Mixpanel 식별자 |
| `device_id` | STRING | 디바이스 ID |
| `time` | TIMESTAMP | 이벤트 발생 시각 |
| `properties` | JSON | 이벤트 상세 속성 |

> 이벤트 속성은 `properties` JSON 안에 있어 조회 시 `JSON_VALUE(properties, '$.속성명')` 형태로 추출

---

### 2.7 Phase 4 미반영 항목

> 2026-04-07 실측 기준. 아래 항목은 쿼리에 사용하지 말 것.

| 항목 | 상태 | 영향 |
|---|---|---|
| `company.payment_policy_id` | ❌ 미반영 | B2B별 결제 정책 연결 불가 |
| `comment.order_v2_id` | ❌ 미반영 | 리뷰를 주문 기준으로 조회 불가 |
| `comment.like_count` | ❌ 미반영 | 좋아요 수 조회 불가 |
| `service_region.payment_policy_id` | ⚠️ 제거 예정 | 현재는 컬럼 존재, 추후 삭제 예정 |
| `payment_policy` 테이블 | ✅ 반영됨 | 쿼리 가능 |
| `invoice` 테이블 | ✅ 반영됨 | 쿼리 가능 |

---

### 2.8 비즈니스 메트릭 정의 (KPI)

#### 사용자 메트릭
| 메트릭 | 정의 | 산출 공식 |
|--------|------|-----------|
| **DAU** | 일간 활성 사용자 | 해당 일에 주문을 생성한 고유 user_id 수 |
| **WAU** | 주간 활성 사용자 | 해당 주에 주문을 생성한 고유 user_id 수 |
| **MAU** | 월간 활성 사용자 | 해당 월에 주문을 생성한 고유 user_id 수 |
| **신규 가입자** | 신규 가입 사용자 | `user.created_date`가 해당 기간인 사용자 수 |
| **탈퇴율** | 탈퇴 비율 | 탈퇴 사용자 수 / 전체 사용자 수 |

#### 주문 메트릭
| 메트릭 | 정의 | 산출 공식 |
|--------|------|-----------|
| **일일 주문 수** | 하루 총 주문 건수 | `COUNT(order_v2.id) WHERE DATE(created_at) = 대상일` |
| **주문 완료율** | 완료된 주문 비율 | COMPLETED 주문 / 전체 주문 × 100 |
| **AOV** | 평균 주문 금액 | `AVG(receipt.total_amount)` |
| **쿠폰 사용률** | 쿠폰 적용 주문 비율 | `user_coupon_id IS NOT NULL` 주문 / 전체 주문 × 100 |

#### 수거 메트릭
| 메트릭 | 정의 |
|--------|------|
| **수거 완료율** | `fulfillment.status = 'COMPLETED'` / 전체 fulfillment |
| **수거 실패율** | `fulfillment.status = 'FAILED'` / 전체 fulfillment |
| **미배출 비율** | `failure_reason_code = 'NOTFOUND_FAIL'` / FAILED fulfillment |
| **평균 무게 (kg)** | `AVG(fulfillment_item.actual_weight_grams) / 1000` |

#### 구독 메트릭
| 메트릭 | 정의 |
|--------|------|
| **구독 전환율** | 구독 시작한 사용자 / 전체 사용자 |
| **구독 유지율** | 활성 구독 / 전체 구독 시작자 |
| **MRR** | 월간 반복 매출 = 활성 구독자 × 구독 플랜 가격 |

---

## 3. BigQuery 기본 사용법

### 3.1 데이터셋 및 테이블 조회

```bash
# 모든 데이터셋 목록
bq ls

# 데이터셋 내 테이블 목록
bq ls secure_dataset

# 테이블 스키마 확인
bq show secure_dataset.order_v2

# 테이블 상세 정보 (JSON 형식)
bq show --schema --format=prettyjson secure_dataset.order_v2

# 처음 10개 행 미리보기
bq head -n 10 secure_dataset.order_v2
```

### 3.2 쿼리 실행

#### 기본 쿼리
```bash
bq query --use_legacy_sql=false '
SELECT
  user_id,
  COUNT(*) as order_count
FROM `covering-app-ccd23.secure_dataset.order_v2`
WHERE DATE(created_at) >= "2024-01-01"
  AND deleted_at IS NULL
GROUP BY user_id
LIMIT 100
'
```

#### 쿼리 비용 예측 (Dry Run)
```bash
bq query --dry_run --use_legacy_sql=false '
SELECT * FROM `covering-app-ccd23.secure_dataset.order_v2`
'
```

### 3.3 데이터 추출 규칙

> **필수**: 모든 분석 결과는 CSV + TXT 파일로 저장해야 합니다!

#### 저장 규칙
| 항목 | 규칙 |
|------|------|
| **저장 위치** | `datas/` 디렉토리 |
| **파일명 형식** | `YYYYMMDD_HHMMSS_분석명.csv` + `YYYYMMDD_HHMMSS_분석명.txt` |
| **CSV 파일** | 순수 데이터만 (헤더 + 데이터) |
| **TXT 파일** | 메타데이터 (쿼리 설명, 컬럼 설명, 실행 쿼리 등) |

#### 표준 템플릿
```bash
mkdir -p datas
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BASENAME="datas/${TIMESTAMP}_분석명"

QUERY='
SELECT ...
FROM `covering-app-ccd23.secure_dataset.table`
WHERE ...
'

# 1. 메타데이터를 TXT 파일로 저장
{
  echo "쿼리 설명: [분석 목적]"
  echo "테이블: [사용 테이블]"
  echo "추출 일시: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "조건: [WHERE 조건 요약]"
  echo "컬럼 설명: [col1=설명1, col2=설명2, ...]"
  echo ""
  echo "=== 실행 쿼리 ==="
  echo "$QUERY"
} > "${BASENAME}.txt"

# 2. 데이터를 CSV 파일로 저장
bq query --use_legacy_sql=false --format=csv "$QUERY" > "${BASENAME}.csv"
```

### 3.4 유용한 옵션

```bash
bq query --max_rows=1000 'SELECT ...'
bq query --location=US 'SELECT ...'
bq query --format=json 'SELECT ...'
bq query --format=csv --field_delimiter='|' 'SELECT ...'
```

---

## 4. 데이터 분석 가이드

### 4.1 탐색적 데이터 분석 (EDA)

#### 기본 통계 확인
```sql
SELECT
  COUNT(*) as total_rows,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(created_at) as earliest_date,
  MAX(created_at) as latest_date
FROM `covering-app-ccd23.secure_dataset.order_v2`
WHERE deleted_at IS NULL
```

#### 주문 상태 분포
```sql
SELECT
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM `covering-app-ccd23.secure_dataset.order_v2`
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY count DESC
```

### 4.2 핵심 분석 쿼리 템플릿

#### DAU/WAU/MAU 계산
```sql
WITH daily_users AS (
  SELECT
    DATE(created_at) as date,
    user_id
  FROM `covering-app-ccd23.secure_dataset.order_v2`
  WHERE deleted_at IS NULL
    AND user_id IS NOT NULL
)
SELECT
  date,
  COUNT(DISTINCT user_id) as DAU,
  COUNT(DISTINCT user_id) OVER (
    ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as WAU_rolling,
  COUNT(DISTINCT user_id) OVER (
    ORDER BY date ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
  ) as MAU_rolling
FROM daily_users
GROUP BY date
ORDER BY date DESC
```

#### 수거 결과 집계 (fulfillment 기준)
```sql
SELECT
  f.order_id,
  o.status AS order_status,
  COUNT(f.id) AS visit_count,
  COUNTIF(f.status = 'COMPLETED') AS completed_visits,
  COUNTIF(f.status = 'FAILED') AS failed_visits,
  COUNTIF(f.failure_reason_code = 'NOTFOUND_FAIL') AS notfound_cnt,
  SUM(fi.actual_weight_grams) / 1000.0 AS total_weight_kg
FROM `covering-app-ccd23.secure_dataset.order_v2` o
JOIN `covering-app-ccd23.secure_dataset.fulfillment` f ON o.id = f.order_id
LEFT JOIN `covering-app-ccd23.secure_dataset.fulfillment_item` fi ON f.id = fi.fulfillment_id
WHERE DATE(o.created_at) >= '2026-01-01'
  AND o.deleted_at IS NULL
GROUP BY f.order_id, o.status
```

#### 취소 주체별 분석
```sql
SELECT
  actor_type,
  COUNT(*) as cancel_count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as pct
FROM `covering-app-ccd23.secure_dataset.order_status_event`
WHERE to_status = 'CANCELED'
GROUP BY actor_type
ORDER BY cancel_count DESC
```

#### RFM 분석 (신규 테이블 기준)
```sql
WITH user_rfm AS (
  SELECT
    o.user_id,
    DATE_DIFF(CURRENT_DATE(), MAX(DATE(o.created_at)), DAY) as recency,
    COUNT(*) as frequency,
    SUM(COALESCE(r.total_amount, 0)) as monetary
  FROM `covering-app-ccd23.secure_dataset.order_v2` o
  LEFT JOIN `covering-app-ccd23.secure_dataset.order_invoice` oi ON o.id = oi.order_id
  LEFT JOIN `covering-app-ccd23.secure_dataset.invoice` inv ON oi.invoice_id = inv.id
  LEFT JOIN `covering-app-ccd23.secure_dataset.receipt` r ON inv.id = r.invoice_id
  WHERE o.deleted_at IS NULL AND o.user_id IS NOT NULL
  GROUP BY o.user_id
),
rfm_scores AS (
  SELECT *,
    NTILE(5) OVER (ORDER BY recency DESC) as r_score,
    NTILE(5) OVER (ORDER BY frequency ASC) as f_score,
    NTILE(5) OVER (ORDER BY monetary ASC) as m_score
  FROM user_rfm
)
SELECT
  user_id, recency, frequency, monetary,
  CONCAT(CAST(r_score AS STRING), CAST(f_score AS STRING), CAST(m_score AS STRING)) as rfm_segment
FROM rfm_scores
ORDER BY monetary DESC
```

#### Day N 리텐션 분석
```sql
WITH user_signup AS (
  SELECT id as user_id, DATE(created_date) as signup_date
  FROM `covering-app-ccd23.secure_dataset.user`
  WHERE withdrawal_date IS NULL
),
user_orders AS (
  SELECT user_id, DATE(created_at) as order_date
  FROM `covering-app-ccd23.secure_dataset.order_v2`
  WHERE deleted_at IS NULL
)
SELECT
  u.signup_date,
  COUNT(DISTINCT u.user_id) as cohort_size,
  ROUND(COUNT(DISTINCT CASE WHEN DATE_DIFF(o.order_date, u.signup_date, DAY) = 1 THEN u.user_id END) * 100.0 / COUNT(DISTINCT u.user_id), 2) as day1_retention,
  ROUND(COUNT(DISTINCT CASE WHEN DATE_DIFF(o.order_date, u.signup_date, DAY) = 7 THEN u.user_id END) * 100.0 / COUNT(DISTINCT u.user_id), 2) as day7_retention,
  ROUND(COUNT(DISTINCT CASE WHEN DATE_DIFF(o.order_date, u.signup_date, DAY) = 30 THEN u.user_id END) * 100.0 / COUNT(DISTINCT u.user_id), 2) as day30_retention
FROM user_signup u
LEFT JOIN user_orders o ON u.user_id = o.user_id
GROUP BY u.signup_date
ORDER BY u.signup_date DESC
```

#### 구독 전환 분석
```sql
WITH user_subscription AS (
  SELECT
    u.id as user_id,
    u.created_date as signup_date,
    s.id as subscription_id,
    s.status as subscription_status,
    sp.plan_name,
    sp.price
  FROM `covering-app-ccd23.secure_dataset.user` u
  LEFT JOIN `covering-app-ccd23.secure_dataset.subscription` s ON u.id = s.user_id
  LEFT JOIN `covering-app-ccd23.secure_dataset.subscription_plan` sp ON s.subscription_plan_id = sp.id
  WHERE u.withdrawal_date IS NULL
)
SELECT
  DATE_TRUNC(signup_date, MONTH) as signup_month,
  COUNT(DISTINCT user_id) as total_users,
  COUNT(DISTINCT CASE WHEN subscription_id IS NOT NULL THEN user_id END) as subscribed_users,
  ROUND(COUNT(DISTINCT CASE WHEN subscription_id IS NOT NULL THEN user_id END) * 100.0 / COUNT(DISTINCT user_id), 2) as conversion_rate
FROM user_subscription
GROUP BY signup_month
ORDER BY signup_month DESC
```

#### 시계열 분석 (이동 평균, 전일 대비)
```sql
WITH daily_metrics AS (
  SELECT
    DATE(created_at) as date,
    COUNT(*) as daily_count
  FROM `covering-app-ccd23.secure_dataset.order_v2`
  WHERE deleted_at IS NULL
  GROUP BY date
)
SELECT
  date,
  daily_count,
  AVG(daily_count) OVER (ORDER BY date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) as moving_avg_7d,
  LAG(daily_count) OVER (ORDER BY date) as prev_day_count,
  ROUND((daily_count - LAG(daily_count) OVER (ORDER BY date)) * 100.0 /
    NULLIF(LAG(daily_count) OVER (ORDER BY date), 0), 2) as growth_rate
FROM daily_metrics
ORDER BY date DESC
```

### 4.3 성능 최적화 팁

| 팁 | 설명 |
|----|------|
| **컬럼 선택** | `SELECT *` 대신 필요한 컬럼만 명시 |
| **파티션 활용** | `WHERE DATE(created_at) >= "2024-01-01"` |
| **APPROX 함수** | 근사값으로 빠른 분석: `APPROX_COUNT_DISTINCT()` |
| **LIMIT 사용** | 탐색 시 `LIMIT` 으로 결과 제한 |

```sql
SELECT
  APPROX_COUNT_DISTINCT(user_id) as approx_unique_users
FROM `covering-app-ccd23.secure_dataset.order_v2`
```

### 4.4 쿼리 결과 검증 (Feedback Loop)

#### 검증 체크리스트

| 단계 | 검증 항목 |
|------|----------|
| 1 | 행 수 확인 — 예상 범위 내인지 |
| 2 | NULL/0 값 확인 — 예상치 못한 NULL이나 0 |
| 3 | 합계 검증 — 부분합이 전체합과 일치하는지 |
| 4 | 날짜 범위 확인 — WHERE 조건이 결과에 반영되었는지 |
| 5 | 샘플 수동 검증 — 몇 개 행을 직접 계산해서 비교 |
| 6 | 교차 검증 — 다른 방식의 쿼리로 같은 결과가 나오는지 |

#### 쿼리 작성 전 체크리스트

```
□ order 대신 order_v2 사용했는가?
□ 주문 상태값이 새 Enum인가? (CREATED / READY / IN_PROGRESS / COMPLETED / CANCELED)
□ 수거 결과는 fulfillment 테이블 기준으로 조회했는가?
□ 무게 데이터 사용 시 g → kg 변환(÷1000) 했는가?
□ 취소 주체 구분 시 actor_type 컬럼 사용했는가?
□ 날짜 파티션 필터를 DATE(created_at) 기준으로 걸었는가?
□ Phase 4 미반영 컬럼(company.payment_policy_id 등)을 사용하진 않았는가?
□ 1주문 다수 fulfillment 가능성을 고려했는가? (집계 시 COUNTIF 활용)
□ SELECT * 없이 필요한 컬럼만 명시했는가?
□ KST 변환이 필요한 경우 DATETIME(컬럼, 'Asia/Seoul') 사용했는가?
```

**시각 관련**
- 모든 TIMESTAMP는 **UTC 저장** → KST 변환 시 `DATETIME(컬럼, 'Asia/Seoul')` 사용
- 수거 운영 시간: 22:00~익일 06:00 KST (UTC 기준 13:00~21:00)

---

## 5. 운영 가이드

### 5.1 데이터 품질 체크리스트

#### FK 무결성 체크
```sql
SELECT COUNT(*) as orphan_orders
FROM `covering-app-ccd23.secure_dataset.order_v2` o
LEFT JOIN `covering-app-ccd23.secure_dataset.user` u ON o.user_id = u.id
WHERE o.user_id IS NOT NULL AND u.id IS NULL
```

#### 중복 레코드 체크
```sql
SELECT id, COUNT(*) as cnt
FROM `covering-app-ccd23.secure_dataset.order_v2`
GROUP BY id
HAVING COUNT(*) > 1
```

#### NULL 비율 체크
```sql
SELECT
  ROUND(COUNTIF(user_id IS NULL) * 100.0 / COUNT(*), 2) as user_id_null_pct,
  ROUND(COUNTIF(status IS NULL) * 100.0 / COUNT(*), 2) as status_null_pct
FROM `covering-app-ccd23.secure_dataset.order_v2`
WHERE deleted_at IS NULL
```

#### 일일 모니터링 (이상 감지)
```sql
WITH daily_metrics AS (
  SELECT
    DATE(created_at) as date,
    COUNT(*) as order_count,
    AVG(COUNT(*)) OVER (ORDER BY DATE(created_at) ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING) as avg_7d
  FROM `covering-app-ccd23.secure_dataset.order_v2`
  WHERE deleted_at IS NULL
  GROUP BY DATE(created_at)
)
SELECT date, order_count, ROUND(avg_7d, 0) as avg_7d,
  ROUND((order_count - avg_7d) / NULLIF(avg_7d, 0) * 100, 1) as pct_change
FROM daily_metrics
WHERE ABS((order_count - avg_7d) / NULLIF(avg_7d, 0)) > 0.3
ORDER BY date DESC
```

### 5.2 문제 해결

#### Windows 환경 (bq 명령어 실행)

Windows에서 bash 환경 (Git Bash, WSL 등)을 사용할 때 `bq` 명령어가 실행되지 않는 경우 배치 파일로 우회합니다.

**전체 워크플로우**
```bash
# 1. 배치 파일 생성
cat > run_query.bat << 'EOF'
@echo off
chcp 65001 >nul
set PATH=%PATH%;C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin
bq query --use_legacy_sql=false --format=csv "SELECT ..."
EOF

# 2. 실행 및 결과 저장
cmd //c "run_query.bat" > datas/result.csv

# 3. 배치 파일 삭제
rm run_query.bat
```

**gcloud 인증 (Windows)**
```bash
"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" auth login
"C:\Users\hound\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" config set project covering-app-ccd23
```

#### 인증 오류
```bash
gcloud auth revoke
gcloud auth login
```

#### 쿼리 비용 관리
```bash
bq query --dry_run 'YOUR_QUERY'
# 출력: "Query will process X bytes"
```

### 5.3 스키마 관리

#### 테이블 스키마 조회
```bash
bq show --schema --format=prettyjson secure_dataset.order_v2
bq show --schema --format=prettyjson secure_dataset.fulfillment
bq show --schema --format=prettyjson secure_dataset.fulfillment_item
```

#### 문서 업데이트 절차
1. `bq show --schema` 로 실제 스키마 확인
2. 이 문서의 "2.4 현재 테이블 스키마" 섹션 업데이트
3. 레거시 여부 확인 후 "🚫 레거시 테이블" 섹션 업데이트
4. 마지막 업데이트 날짜 기록

---

## 6. 부록

### 추가 리소스

| 리소스 | 링크 |
|--------|------|
| BigQuery 공식 문서 | https://cloud.google.com/bigquery/docs |
| bq CLI 레퍼런스 | https://cloud.google.com/bigquery/docs/bq-command-line-tool |
| SQL 레퍼런스 | https://cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax |

### 디렉토리 구조

```
bigquery-agent/
├── CLAUDE.md              # 이 문서
└── datas/                  # 추출된 데이터 저장
    ├── YYYYMMDD_HHMMSS_분석명.csv
    ├── YYYYMMDD_HHMMSS_분석명.txt
    └── ...
```

### 빠른 시작 체크리스트

- [ ] `gcloud auth login` 으로 인증 완료
- [ ] `bq ls` 로 데이터셋 접근 확인
- [ ] `mkdir -p datas` 로 저장 디렉토리 생성
- [ ] 쿼리 작성 전 레거시 테이블 여부 확인

---

*최초 작성: 2026-01-23*
*마지막 업데이트: 2026-04-10 (migration_guide.md 통합 + BigQuery 실측 기준 신규 테이블 추가 — company, rider, manager, payment_policy, address, service_region, comment, coupon, payment_event, subscription_invoice, experiment/assignment; withdrawal/user_coupon/coupon_policy 스키마 보완)*
