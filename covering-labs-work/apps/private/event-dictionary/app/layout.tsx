import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '이벤트 딕셔너리',
  description: 'Covering Labs 내부 이벤트 딕셔너리',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
