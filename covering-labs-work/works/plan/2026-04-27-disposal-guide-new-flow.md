> 유형: PRD
> 작성일: 2026-04-27
> 상태: 확정

# disposal-guide 진단형 UI 플로우 리디자인

## 목적
사용자가 버리려는 물품의 카테고리·길이·무게·봉투 묶임·나눠 담기를 바탕으로 4가지 커버링 서비스 중 하나를 추천하는 진단형 UI로 전면 재설계.

## 추천 결과 4종
1. 방문수거
2. 대형 커버링 봉투
3. 일반 커버링 봉투 여러 장
4. 일반 커버링 봉투 1장

## 스텝 플로우
```
intro → step_category → step_length
  → (OVER_140) → result(VISIT_PICKUP)
  → step_weight
    → (OVER_25) → result(VISIT_PICKUP)
    → (UNKNOWN) → step_perceived_weight
      → (HARD_TO_LIFT) → result(VISIT_PICKUP)
      → [check needsBagTie]
    → [check needsBagTie]
      → step_bag_tie
        → [check needsSplittable]
          → step_splittable → result
          → result
      → [check needsSplittable] → result
```

## 판정 로직 요약
- 25kg 이상 / 140cm 초과 → 방문수거
- 110~140cm → 대형 커버링 봉투
- 80~110cm → 묶임 가능 시 일반/여러 장, 불가 시 대형
- 80cm 정도 → 기본 일반, 무거우면 여러 장
- 80cm 미만 → 일반, 무거우면 여러 장
- 음식물 포함 → 결과와 무관하게 분리 안내 추가

## 변경 파일
- src/types.ts: 전면 재작성
- src/data/flow.ts: 전면 재작성
- src/logic/recommend.ts: 신규 (판정 엔진)
- src/screens/CategoryScreen.tsx: 신규 (멀티 선택)
- src/screens/RadioListScreen.tsx: 신규 (라디오 선택)
- src/screens/ResultScreen.tsx: 업데이트
- src/DisposalGuideApp.tsx: 전면 재작성
- src/components/FilledButton.tsx: cornerRadius 8px 수정
- src/components/BottomBar.tsx: 패딩 피그마 스펙 맞춤
