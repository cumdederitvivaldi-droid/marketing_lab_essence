import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "커버링 첫 수거 0원",
  description: "가입 선물 첫 만남 쿠폰으로 커버링 첫 수거를 무료로 시작해보세요",
  openGraph: {
    title: "커버링 첫 수거 0원",
    description: "가입 선물 첫 만남 쿠폰으로 커버링 첫 수거를 무료로 시작해보세요",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
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
