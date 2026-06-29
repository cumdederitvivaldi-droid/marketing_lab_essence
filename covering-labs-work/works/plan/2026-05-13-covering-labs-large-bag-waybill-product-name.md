# 대형봉투 배송 운송장 상품명 표기 변경

> 유형: Plan
> 작성일: 2026-05-13
> 상태: Draft
> Linear: [ENG-2376](https://linear.app/covering/issue/ENG-2376)

## 목표

대형봉투 배송 배치가 두발히어로 API에 전달하는 운송장 상품명을 `대형커버링봉투` → `대형 봉투`로 변경한다.

## 현황 분석

- `apps/private/large-bag-delivery-batch/src/config.py` 에 `PRODUCT_BASE_NAME = "대형커버링봉투"` 정의
- 해당 상수는 `dubalhero_api.py`의 `productName` 필드로 전달되어 운송장에 인쇄됨
- 다른 곳에서는 참조되지 않음 (배치 외부 영향 없음)

## 구현 계획

1. `config.py` — `PRODUCT_BASE_NAME` 값을 `"대형 봉투"`로 변경

## 완료 기준

- [ ] `PRODUCT_BASE_NAME = "대형 봉투"`로 변경됨
- [ ] 배포 후 다음 배치 실행분의 운송장 상품명이 `대형 봉투`로 출력됨
