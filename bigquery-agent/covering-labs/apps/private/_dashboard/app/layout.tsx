import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Covering Labs 모니터링',
  description: '앱 및 배치 실행 현황 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
