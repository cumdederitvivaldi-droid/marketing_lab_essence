"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface UseCarouselOptions {
  totalItems: number;
  cardWidth?: number;
  autoplayInterval?: number;
}

export function useCarousel({
  totalItems,
  cardWidth = 320,
  autoplayInterval = 3500,
}: UseCarouselOptions) {
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Calculate pages
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const visibleCards = Math.max(Math.floor(wrapper.offsetWidth / cardWidth), 1);
    setTotalPages(Math.ceil(totalItems / visibleCards));
  }, [totalItems, cardWidth]);

  const goTo = useCallback(
    (page: number) => {
      const track = trackRef.current;
      const wrapper = wrapperRef.current;
      if (!track || !wrapper) return;

      const clamped = Math.max(0, Math.min(page, totalPages - 1));
      setCurrentPage(clamped);

      const visibleCards = Math.max(
        Math.floor(wrapper.offsetWidth / cardWidth),
        1
      );
      const offset = clamped * cardWidth * visibleCards;
      const maxOffset = track.scrollWidth - wrapper.offsetWidth;

      track.style.transition =
        "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      track.style.transform = `translateX(-${Math.min(offset, maxOffset)}px)`;
    },
    [totalPages, cardWidth]
  );

  const next = useCallback(
    () => goTo((currentPage + 1) % totalPages),
    [currentPage, totalPages, goTo]
  );
  const prev = useCallback(
    () => goTo(currentPage - 1),
    [currentPage, goTo]
  );

  // Autoplay
  const startAutoplay = useCallback(() => {
    autoplayRef.current = setInterval(
      () => setCurrentPage((p) => {
        const nextPage = (p + 1) % totalPages;
        // Also update transform
        const track = trackRef.current;
        const wrapper = wrapperRef.current;
        if (track && wrapper) {
          const visibleCards = Math.max(
            Math.floor(wrapper.offsetWidth / cardWidth),
            1
          );
          const offset = nextPage * cardWidth * visibleCards;
          const maxOffset = track.scrollWidth - wrapper.offsetWidth;
          track.style.transition =
            "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
          track.style.transform = `translateX(-${Math.min(offset, maxOffset)}px)`;
        }
        return nextPage;
      }),
      autoplayInterval
    );
  }, [totalPages, cardWidth, autoplayInterval]);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current);
  }, []);

  useEffect(() => {
    startAutoplay();
    return stopAutoplay;
  }, [startAutoplay, stopAutoplay]);

  // Mouse drag
  useEffect(() => {
    const track = trackRef.current;
    const wrapper = wrapperRef.current;
    if (!track || !wrapper) return;

    let isDragging = false;
    let startX = 0;
    let startOffset = 0;

    function getCurrentOffset(): number {
      const m = track!.style.transform.match(/translateX\((-?[\d.]+)px\)/);
      return m ? parseFloat(m[1]) : 0;
    }

    function onMouseDown(e: MouseEvent) {
      isDragging = true;
      startX = e.pageX;
      startOffset = getCurrentOffset();
      track!.style.transition = "none";
      stopAutoplay();
      e.preventDefault();
    }

    function onMouseMove(e: MouseEvent) {
      if (!isDragging) return;
      const dx = e.pageX - startX;
      const maxOff = track!.scrollWidth - wrapper!.offsetWidth;
      const newOff = Math.max(-maxOff - 40, Math.min(40, startOffset + dx));
      track!.style.transform = `translateX(${newOff}px)`;
    }

    function onMouseUp(e: MouseEvent) {
      if (!isDragging) return;
      isDragging = false;
      const dx = e.pageX - startX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) goTo(currentPage + 1);
        else goTo(currentPage - 1);
      } else {
        goTo(currentPage);
      }
      startAutoplay();
    }

    track.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      track.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [currentPage, goTo, stopAutoplay, startAutoplay]);

  // Touch
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let touchStartX = 0;

    function onTouchStart(e: TouchEvent) {
      touchStartX = e.touches[0].pageX;
      stopAutoplay();
    }

    function onTouchEnd(e: TouchEvent) {
      const diff = e.changedTouches[0].pageX - touchStartX;
      if (Math.abs(diff) > 60) {
        if (diff < 0) goTo(currentPage + 1);
        else goTo(currentPage - 1);
      }
      startAutoplay();
    }

    track.addEventListener("touchstart", onTouchStart, { passive: true });
    track.addEventListener("touchend", onTouchEnd);

    return () => {
      track.removeEventListener("touchstart", onTouchStart);
      track.removeEventListener("touchend", onTouchEnd);
    };
  }, [currentPage, goTo, stopAutoplay, startAutoplay]);

  return {
    trackRef,
    wrapperRef,
    currentPage,
    totalPages,
    goTo,
    next,
    prev,
    stopAutoplay,
    startAutoplay,
  };
}
