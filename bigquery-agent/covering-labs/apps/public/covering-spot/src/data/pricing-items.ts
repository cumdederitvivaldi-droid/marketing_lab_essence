import type { PricingItem } from "@/types";

export const pricingItems: PricingItem[] = [
  {
    label: "지역별",
    title: "기본 출장비",
    detail: "서울 45,000원~\n경기 47,000원~\n인천 49,000원~",
    icon: "location",
  },
  {
    label: "품목별",
    title: "수거 비용",
    detail:
      "부피와 무게를 고려한 합리적 계산\n카톡으로 품목 알려주시면 바로 안내",
    icon: "tag",
  },
  {
    label: "난이도별",
    title: "작업 인력",
    detail: "1~4인, 품목의 난이도와 무게에 따라 결정",
    icon: "people",
  },
  {
    label: "필요시",
    title: "사다리차",
    detail: "10층 미만 130,000원~\n10층 이상 140,000원~",
    icon: "terminal",
  },
];
