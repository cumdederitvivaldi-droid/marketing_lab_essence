// 채널톡 UI 유틸

// ─── 시간 포맷 ───

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "어제";
  }

  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── 태그 색상 ───

const TAG_COLORS: Record<string, { bg: string; color: string }> = {};
const TAG_PALETTE = [
  { bg: "#FEE2E2", color: "#DC2626" },
  { bg: "#DBEAFE", color: "#2563EB" },
  { bg: "#D1FAE5", color: "#059669" },
  { bg: "#FEF3C7", color: "#D97706" },
  { bg: "#EDE9FE", color: "#7C3AED" },
  { bg: "#FCE7F3", color: "#DB2777" },
  { bg: "#E0E7FF", color: "#4338CA" },
  { bg: "#CCFBF1", color: "#0D9488" },
  { bg: "#FFF7ED", color: "#EA580C" },
  { bg: "#F3E8FF", color: "#9333EA" },
];

export function getTagColor(tag: string) {
  if (!TAG_COLORS[tag]) {
    const idx = Object.keys(TAG_COLORS).length % TAG_PALETTE.length;
    TAG_COLORS[tag] = TAG_PALETTE[idx];
  }
  return TAG_COLORS[tag];
}

