import type { ReactNode } from "react";
import "./globals.css";
import UrlCleanup from "@/components/UrlCleanup";

export const metadata = {
  title: "커버링 친구초대",
  description: "친구에게 집정리 지원금을 선물하세요",
  openGraph: {
    title: "커버링 친구초대",
    description: "친구에게 집정리 지원금을 선물하세요",
    images: [{ url: "https://public-labs.covering.app/covering-invite-v2/assets/figma/referral-og-card.png?v=2", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <UrlCleanup />
        <div className="pointer-events-none fixed top-0 left-0 right-0 bg-white z-[9999]" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 bg-white z-[9999]" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        <div className="min-h-screen w-full bg-white md:bg-[#F3F4F6]">
          <div className="relative isolate mx-auto min-h-screen w-full max-w-[727px] overflow-x-clip bg-white md:shadow-lg">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
