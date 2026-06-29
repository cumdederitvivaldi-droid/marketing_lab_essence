"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/utils/basePath';
import {
  initAnalytics,
  trackLandingView,
  trackPrimaryCtaClick,
  trackNormalBagNoticeClick,
  trackLargeBagNoticeClick,
  type RouteContext,
} from '@/utils/analytics';
import { getAirbridgeOnelink } from '@/utils/airbridgeLink';

const ASSET = (name: string) => `${BASE_PATH}/assets/figma/${name}`;

const SHEET_ANIM_MS = 280;
const SHEET_DRAG_CLOSE_PX = 120;
const SHEET_DRAG_CLOSE_RATIO = 0.25;

type SheetKey = 'normal' | 'large' | null;

export default function FirstFreeLanding() {
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [ctx, setCtx] = useState<RouteContext>({ variant: null, from: null, campaign: null });
  const [isRedirecting, setIsRedirecting] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  /* ---- 쿼리 파라미터 + 분석 초기화 ---- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: RouteContext = {
      variant: params.get('variant'),
      from: params.get('from'),
      campaign: params.get('campaign'),
    };
    setCtx(next);

    initAnalytics();
    trackLandingView(next);
  }, []);

  /* ---- 시트 열림 동안 body 스크롤 잠금 + 시트 자체에 포커스 (ESC 키 핸들러 동작용) ---- */
  useEffect(() => {
    if (sheet) {
      document.body.style.overflow = 'hidden';
      sheetRef.current?.focus();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheet]);

  /* ---- 페이지 전체 우클릭/이미지 저장 차단 (globals.css의 pointer-events:none과 함께 동작) ---- */
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('dragstart', prevent);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('dragstart', prevent);
    };
  }, []);

  const openSheet = useCallback((key: Exclude<SheetKey, null>) => {
    if (key === 'normal') trackNormalBagNoticeClick(ctx);
    else trackLargeBagNoticeClick(ctx);
    setSheetClosing(false);
    setSheet(key);
  }, [ctx]);

  const closeSheet = useCallback(() => {
    setSheetClosing(true);
    setTimeout(() => {
      setSheet(null);
      setSheetClosing(false);
    }, SHEET_ANIM_MS);
  }, []);

  const handlePrimaryCta = useCallback(() => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    const { link, mode } = getAirbridgeOnelink();
    trackPrimaryCtaClick(ctx, mode);
    window.location.assign(link);
  }, [ctx, isRedirecting]);

  /* ---- 시트 드래그 닫기 ---- */
  const dragRef = useRef<{
    startY: number;
    lastY: number;
    pointerId: number | null;
    height: number;
  } | null>(null);
  const [dragY, setDragY] = useState(0);

  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = sheetRef.current;
    if (!el) return;
    dragRef.current = {
      startY: e.clientY,
      lastY: e.clientY,
      pointerId: e.pointerId,
      height: el.getBoundingClientRect().height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const delta = e.clientY - s.startY;
    s.lastY = e.clientY;
    setDragY(delta > 0 ? delta : 0);
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s || s.pointerId !== e.pointerId) return;
    const delta = s.lastY - s.startY;
    dragRef.current = null;
    setDragY(0);
    if (delta > SHEET_DRAG_CLOSE_PX || delta > s.height * SHEET_DRAG_CLOSE_RATIO) {
      closeSheet();
    }
  }, [closeSheet]);

  return (
    <div
      className="relative w-full bg-white"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      data-screen="first-free-landing"
    >
        <section>
          <img src={ASSET('01_hero.png')} alt="커버링 첫 수거, 0원으로 시작해보세요" className="block h-auto w-full" />
        </section>
        <section>
          <img src={ASSET('02_intro.png')} alt="집 앞에 봉투만 두세요 — 봉투에 담고 앱으로 신청만 하면 커버링이 수거해가요" className="block h-auto w-full" />
        </section>
        <section>
          <img src={ASSET('03_coupon_card.png')} alt="처음 만난 기념 특별한 혜택 — 첫 만남 쿠폰 0원" className="block h-auto w-full" />
        </section>
        <section>
          <img src={ASSET('04_coupon_usage.png')} alt="쿠폰은 어떻게 사용하나요 — 수거 신청 시 첫 만남 쿠폰을 적용해주세요" className="block h-auto w-full" />
        </section>

        {/* 수거 신청 방법 그룹 */}
        <section>
          <img src={ASSET('05a_howto_top.png')} alt="수거 신청 방법 1, 2 — 일반 커버링 봉투 80L" className="block h-auto w-full" />
        </section>
        <section
          className="flex items-center justify-center bg-[#F8FAFB]"
          style={{ aspectRatio: '360 / 44' }}
        >
          <button
            type="button"
            aria-label="일반 커버링 봉투 배출 유의사항 열기"
            onClick={() => openSheet('normal')}
            className="block active:opacity-80"
            style={{ width: 'calc(201 / 360 * 100%)' }}
          >
            <img src={ASSET('05b_normal_bag_button.png')} alt="일반 커버링 봉투 배출 유의사항" className="block h-auto w-full pointer-events-none" />
          </button>
        </section>
        <section>
          <img src={ASSET('05c_largebag.png')} alt="대형 커버링 봉투 220L" className="block h-auto w-full" />
        </section>
        <section
          className="flex items-center justify-center bg-[#F8FAFB]"
          style={{ aspectRatio: '360 / 44' }}
        >
          <button
            type="button"
            aria-label="대형 커버링 봉투 배출 유의사항 열기"
            onClick={() => openSheet('large')}
            className="block active:opacity-80"
            style={{ width: 'calc(201 / 360 * 100%)' }}
          >
            <img src={ASSET('05d_large_bag_button.png')} alt="대형 커버링 봉투 배출 유의사항" className="block h-auto w-full pointer-events-none" />
          </button>
        </section>
        <section>
          <img src={ASSET('05e_howto_bottom.png')} alt="신청 일자에 맞게 문 앞에 두면 오후 10시 이후 수거 시작" className="block h-auto w-full" />
        </section>

        <section>
          <img src={ASSET('06_compare.png')} alt="일반·대형 봉투 한눈에 비교하기" className="block h-auto w-full" />
        </section>
        <section>
          <img src={ASSET('07_faq.png')} alt="자주 묻는 질문" className="block h-auto w-full" />
        </section>
        <section>
          <img src={ASSET('08_closing.png')} alt="지금 첫 수거, 무료로 시작해보세요" className="block h-auto w-full" />
        </section>

        {/* Sticky 하단 CTA — 안내 문구 + 버튼이 한 이미지(cta_bottom.png)에 들어있어서 폭에 맞춰 자연스럽게 스케일.
            전체 이미지 영역이 클릭 가능. */}
        <button
          type="button"
          aria-label="첫 수거 무료로 받기"
          aria-busy={isRedirecting}
          disabled={isRedirecting}
          onClick={handlePrimaryCta}
          className="sticky bottom-0 z-40 block w-full bg-white active:opacity-80 disabled:opacity-60 disabled:pointer-events-none"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <img src={ASSET('cta_bottom.png')} alt="가입 선물 쿠폰은 14일 안에 사라져요 — 첫 수거 무료로 받기" className="block h-auto w-full" />
        </button>

      {/* 유의사항 시트 — dim은 viewport 전체, 시트는 본문 컬럼과 같은 폭/위치(max-w-727 mx-auto)로 정렬 */}
      {sheet && (
        <>
          <div
            onClick={closeSheet}
            className="fixed inset-0 z-[50] bg-white/50"
            style={{
              animation: sheetClosing
                ? `dim-fadein ${SHEET_ANIM_MS}ms ease-out reverse forwards`
                : `dim-fadein ${SHEET_ANIM_MS}ms ease-out forwards`,
            }}
          />
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[51] flex justify-center">
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={sheet === 'normal' ? '일반 봉투 배출 유의사항' : '대형 봉투 배출 유의사항'}
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSheet(); }}
            className="pointer-events-auto w-full max-w-[727px] rounded-t-[24px] bg-white outline-none"
            style={{
              maxHeight: '92dvh',
              animation: sheetClosing
                ? `bottomsheet-up ${SHEET_ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1) reverse forwards`
                : `bottomsheet-up ${SHEET_ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              display: 'flex',
              flexDirection: 'column',
              transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
              transition: dragY === 0 ? 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
              willChange: 'transform',
            }}
          >
            {/* 드래그 핸들 영역 — 이 영역을 잡고 아래로 드래그하면 닫힘 */}
            <div
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              className="flex cursor-grab justify-center pt-[10px] pb-[10px] touch-none select-none active:cursor-grabbing"
            >
              <div className="h-[4px] w-[40px] rounded-full bg-[#E5E7EB]" />
            </div>
            <div className="flex-1 overflow-y-auto px-[20px] pb-[8px]">
              <img
                src={ASSET(sheet === 'normal' ? 'sheet_normal_bag.png' : 'sheet_large_bag.png')}
                alt={sheet === 'normal' ? '일반 봉투 배출 시 꼭 지켜주세요' : '대형 봉투 배출 시 꼭 지켜주세요'}
                className="block h-auto w-full"
              />
            </div>
            <div className="px-[20px] pt-[8px] pb-[20px]">
              <button
                type="button"
                aria-label="확인했어요"
                onClick={closeSheet}
                className="block w-full active:opacity-80"
              >
                <img src={ASSET('sheet_confirm_button.png')} alt="확인했어요" className="block h-auto w-full" />
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
