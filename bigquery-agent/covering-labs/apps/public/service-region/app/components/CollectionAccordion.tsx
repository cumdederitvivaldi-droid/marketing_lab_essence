'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const DROPDOWN_PATH = "M8.71 12.29L11.3 9.7C11.69 9.31 12.32 9.31 12.71 9.7L15.3 12.29C15.93 12.92 15.48 14 14.59 14H9.41C8.52 14 8.08 12.92 8.71 12.29Z";

interface CollectionAccordionProps {
  children: React.ReactNode;
}

export default function CollectionAccordion({ children }: CollectionAccordionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="content-stretch flex flex-col items-start w-full bg-[#f8fafb]">
      <div className="bg-[#f8fafb] content-stretch flex flex-col items-start pb-[8px] pt-[16px] px-[20px] relative shrink-0 w-full">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls="collection-accordion-panel"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white content-stretch flex flex-col gap-[8px] items-start p-[16px] relative rounded-[12px] shrink-0 w-full"
        >
          <div className="content-stretch flex items-center justify-between relative shrink-0 w-full">
            <p className="font-sans font-semibold leading-[24px] not-italic relative shrink-0 text-[#16191d] text-[16px] text-nowrap">
              지역별 수거 요일
            </p>
            <div
              className="relative shrink-0 size-[24px]"
              style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
            >
              <svg className="block size-full" fill="none" viewBox="0 0 24 24">
                <path d={DROPDOWN_PATH} fill="#434A56" />
              </svg>
            </div>
          </div>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id="collection-accordion-panel"
            role="region"
            aria-label="지역별 수거 요일"
            initial="collapsed" animate="open" exit="collapsed"
            variants={{ open: { height: "auto", opacity: 1 }, collapsed: { height: 0, opacity: 1 } }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="bg-[#f8fafb] relative shrink-0 w-full overflow-hidden"
          >
            <div className="content-stretch flex items-center px-[20px] py-0 relative w-full">
              <div className="bg-white content-stretch flex flex-col items-start px-[16px] py-[24px] relative rounded-[12px] shrink-0 w-full">
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
