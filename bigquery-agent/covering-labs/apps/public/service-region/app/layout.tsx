import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "커버링 서비스 지역" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
