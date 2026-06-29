# 2026-03-31 주문 도메인 마이그레이션 대응

## 배경

2026-03-31 오전에 신규 주문 도메인 마이그레이션이 진행되면서, 운영 자동화가 참조하던 레거시 테이블 일부가 신규 테이블 기준으로 해석돼야 하는 상태가 되었다.

이번 정리는 다음 두 가지를 목표로 진행했다.

- 운영 자동화가 `order_v2` / `fulfillment` 기준으로 정상 동작하도록 의존성 전환
- 스키마 그래프 문서가 신규 주문/방문 모델을 설명할 수 있도록 메타데이터 보강

## 라이브에서 확인한 사실

### 신규 핵심 테이블

- `secure_dataset.order_v2`
- `secure_dataset.order_customer_snapshot`
- `secure_dataset.order_address_snapshot`
- `secure_dataset.order_access_instruction`
- `secure_dataset.order_line`
- `secure_dataset.order_line_change_event`
- `secure_dataset.product`
- `secure_dataset.fulfillment`
- `secure_dataset.fulfillment_item`
- `secure_dataset.order_status_event`
- `secure_dataset.fulfillment_status_event`
- `secure_dataset.fulfillment_assignment`
- `secure_dataset.fulfillment_message`
- `secure_dataset.order_invoice`
- `secure_dataset.order_image_v2`
- `secure_dataset.feature_flag`

### 상태 체계

- 주문 상태: `CREATED`, `READY`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`
- 방문 상태: `CREATED`, `READY`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELED`
- 방문 실패 코드: `ACCESS_DENIED`, `NOT_FOUND`, `POLICY_VIOLATION`
- 백오피스/리포트 파생 라벨: `ENTER_FAIL`, `NOTFOUND_FAIL`, `POLICY_FAIL`

### 상품 코드

- `COVERING_BAG`
- `LARGE_COVERING_BAG`
- `PICKUP_BOX`
- `PICKUP_COVERING_BAG`
- `PICKUP_LARGE_COVERING_BAG`

### 아직 전환되지 않은 항목

- `secure_dataset.comment` 는 아직 `order_v2_id` 가 아니라 레거시 `order_id` 기준
- `secure_dataset.company` 는 아직 `payment_policy_id` 컬럼이 없음
- 백오피스 주문 상세 API는 일부 케이스에서 `/v3/order/{id}` 가 404를 반환해 `/v2` 폴백이 아직 필요함

## 영향 범위

### `order_lookup.py`

- 주문번호 조회는 레거시 `secure_dataset.order.code` 와 신규 `secure_dataset.order_v2.order_number` 를 함께 조회
- 전화번호 후보 조회는 레거시 `order.masked_phone` 와 신규 `order_customer_snapshot.customer_phone` 를 함께 사용
- 신규 스냅샷 전화번호는 `masked_phone` 비교와 `normalized_phone` 비교를 둘 다 허용
- 수거 예정일 조회는 레거시 `order.pickup_start_time` + 신규 `fulfillment.scheduled_start_at` 를 함께 사용
- 신규 도메인 주문 필터는 `order_line + product.product_type='SERVICE'` 기준으로 적용

### `fail_photo_bot.py`

- 실패 리포트는 레거시 `order_status_log` 와 신규 `fulfillment_status_event + fulfillment` 를 함께 조회
- 신규 실패 코드는 `ACCESS_DENIED -> ENTER_FAIL`, `NOT_FOUND -> NOTFOUND_FAIL`, `POLICY_VIOLATION -> POLICY_FAIL` 로 매핑
- 실패 사유 추출을 `metadata.policyFailReason`, `enterFailReason`, `detailReason`, `reason`, `failure_reason_message` 순으로 통합
- 대형폐기물 수거 실패 리포트는 `LARGE_COVERING_BAG`, `PICKUP_LARGE_COVERING_BAG` 만 집계
- 신규 주문 사진은 `order_image_v2` 를 먼저 보고, `PICKUP_FAIL -> PICKUP_BEFORE -> PICKUP_AFTER` 우선순위로 같은 유형 이미지만 최대 5장까지 붙인다.
- GCS 서명 URL 생성이 안 되거나 메타데이터가 비어 있을 때만 백오피스 `/v3 -> /v2` 조회로 fallback 한다.
- 주문 상세 사진은 `preSignedUrl`, `presignedUrl`, `signedUrl`, `url`, `imageUri` 와 `pickupFail/pickupBefore/pickupAfter` 계열 키를 모두 허용

### `backoffice.py`

- 주문 상세 조회는 `/v3` 우선, 404 시 `/v2` 폴백 유지
- 응답의 주문번호 키가 `code` 가 아닐 때 `orderNumber`, `order_number`, `orderNo` 까지 허용
- 전화번호는 `phone`, `customerPhone`, `user.phone`, `orderCustomerSnapshot.customerPhone` 등 다양한 위치를 허용
- 주문 상태와 방문 상태를 분리해서 해석하고, `COMPLETED/FAILED/CANCELED` 방문은 phone fallback 후보에서 제외
- 배차 조회는 `cancelled=True` 외에 `closed=True` (`방문실패` / `처리완료`)도 반환

### `schema-graph`

- 신규 주문/방문 도메인 테이블에 한글 라벨, 설명, enum 메타데이터 추가
- `order_v2 -> user_coupon`, `order_v2 -> fulfillment`, `fulfillment -> fulfillment_status_event` 등 신규 관계선을 보강
- 레거시 `order`, `order_status_log`, `order_image` 를 문서상으로 명확히 레거시로 표기
- `fulfillment.failure_reason_code` enum 을 신규 코드(`ACCESS_DENIED`, `NOT_FOUND`, `POLICY_VIOLATION`) 기준으로 수정
- `index.html` 재생성은 BigQuery 응답 대기 문제로 이번 작업에서 완료하지 못함

## 검증

- `python3 -m py_compile config.py backoffice.py order_lookup.py monitor.py fail_photo_bot.py fail_photo_bot/fail_photo_bot.py`
- `python3 -m unittest test_changes.py`
- BigQuery 실데이터 스모크는 이번 세션에서 별도 재검증하지 못함
- `schema-graph` HTML 재생성은 BigQuery 호출 대기 이슈로 미완료

## 운영 메모

- 실패 리포트는 신규 방문 이벤트 기준으로 동작하므로, 이후 실패 사유 표준화가 바뀌면 `fulfillment_status_event.metadata` 키부터 먼저 확인한다.
- `2026-03-31` 이후 날짜는 신규 스키마만 집계하고, 대형폐기물 상품 코드는 exact match 로 유지한다.
- `comment`, `company` 관련 phase 4 전환이 실제 반영되기 전까지는 레거시 관계를 문서에서 제거하지 않는다.
- 백오피스가 완전히 `/v3` 로 수렴했다는 확인이 있기 전까지 `v3 -> v2` 폴백은 유지한다.
- `schema-graph` 결과물까지 배포하려면 BigQuery 접근이 되는 환경에서 `generate_schema_graph.py` 를 다시 실행해야 한다.
