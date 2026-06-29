// 길이 슬라이더 값에 따라 가장 가까운 비유 물품을 보여준다.
// 사용자가 cm 감각이 부족할 때 직관적으로 길이를 가늠할 수 있도록 돕기 위한 데이터.

export interface LengthExample {
  cm: number;
  label: string;
}

// 사용자 가이드:
// - 60cm 이하: 전자레인지, 소형 공기청정기, 협탁 등 소형 가전·소품
// - 60~100cm: 일반 공기청정기, 작은 수납장 등 중형 가전·가구
// - 100cm 이상: 긴 수납장, 소파, 매트리스 등 대형 가구
// cm 오름차순 정렬 유지
export const LENGTH_EXAMPLES: LengthExample[] = [
  { cm: 30, label: '토스터, 가습기 정도' },
  { cm: 40, label: '소형 공기청정기 정도' },
  { cm: 50, label: '전자레인지, 협탁 정도' },
  { cm: 65, label: '모니터 정도' },
  { cm: 75, label: '일반 공기청정기 정도' },
  { cm: 90, label: '작은 수납장 정도' },
  { cm: 110, label: '1인 소파, 책상 정도' },
  { cm: 130, label: '책장, 55인치 TV 정도' },
  { cm: 150, label: '긴 수납장, 매트리스 정도' },
  { cm: 160, label: '대형 소파, 옷장 정도' },
];

export function getNearestLengthExample(cm: number): LengthExample {
  let nearest = LENGTH_EXAMPLES[0];
  let minDist = Math.abs(LENGTH_EXAMPLES[0].cm - cm);
  for (const ex of LENGTH_EXAMPLES) {
    const d = Math.abs(ex.cm - cm);
    if (d < minDist) {
      minDist = d;
      nearest = ex;
    }
  }
  return nearest;
}
