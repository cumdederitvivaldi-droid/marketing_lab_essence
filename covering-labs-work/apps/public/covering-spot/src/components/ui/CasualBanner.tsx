"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

/* ─── Types ─── */
interface BannerItem {
  id: string | number;
  content: ReactNode;
  bgColor?: string;
}

interface CasualBannerProps {
  items: BannerItem[];
  autoPlay?: boolean;
  interval?: number;
  className?: string;
}

/* ─── Component ─── */
export function CasualBanner({
  items,
  autoPlay = true,
  interval = 4000,
  className = "",
}: CasualBannerProps) {
  const [current, setCurrent] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [translateX, setTranslateX] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const count = items.length;

  /* ─── Auto-play ─── */
  const stopAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  const startAutoPlay = useCallback(() => {
    if (!autoPlay || count <= 1) return;
    stopAutoPlay();
    autoPlayRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % count);
    }, interval);
  }, [autoPlay, count, interval, stopAutoPlay]);

  useEffect(() => {
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay]);

  /* ─── Touch / Pointer handlers ─── */
  const handleDragStart = (clientX: number) => {
    setIsDragging(true);
    setStartX(clientX);
    setTranslateX(0);
    stopAutoPlay();
  };

  const handleDragMove = (clientX: number) => {
    if (!isDragging) return;
    setTranslateX(clientX - startX);
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 50;
    if (translateX < -threshold && current < count - 1) {
      setCurrent((prev) => prev + 1);
    } else if (translateX > threshold && current > 0) {
      setCurrent((prev) => prev - 1);
    }

    setTranslateX(0);
    startAutoPlay();
  };

  const classes = [
    "relative w-full overflow-hidden rounded-lg",
    "transition-all duration-200",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      {/* Track */}
      <div
        ref={trackRef}
        className="flex transition-transform duration-300 ease-out"
        style={{
          transform: `translateX(calc(-${current * 100}% + ${isDragging ? translateX : 0}px))`,
          transition: isDragging ? "none" : undefined,
        }}
        onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
        onTouchEnd={handleDragEnd}
        onMouseDown={(e) => {
          e.preventDefault();
          handleDragStart(e.clientX);
        }}
        onMouseMove={(e) => handleDragMove(e.clientX)}
        onMouseUp={handleDragEnd}
        onMouseLeave={() => {
          if (isDragging) handleDragEnd();
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="w-full shrink-0 select-none"
            style={{
              backgroundColor: item.bgColor || "#A3AEC2",
            }}
          >
            {item.content}
          </div>
        ))}
      </div>

      {/* Pagination dots */}
      {count > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCurrent(i);
                startAutoPlay();
              }}
              className={[
                "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                i === current
                  ? "w-4 bg-brand-400"
                  : "w-1.5 bg-white/50 hover:bg-white/70",
              ].join(" ")}
              aria-label={`슬라이드 ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
