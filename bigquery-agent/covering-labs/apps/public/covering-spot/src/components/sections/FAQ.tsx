"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FAQItem } from "@/types";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { track } from "@/lib/analytics";

interface Props {
  items: FAQItem[];
}

/* ── 개별 FAQ 아이템 (ref 기반 동적 높이) ── */
function FAQItemCard({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [isOpen]);

  return (
    <div
      className={`border-b border-border rounded-lg mb-2 transition-all duration-300 ease-out ${
        isOpen
          ? "bg-primary/[0.03] border-primary/20"
          : "hover:bg-bg-warm/60"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full bg-none border-none cursor-pointer py-7 px-6 flex justify-between items-center text-left gap-4 transition-all duration-300 ease-out hover:text-primary text-[17px] font-semibold text-text-primary max-md:px-4"
      >
        <span>{item.question}</span>
        <span
          className={`w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center text-lg transition-all duration-300 ease-out ${
            isOpen
              ? "bg-primary text-white rotate-0 shadow-[0_2px_8px_rgba(37,99,235,0.3)]"
              : "bg-bg-warm text-text-muted"
          }`}
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          maxHeight: `${height}px`,
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div ref={contentRef} className="pb-7 px-6 text-[15px] text-text-sub leading-[1.75] max-md:px-4">
          {item.answer}
          {item.note && (
            <div className="text-[13px] text-text-muted mt-3 py-4 px-5 bg-bg-warm rounded-lg leading-relaxed border border-border/50">
              {item.note}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function FAQ({ items }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = useCallback((index: number) => {
    setOpenIndex((prev) => {
      if (prev === index) return null;
      track("[CLICK] SpotHomeScreen_faqOpen", { question: items[index].question, index });
      return index;
    });
  }, [items]);

  return (
    <section className="py-[120px] bg-bg max-md:py-20" id="faq">
      <div className="max-w-[1200px] mx-auto px-20 max-lg:px-10 max-sm:px-5">
        <ScrollReveal>
          <SectionHeader title="자주 묻는 질문" center />
        </ScrollReveal>

        <ScrollReveal>
          <div className="max-w-[720px] mx-auto">
            {items.map((item, i) => (
              <FAQItemCard
                key={i}
                item={item}
                index={i}
                isOpen={openIndex === i}
                onToggle={() => toggle(i)}
              />
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
