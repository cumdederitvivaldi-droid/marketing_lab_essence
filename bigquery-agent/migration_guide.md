# Covering 데이터 분석 레퍼런스
**기준: 2026-04-07 BigQuery 실측**

---

## 1. 데이터셋 구성

| 데이터셋 | 역할 | 비고 |
|---|---|---|
| `secure_dataset` | 메인 — 주문, 유저, 결제, 구독 전체 | |
| `cx_data` | 채널톡 고객 상담 데이터 | |
| `mixpanel` | 앱 내 사용자 행동 이벤트 | |
| `ads_data` | 광고비, 채널별 마케팅 지출 | 접근 안 될 경우 권한 요청 필요 |
| `product` | 프로모션, 상품 기획 데이터 | 접근 안 될 경우 권한 요청 필요 |
| `bag_delivery` | 외부 배달 연동 데이터 | 접근 안 될 경우 권한 요청 필요 |

> 쿼리 작성 기본 prefix: `` `covering-app-ccd23.데이터셋명.테이블명` ``

---

## 2. 마이그레이션 변경 내역 (2026-04-01)

### 테이블 대체 현황

| 도메인 | 레거시 (신규 쿼리 작성 금지) | 현재 사용 테이블 |
|---|---|---|
| 주문 | `order` | `order_v2` |
| 주문 상태 이력 | `order_status_log` | `order_status_event` |
| 주문 이미지 | `order_image` | `order_image_v2` |
| 결제 영수증 | `order_receipt`, `order_receipt_v2` | `invoice` + `receipt` |
| 수거 실행 | *(없음)* | `fulfillment` (신규) |
| 수거 항목 결과 | *(없음)* | `fulfillment_item` (신규) |
| 주문 항목 변경 이력 | *(없음)* | `order_line_change_event` (신규) |

> `order`, `order_status_log`, `order_image`, `order_receipt`, `order_receipt_v2`, `prev_db_order` 테이블은 BigQuery에 여전히 존재하지만 신규 쿼리 작성 금지.

---

### 주문 상태 Enum 변경

| 레거시 `order.status` | 현재 `order_v2.status` | 의미 |
|---|---|---|
| `SUBMIT` | `CREATED` | 신규 접수 (아직 확정 전) |
| `ASSIGNED` | `READY` | 수거 예정 확정 (22시 배치 후) |
| *(없음)* | `IN_PROGRESS` | 수거 진행 중 |
| `PICKED_UP` → `COMPLETED` | `COMPLETED` | 수거 완료 |
| `CANCELLED` | `CANCELED` | 취소 (철자 변경: LL→L 주의) |

> **구버전 이력 조회 시에만** `order_status_log.status` 참고 (SUBMIT / RUNNING / PAYMENT_COMPLETED / NOTFOUND_FAIL / ENTER_FAIL / POLICY_FAIL / USER_CANCELED / ADMIN_CANCELED)

---

### 주요 컬럼 변경

| 항목 | 레거시 | 현재 | 주의사항 |
|---|---|---|---|
| 날짜 파티션 | `order.created_date` (DATE) | `DATE(order_v2.created_at)` | WHERE절 파티션 필터 변경 필요 |
| 라이더 정보 | `order.rider_id` | `fulfillment.rider_id` | fulfillment 테이블 조인 필요 |
| 수거 시각 | `order.pickup_start/end_time` | `fulfillment.scheduled_start/end_at` | fulfillment 테이블 조인 필요 |
| 무게 | `order.weight` (kg 단위) | `fulfillment_item.actual_weight_grams` (g 단위) | **÷1000 변환 필수** |
| 봉투 수 | `order.bag_request_count`, `pickup_bag_count` | `order_line.quantity`, `fulfillment_item.actual_quantity` | 요청량/실수행량 분리됨 |
| 취소 주체 | status값에 USER_CANCELED / ADMIN_CANCELED 포함 | `order_status_event.actor_type` = `USER` / `MANAGER` | 별도 컬럼으로 분리 |
| B2C/B2B 구분 | `order.customer_type` (USER / COMPANY) | `order_v2.company_id` NULL 여부 | NULL=B2C, NOT NULL=B2B |

---

## 3. 현재 테이블 상세 (secure_dataset)

### `order_v2` — 주문 (메인)
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

---

### `order_status_event` — 주문 상태 변경 이력
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

### `order_line` — 주문 항목
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

### `order_line_change_event` — 주문 항목 변경 이력
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

### `order_address_snapshot` — 주문 시점 주소 스냅샷
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

### `order_customer_snapshot` — 주문 시점 고객 정보 스냅샷
> 주문 생성 후 변경 불가 (불변). 고객이 나중에 정보를 바꿔도 주문 시점 값 보존.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `order_id` | INTEGER | order_v2 참조 |
| `customer_name` | STRING | 주문 시점 고객명 (불변) |
| `customer_phone` | STRING | 주문 시점 연락처 (불변) |
| `created_at` | TIMESTAMP | 생성 시각 |

---

### `order_access_instruction` — 출입 정보
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

### `order_image_v2` — 주문 이미지
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

### `fulfillment` — 기사 1회 방문 시도
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

### `fulfillment_item` — 방문별 항목 수행 결과
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

### `fulfillment_status_event` — 방문 상태 변경 이력
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

### `fulfillment_assignment` — 기사 배정 및 작업 순서 큐
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

### `fulfillment_message` — 기사 → 관리자 메시지
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

### `product` — 상품/서비스 정의
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

### `order_invoice` / `invoice` / `receipt` — 결제 도메인
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

### `user` — 유저

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

### `withdrawal` — 탈퇴 기록
> 탈퇴 시점의 유저 정보를 스냅샷으로 보관. 탈퇴 분석 시 활용.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | PK |
| `user_id` | INTEGER | 유저 ID |
| `user_uuid` | STRING | UUID |
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

### `subscription` / `subscription_plan` — 구독

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

### `coupon_policy` / `user_coupon` — 쿠폰

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
| `expire_type` | STRING | 만료 방식 |
| `code_type` | STRING | 코드 유형 |
| `remark` | STRING | 내부 비고 |
| `expire_date` | TIMESTAMP | 만료 일시 |

**`user_coupon`**

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | INTEGER | PK |
| `user_id` | INTEGER | 유저 ID |
| `coupon_id` | INTEGER | 쿠폰 ID |
| `coupon_policy_id` | INTEGER | 쿠폰 정책 ID |
| `expire_date` | TIMESTAMP | 만료 일시 |
| `disabled_date` | TIMESTAMP | 사용/비활성화 일시 |

---

### `feature_flag` — 기능 플래그
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

## 4. cx_data (채널톡 상담 데이터)

### `channel_talk_userchat` — 상담 채팅방 (핵심)
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

### `channel_talk_messages` — 개별 메시지

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

### `channel_talk_managers` — 상담사 목록

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | STRING | 상담사 ID |
| `name` | STRING | 상담사 이름 |
| `email` | STRING | 이메일 |
| `removed` | BOOLEAN | 삭제 여부 |
| `operator` | BOOLEAN | 운영자 여부 |
| `createdAt` | TIMESTAMP | 생성 시각 |

---

### `channel_talk_users` — 채널톡 사용자

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

## 5. mixpanel (앱 행동 이벤트)

### `mp_master_event` — 전체 이벤트 로그

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

## 6. Phase 4 미반영 항목 (2026-04-07 실측 기준)

| 항목 | 상태 | 영향 |
|---|---|---|
| `company.payment_policy_id` | ❌ 미반영 | B2B별 결제 정책 연결 불가 |
| `comment.order_v2_id` | ❌ 미반영 | 리뷰를 주문 기준으로 조회 불가 |
| `comment.like_count` | ❌ 미반영 | 좋아요 수 조회 불가 |
| `service_region.payment_policy_id` | ⚠️ 제거 예정 | 현재는 컬럼 존재, 추후 삭제 예정 |
| `payment_policy` 테이블 | ✅ 반영됨 | 쿼리 가능 |
| `invoice` 테이블 | ✅ 반영됨 | 쿼리 가능 |

---

## 7. 공통 주의사항 및 쿼리 체크리스트

**시각 관련**
- 모든 TIMESTAMP는 **UTC 저장** → KST 변환 시 `DATETIME(컬럼, 'Asia/Seoul')` 사용
- 수거 운영 시간: 22:00~익일 06:00 KST (UTC 기준 13:00~21:00)

**쿼리 작성 전 확인**
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
```

**B2B/B2C 필터**
```sql
WHERE company_id IS NOT NULL  -- B2B
WHERE company_id IS NULL      -- B2C
```
