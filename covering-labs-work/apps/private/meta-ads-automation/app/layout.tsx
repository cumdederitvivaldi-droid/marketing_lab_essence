import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: '커버링 Meta 광고 자동 세팅' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
