# 링퀴즈 추천 정책 Matrix

> 유형: 분석
> 작성일: 2026-05-11
> 상태: 검토중

## 결론

현재 fallback 추천 정책 matrix는 모두 기대 결과와 일치한다.

## QA 시나리오

1. PASS 일반 쓰레기 단독, 15kg 이하
   - 입력: categories=GENERAL_FOOD_RECYCLE, length=UNDER_80, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_SINGLE / GENERAL_BAG_SINGLE
   - 근거: matchedRule=general-only-default, action=GENERAL_BAG_SINGLE, heavySplitReason=-, fallback=-
   - QA 메모: 일반 쓰레기 단독은 방문수거로 가지 않는다.

2. PASS 일반 쓰레기 단독, 25kg 이상
   - 입력: categories=GENERAL_FOOD_RECYCLE, length=UNDER_80, weight=OVER_25, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_MULTIPLE / GENERAL_BAG_MULTIPLE
   - 근거: matchedRule=general-only-heavy, action=GENERAL_BAG_MULTIPLE, heavySplitReason=-, fallback=-
   - QA 메모: 일반 쓰레기 단독은 무거워도 일반 봉투 여러 장으로 안내한다.

3. PASS 가전·가구, 25kg 이상
   - 입력: categories=APPLIANCE_FURNITURE, length=UNDER_80, weight=OVER_25, perceived=-, split=-
   - 기대/실제: VISIT_PICKUP / VISIT_PICKUP
   - 근거: matchedRule=weight-over-25, action=VISIT_PICKUP, heavySplitReason=-, fallback=-
   - QA 메모: 혼자 옮기기 어려운 가전·가구는 방문수거로 안내한다.

4. PASS 가전·가구, 체감상 혼자 들기 어려움
   - 입력: categories=APPLIANCE_FURNITURE, length=UNDER_80, weight=UNKNOWN, perceived=HARD_TO_LIFT, split=-
   - 기대/실제: VISIT_PICKUP / VISIT_PICKUP
   - 근거: matchedRule=weight-over-25, action=VISIT_PICKUP, heavySplitReason=-, fallback=-
   - QA 메모: 정확한 무게를 몰라도 혼자 들기 어려우면 방문수거로 안내한다.

5. PASS 이불·의류·잡화 단독, 25kg 이상
   - 입력: categories=BEDDING_CLOTHES_MISC, length=UNDER_80, weight=OVER_25, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_MULTIPLE / GENERAL_BAG_MULTIPLE
   - 근거: matchedRule=splittable-heavy-bag-length, action=GENERAL_BAG_MULTIPLE, heavySplitReason=-, fallback=-
   - QA 메모: 나눠 담을 수 있는 품목은 무거워도 일반 봉투 여러 장으로 안내한다.

6. PASS 이불·의류·잡화와 가전·가구 혼합, 25kg 이상
   - 입력: categories=BEDDING_CLOTHES_MISC, APPLIANCE_FURNITURE, length=UNDER_80, weight=OVER_25, perceived=-, split=-
   - 기대/실제: VISIT_PICKUP / VISIT_PICKUP
   - 근거: matchedRule=weight-over-25, action=VISIT_PICKUP, heavySplitReason=-, fallback=-
   - QA 메모: 혼합 선택에 가전·가구가 포함되면 방문수거를 우선한다.

7. PASS 길이 74cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=UNDER_80, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_SINGLE / GENERAL_BAG_SINGLE
   - 근거: matchedRule=bag-length-default, action=GENERAL_BAG_SINGLE, heavySplitReason=-, fallback=-
   - QA 메모: 75cm 미만은 80cm 이하 구간이다.

8. PASS 길이 75cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=AROUND_80, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_SINGLE / GENERAL_BAG_SINGLE
   - 근거: matchedRule=bag-length-default, action=GENERAL_BAG_SINGLE, heavySplitReason=-, fallback=-
   - QA 메모: 75~85cm는 80cm 내외 구간이다.

9. PASS 길이 85cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=AROUND_80, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_SINGLE / GENERAL_BAG_SINGLE
   - 근거: matchedRule=bag-length-default, action=GENERAL_BAG_SINGLE, heavySplitReason=-, fallback=-
   - QA 메모: 85cm까지는 80cm 내외 구간이다.

10. PASS 길이 86cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=OVER_80_UNDER_140, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: LARGE_COVERING_BAG / LARGE_COVERING_BAG
   - 근거: matchedRule=length-86-140-default, action=LARGE_COVERING_BAG, heavySplitReason=-, fallback=-
   - QA 메모: 86cm부터 일반 봉투 한 장 안내가 아니라 대형 봉투로 안내한다.

11. PASS 길이 140cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=OVER_80_UNDER_140, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: LARGE_COVERING_BAG / LARGE_COVERING_BAG
   - 근거: matchedRule=length-86-140-default, action=LARGE_COVERING_BAG, heavySplitReason=-, fallback=-
   - QA 메모: 140cm까지는 대형 봉투 구간이다.

12. PASS 길이 141cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=OVER_140_UNDER_150, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: LARGE_COVERING_BAG / LARGE_COVERING_BAG
   - 근거: matchedRule=length-141-150, action=LARGE_COVERING_BAG, heavySplitReason=-, fallback=-
   - QA 메모: 141~150cm는 대형 봉투 구간이다.

13. PASS 길이 150cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=OVER_140_UNDER_150, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: LARGE_COVERING_BAG / LARGE_COVERING_BAG
   - 근거: matchedRule=length-141-150, action=LARGE_COVERING_BAG, heavySplitReason=-, fallback=-
   - QA 메모: 150cm까지는 대형 봉투 구간이다.

14. PASS 길이 151cm 구간
   - 입력: categories=BEDDING_CLOTHES_MISC, length=OVER_150, weight=UNDER_15, perceived=-, split=-
   - 기대/실제: VISIT_PICKUP / VISIT_PICKUP
   - 근거: matchedRule=length-over-150, action=VISIT_PICKUP, heavySplitReason=-, fallback=-
   - QA 메모: 150cm 초과는 방문수거로 안내한다.

15. PASS 이불·의류·잡화, 무게 모름, 오래 들기 어려움
   - 입력: categories=BEDDING_CLOTHES_MISC, length=UNDER_80, weight=UNKNOWN, perceived=HARD_TO_HOLD_LONG, split=-
   - 기대/실제: GENERAL_BAG_MULTIPLE / GENERAL_BAG_MULTIPLE
   - 근거: matchedRule=bag-length-heavy, action=HEAVY_SPLIT_DECISION, heavySplitReason=category_bedding_can_split, fallback=-
   - QA 메모: 나눠 담을 수 있는 품목의 15~25kg 추정은 여러 장으로 안내한다.

16. PASS 기타, 80cm 내외, 15~25kg, 나눠 담기 모름
   - 입력: categories=ETC, length=AROUND_80, weight=OVER_15_UNDER_25, perceived=-, split=-
   - 기대/실제: GENERAL_BAG_MULTIPLE / GENERAL_BAG_MULTIPLE
   - 근거: matchedRule=bag-length-heavy, action=HEAVY_SPLIT_DECISION, heavySplitReason=around_80_unknown_can_split, fallback=-
   - QA 메모: 기타 품목이 80cm 내외이고 나눠 담기 여부가 없으면 현재 정책은 여러 장으로 안내한다.

