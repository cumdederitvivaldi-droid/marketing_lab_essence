import type { Metadata } from "next";

import { Footer } from "@/components/layout/Footer";
import { Nav } from "@/components/layout/Nav";
import { PhoneConsultation } from "@/components/sections/PhoneConsultation";
import { CONSULT_URL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "전화 상담 신청 | 커버링 방문수거",
  description:
    "이름·전화·주소만 남겨주시면 담당자가 직접 연락드립니다. 카톡이 부담스러운 분도 편하게 신청하세요.",
  alternates: { canonical: CONSULT_URL },
  openGraph: {
    title: "전화 상담 신청 | 커버링 방문수거",
    description: "이름·전화·주소만 남겨주시면 담당자가 직접 연락드립니다.",
    url: CONSULT_URL,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function ConsultPage() {
  return (
    <>
      <Nav />
      <main className="pt-[88px] max-md:pt-[72px] bg-bg-warm2 min-h-screen flex flex-col">
        <PhoneConsultation />
      </main>
      <Footer />
    </>
  );
}
