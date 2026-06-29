import type { Metadata } from "next";
import { KakaoBridgeClient } from "@/components/kakao/KakaoBridgeClient";

export const metadata: Metadata = {
  title: "카카오 상담 연결",
  description: "커버링 방문수거 카카오 상담 연결 페이지",
  robots: { index: false, follow: false },
};

export default function KakaoPage() {
  return (
    <main className="min-h-dvh bg-bg-warm px-5 py-8 text-text-primary">
      <KakaoBridgeClient />
    </main>
  );
}
