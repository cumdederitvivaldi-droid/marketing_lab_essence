import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import { ExperimentProvider } from "@/contexts/ExperimentContext";

import {
  SITE_TITLE,
  SITE_DESC,
  SITE_URL,
  SITE_NAME,
  META_PIXEL_ID,
  NAVER_WA_ID,
} from "@/lib/constants";
import "./globals.css";

const pretendard = localFont({
  src: [
    { path: "../../public/fonts/Pretendard-Regular.woff2", weight: "400" },
    { path: "../../public/fonts/Pretendard-Medium.woff2", weight: "500" },
    { path: "../../public/fonts/Pretendard-SemiBold.woff2", weight: "600" },
    { path: "../../public/fonts/Pretendard-Bold.woff2", weight: "700" },
  ],
  variable: "--font-pretendard",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESC,
  keywords: [
    "대형폐기물",
    "대형폐기물 수거",
    "대형폐기물 버리기",
    "대형폐기물 처리",
    "대형폐기물 수거 예약",
    "대형폐기물 방문수거",
    "폐가구 수거",
    "폐가구 버리기",
    "가구 버리기",
    "가구 폐기",
    "소파 버리기",
    "침대 버리기",
    "매트리스 버리기",
    "냉장고 버리기",
    "세탁기 버리기",
    "장롱 버리기",
    "책상 버리기",
    "식탁 버리기",
    "서랍장 버리기",
    "옷장 버리기",
    "이사 폐기물",
    "이사 쓰레기",
    "이사 가구 처리",
    "폐기물 수거 업체",
    "대형쓰레기 수거",
    "서울 대형폐기물",
    "경기 대형폐기물",
    "인천 대형폐기물",
    "강남 대형폐기물",
    "송파 대형폐기물",
    "마포 대형폐기물",
    "서초 대형폐기물",
    "용산 대형폐기물",
    "성남 대형폐기물",
    "고양 대형폐기물",
    "수원 대형폐기물",
    "부천 대형폐기물",
    "당일 수거",
    "폐기물 견적",
    "커버링",
    "커버링방문수거",
  ],
  openGraph: {
    title: "대형폐기물 수거, 온라인으로 바로 예약 | 커버링 방문수거",
    description:
      "소파·침대·냉장고 등 대형폐기물, 온라인 즉시 견적으로 추가비용 없이 수거. 서울·경기·인천 전 지역.",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: `${SITE_URL}/api/og`,
        width: 1200,
        height: 630,
        alt: "커버링 방문수거 - 대형폐기물 수거 예약",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "대형폐기물 수거 예약 | 커버링 방문수거",
    description:
      "소파·침대·냉장고 등 온라인 즉시 견적, 추가비용 없는 확정가. 서울·경기·인천.",
    images: [`${SITE_URL}/api/og`],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
  manifest: `${SITE_URL}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  verification: {
    google: "google-site-verification-placeholder",
  },
};

export const viewport: Viewport = {
  themeColor: "#1AA3FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <head>
        {/* LocalBusiness + Service 구조화 데이터 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "LocalBusiness",
              name: SITE_NAME,
              description: SITE_DESC,
              url: SITE_URL,
              address: {
                "@type": "PostalAddress",
                addressLocality: "서울특별시",
                addressRegion: "서울",
                addressCountry: "KR",
              },
              areaServed: [
                { "@type": "City", name: "서울특별시" },
                { "@type": "State", name: "경기도" },
                { "@type": "City", name: "인천광역시" },
              ],
              priceRange: "₩₩",
              hasOfferCatalog: {
                "@type": "OfferCatalog",
                name: "대형폐기물 수거 서비스",
                itemListElement: [
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "대형폐기물 방문수거",
                      description:
                        "소파, 침대, 냉장고, 세탁기, 장롱 등 대형폐기물을 직접 방문하여 수거합니다.",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "이사 폐기물 일괄수거",
                      description:
                        "이사 시 발생하는 대량 폐기물을 한 번에 수거합니다.",
                    },
                  },
                ],
              },
            }),
          }}
        />
        {/* FAQ 구조화 데이터 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "대형폐기물 수거 비용은 얼마인가요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "품목과 수량에 따라 온라인에서 즉시 견적을 확인할 수 있습니다. 사전 견적이 최종 금액이며, 추가 비용이 발생하지 않습니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "어떤 품목을 수거할 수 있나요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "소파, 침대, 매트리스, 냉장고, 세탁기, 장롱, 책상, 식탁, 서랍장, 옷장, 운동기구 등 거의 모든 대형폐기물을 수거합니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "서비스 가능 지역은 어디인가요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "서울 전역, 경기도 주요 도시(성남, 고양, 수원, 부천, 용인, 김포 등), 인천에서 서비스를 제공합니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "당일 수거도 가능한가요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "예약 상황에 따라 당일 수거가 가능합니다. 온라인에서 희망 날짜와 시간을 선택하여 예약할 수 있습니다.",
                  },
                },
                {
                  "@type": "Question",
                  name: "사다리차가 필요한 경우에도 수거 가능한가요?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "네, 사다리차가 필요한 경우에도 수거 가능합니다. 예약 시 사다리차 필요 여부를 선택하면 견적에 반영됩니다.",
                  },
                },
              ],
            }),
          }}
        />
        {/* Naver CTS (전환추적) 공통 스크립트 — 가이드 그대로의 정적 인라인 패턴.
            검수 봇이 정적 HTML 을 파싱하므로 layout head 에 직접 박아 SSR 출력에 노출.
            wcslog.js 는 async 금지 — async 면 다음 인라인 스크립트 실행 시점에 window.wcs 가
            아직 없어 wcs.inflow()/wcs_do() 가 누락된다 (네이버 검수 피드백 2026-05). 동기 로드로
            순서 보장. */}
        {NAVER_WA_ID && (
          <>
            <script src="https://wcs.naver.net/wcslog.js" />
            <script
              dangerouslySetInnerHTML={{
                __html: `if (!wcs_add) var wcs_add = {};
wcs_add["wa"] = "${NAVER_WA_ID}";
if (!_nasa) var _nasa = {};
if (window.wcs) {
  wcs.inflow();
  wcs_do(_nasa);
}`,
              }}
            />
          </>
        )}
        {/* Meta Pixel — SSR HTML 에 stub + fbevents.js 로드 + init + PageView 통째로 임베드.
            hydration 전 클릭도 fbq queue 에 쌓이도록 가능한 가장 빠른 시점에 정의.
            AnalyticsProvider 의 client-side init 보다 먼저 실행되어 초기 클릭 누락 방지. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
          }}
        />
      </head>
      <body className="antialiased">
        <ExperimentProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </ExperimentProvider>
      </body>
    </html>
  );
}
