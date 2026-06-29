import type { CompareCard, CompareReason } from "@/types";

export const compareCards: CompareCard[] = [
  {
    type: "good",
    badge: "커버링",
    method: "합리적이고 투명한 견적",
    lines: [
      { icon: "check", text: "침대 세트: 50,000원" },
      { icon: "check", text: "책상: 37,000원" },
      { icon: "check", text: "박스 2개: 10,000원" },
      { icon: "check", text: "출장비: 47,000원" },
    ],
    total: "총 144,000원",
    tag: "추가 비용 없음",
  },
  {
    type: "bad",
    badge: "타업체",
    method: '전화 "대충 15만원 정도요"',
    lines: [
      { icon: "cross", text: "기본: 150,000원" },
      { icon: "warn", text: "침대 분리: +30,000원", isExtra: true },
      { icon: "warn", text: "박스: +20,000원", isExtra: true },
      { icon: "warn", text: "계단: +20,000원", isExtra: true },
    ],
    total: "실제 청구 220,000원",
    tag: "추가 비용 +70,000원",
  },
];

export const compareReasons: CompareReason[] = [
  {
    heading: "애매한 견적",
    desc: '"대충 ~만원 정도요" "가봐야 알 것 같아요"',
  },
  {
    heading: "현장 도착 후 추가 비용 발생",
    desc: '"생각보다 크네요" "분리 작업이 필요해요" "엘리베이터가 작아서..."',
  },
  {
    heading: "거절하기 어려운 상황",
    desc: '이미 작업자가 현장에 도착, "지금 안 하시면 출장비만 내셔야 해요"',
  },
];
