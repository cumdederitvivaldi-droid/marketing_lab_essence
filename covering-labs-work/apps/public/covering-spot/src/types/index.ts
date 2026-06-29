export interface CarouselItem {
  id: string;
  title: string;
  price: string;
  image: string;
  alt: string;
}

export interface PriceRow {
  label: string;
  value: string;
  barPercent: number;
}

export interface PriceCategory {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  rows: PriceRow[];
}

export interface FAQItem {
  question: string;
  answer: string;
  note?: string;
}

export interface ProcessStep {
  num: string;
  title: string;
  desc: string;
}

export interface PricingItem {
  label: string;
  title: string;
  detail: string;
  icon: string;
}

export interface FeatureItem {
  icon: string;
  title: string;
  desc: string;
}

export interface CompareLineItem {
  icon: "check" | "cross" | "warn";
  text: string;
  isExtra?: boolean;
}

export interface CompareCard {
  type: "good" | "bad";
  badge: string;
  method: string;
  lines: CompareLineItem[];
  total: string;
  tag: string;
}

export interface CompareReason {
  heading: string;
  desc: string;
}

export interface TrustStat {
  value: string;
  suffix?: string;
  label: string;
}
