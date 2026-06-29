import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "../public/fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

// Meta Pixel ID — covering-spot 과 동일 픽셀 (공개 ID)
const META_PIXEL_ID = "887855856225518";

export const metadata: Metadata = {
  title: "커버링 방문수거 | 대형·대량 폐기물 이젠 쉽고 간편하게",
  description:
    "서울·경기·인천 대형폐기물, 스티커 붙이고 들고 나갈 필요 없이 카톡 한 번으로 방문수거. 가구·가전·이사 쓰레기까지 한 번에 처리.",
};

export const viewport: Viewport = {
  themeColor: "#1AA3FF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <head>
        {/* Meta Pixel — SSR <head>에 base 코드(stub + fbevents.js + init + PageView) 직접 임베드.
            hydration 전 클릭도 fbq queue 에 쌓이도록 가능한 가장 빠른 시점에 정의. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          />
        </noscript>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
