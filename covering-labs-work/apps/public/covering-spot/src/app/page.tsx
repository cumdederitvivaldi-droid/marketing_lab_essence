import { Nav } from "@/components/layout/Nav";
import { Hero } from "@/components/sections/Hero";
import { TrustBar } from "@/components/sections/TrustBar";
import { ItemsCarousel } from "@/components/sections/ItemsCarousel";
import { Process } from "@/components/sections/Process";
import { Pricing } from "@/components/sections/Pricing";
import { ItemPrices } from "@/components/sections/ItemPrices";
import { Compare } from "@/components/sections/Compare";
import { FAQ } from "@/components/sections/FAQ";
import { PhoneConsultation } from "@/components/sections/PhoneConsultation";
import { CTASection } from "@/components/sections/CTASection";
import { Footer } from "@/components/layout/Footer";
import { FloatingCTA } from "@/components/layout/FloatingCTA";
import { Splash } from "@/components/Splash";

import { carouselItems } from "@/data/carousel-items";
import { priceCategories } from "@/data/price-data";
import { faqItems } from "@/data/faq-data";

export default function Page() {
  return (
    <>
      {/* Nav/FloatingCTA는 Splash 밖에 배치 — Splash의 transform이 fixed 포지셔닝을 깨뜨리기 때문 */}
      <Nav />
      <FloatingCTA />
      <Splash>
        <section className="hero-section" id="hero">
          <Hero />
        </section>
        <TrustBar />
        <ItemsCarousel items={carouselItems} />
        <Process />
        <Pricing />
        <ItemPrices categories={priceCategories} />
        <Compare />
        <FAQ items={faqItems} />
        <PhoneConsultation />
        <CTASection />
        <Footer />
      </Splash>
    </>
  );
}
