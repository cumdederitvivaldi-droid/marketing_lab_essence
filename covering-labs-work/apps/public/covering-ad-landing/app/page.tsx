"use client";

/**
 * 커버링 방문수거 광고 랜딩페이지
 *
 * 이미지 자리는 .ph-box 플레이스홀더로 표시되고 박스 안에 가로x세로 사이즈가 적혀 있습니다.
 * Higgsfield로 생성한 이미지로 <Image> 교체하면 됩니다.
 */

import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// next/image는 basePath를 src에 자동으로 붙이지 않으므로 public 에셋 경로에 직접 붙인다.
// (covering-spot과 동일 패턴 — 없으면 이미지 옵티마이저가 원본을 못 찾아 이미지가 깨진다.)
const BASE_PATH = "/covering-ad-landing";
const asset = (p: string) => `${BASE_PATH}${p}`;
const LOGO_SRC = asset("/images/covering-logo-symbol.png");
const LOGO_RATIO = 3840 / 1620;
const PHONE = "010-7537-6848";
const KAKAO_URL =
  "https://bizmessage.kakao.com/chat/open/@%EC%BB%A4%EB%B2%84%EB%A7%81%EC%8A%A4%ED%8C%9F?extra=ad_landing";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// Meta Pixel 'Contact'(문의) 표준 이벤트 — 카톡/전화 상담 CTA 클릭 시 발사
const trackContact = (location: string) =>
  window.fbq?.("track", "Contact", { location });

// ---------------------------------------------------------------------------
// 공통 빌딩 블록
// ---------------------------------------------------------------------------

function Placeholder({
  w,
  h,
  label = "Higgsfield 이미지",
  className = "",
}: {
  w: number;
  h: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("ph-box", className)}
      style={{ aspectRatio: `${w} / ${h}` }}
      aria-label={`${label} placeholder ${w}x${h}`}
    >
      <span>
        {label} · {w} × {h}
      </span>
    </div>
  );
}

/**
 * 모바일/PC 별도 이미지가 필요한 자리에 사용.
 * 각 이미지 ID(예: "IMG-01")로 사용자와 동기화.
 */
function PhDuo({
  id,
  label,
  mobile,
  desktop,
  className = "",
}: {
  id: string;
  label: string;
  mobile: { w: number; h: number };
  desktop: { w: number; h: number };
  className?: string;
}) {
  return (
    <>
      <div
        className={cn("ph-box sm:hidden", className)}
        style={{ aspectRatio: `${mobile.w} / ${mobile.h}` }}
        aria-label={`${id} MOBILE ${mobile.w}x${mobile.h}`}
      >
        <span className="leading-snug">
          <b>{id} · MOBILE</b>
          <br />
          {label}
          <br />
          {mobile.w} × {mobile.h}
        </span>
      </div>
      <div
        className={cn("ph-box hidden sm:flex", className)}
        style={{ aspectRatio: `${desktop.w} / ${desktop.h}` }}
        aria-label={`${id} DESKTOP ${desktop.w}x${desktop.h}`}
      >
        <span className="leading-snug">
          <b>{id} · DESKTOP</b>
          <br />
          {label}
          <br />
          {desktop.w} × {desktop.h}
        </span>
      </div>
    </>
  );
}

function LogoSlot({
  w,
  h,
  className = "",
  label = "LOGO",
}: {
  w: number;
  h: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn("ph-logo", className)}
      style={{ width: w, height: h }}
      aria-label={`${label} ${w}x${h}`}
    >
      {label} {w}×{h}
    </span>
  );
}

/**
 * (효과 4) 글자별 stagger fade-up — viewport 진입 시 트리거 (1회)
 */
function StaggerText({
  text,
  className = "",
  startDelay = 0,
}: {
  text: string;
  className?: string;
  startDelay?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // 이미 viewport 안이면 즉시 노출 + IntersectionObserver 미지원 폴백
    const rect = el.getBoundingClientRect();
    if (
      typeof IntersectionObserver === "undefined" ||
      (rect.top < window.innerHeight && rect.bottom > 0)
    ) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="inline-block transition-all duration-500 ease-out will-change-transform"
          style={{
            transitionDelay: shown ? `${startDelay + i * 35}ms` : "0ms",
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(20px)",
          }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

function Kicker({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-3 py-1 text-[11px] tracking-[0.08em] uppercase font-bold",
        dark
          ? "bg-white/10 text-white/70 border-white/15"
          : "bg-white text-foreground/70 border-foreground/10"
      )}
    >
      {children}
    </Badge>
  );
}

function SectionTitle({
  kicker,
  title,
  desc,
  align = "center",
  dark = false,
}: {
  kicker?: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  align?: "left" | "center";
  dark?: boolean;
}) {
  const a = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <div className={cn("flex flex-col gap-3", a)}>
      {kicker ? <Kicker dark={dark}>{kicker}</Kicker> : null}
      <h2
        className={cn(
          "text-[30px] sm:text-[38px] font-bold leading-[1.25] tracking-tight",
          dark ? "text-white" : "text-foreground"
        )}
      >
        {title}
      </h2>
      {desc ? (
        <p
          className={cn(
            "text-[17px] sm:text-[19px] leading-relaxed max-w-2xl font-medium",
            dark ? "text-white/75" : "text-foreground/70"
          )}
        >
          {desc}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

function TopBar() {
  return (
    <header className="hidden sm:block sticky top-9 z-40 bg-white/90 backdrop-blur border-b border-foreground/10">
      <div className="mx-auto max-w-[1080px] flex items-center justify-between gap-3 px-4 sm:px-5 h-14">
        <div className="flex items-center min-w-0">
          <Image
            src={LOGO_SRC}
            alt="커버링 방문수거"
            width={Math.round(36 * LOGO_RATIO)}
            height={36}
            priority
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`tel:${PHONE}`}
            onClick={() => trackContact("topbar_phone")}
            className={cn(
              buttonVariants({ variant: "outline", size: "pill" }),
              "border-foreground/10 text-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            )}
            aria-label={`전화상담 ${PHONE}`}
          >
            전화상담
          </a>
          <a
            href={KAKAO_URL}
            onClick={() => trackContact("topbar_kakao")}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ size: "pill" }),
              "bg-[#FEE500] text-[#3C1E1E] hover:bg-[#FDD800] gap-1.5"
            )}
          >
            <KaTalkIcon className="w-4 h-4" />
            카톡상담
          </a>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function NoticeBar() {
  return (
    <div className="sticky top-0 z-50 bg-black text-[color:var(--hl-yellow)] text-[12.5px] sm:text-sm font-bold text-center py-2 px-3 whitespace-nowrap overflow-hidden text-ellipsis">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden>⚡</span>
        오늘만! 즉시할인 <span className="text-white">1만원</span> + 후기 페이백 최대{" "}
        <span className="text-white">4만원</span> 혜택까지!
      </span>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative bg-[color:var(--ink-dark)] text-white overflow-hidden">
      {/* PC 양옆 blur mirror — 빈 공간 채움 */}
      <div
        aria-hidden
        className="hidden sm:block absolute inset-0 pointer-events-none"
      >
        <Image
          src={asset("/images/hero7.png")}
          alt=""
          fill
          sizes="100vw"
          priority={false}
          className="object-cover blur-3xl opacity-25 scale-110"
        />
        {/* 가운데 main 이미지 영역만 어둡게 마스킹 */}
        <div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[640px] bg-[color:var(--ink-dark)]"
          style={{
            boxShadow:
              "0 0 80px 40px rgba(2,8,16,0.95)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[640px] overflow-hidden">
        <Image
          src={asset("/images/hero7.png")}
          alt="대형·대량 폐기물 — 이젠 쉽고 간편하게"
          width={1280}
          height={1714}
          priority
          sizes="(max-width: 640px) 100vw, 640px"
          className="w-full h-auto block -mt-[50px]"
        />

        {/* 텍스트 오버레이 */}
        <div className="absolute inset-x-0 top-0 px-5 pt-10 sm:pt-14 text-center flex flex-col items-center gap-4 sm:gap-5">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/10 text-white/80 text-[12px] font-bold tracking-wide ring-1 ring-white/15">
            대형가구 · 가전 · 이사 쓰레기
          </span>

          <h1 className="text-[32px] sm:text-[44px] font-bold leading-[1.18] tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            대형·대량 폐기물
            <br />
            이젠 쉽고 간편하게
          </h1>

          <p className="text-[16px] sm:text-[20px] font-bold text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            카톡 한 번으로 방문수거까지
          </p>
        </div>
      </div>
    </section>
  );
}

function StickyMobileCta() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById("trust-trigger");
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      // 섹션 상단이 viewport에 닿으면 트리거
      { rootMargin: "0px 0px -10% 0px", threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 bg-brand animate-in fade-in slide-in-from-bottom-4 duration-300"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <a
        href="#apply"
        className="flex items-center justify-center gap-2 h-14 w-full text-white text-[18px] font-bold tracking-tight active:brightness-95"
      >
        <span>무료견적 받기</span>
        <span className="ml-1 text-xl">›</span>
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LeadForm (Card + shadcn 입력)
// ---------------------------------------------------------------------------

const LEAD_API = "https://covering-spot-chatbot.vercel.app/api/public/inbound-lead";

function LeadForm({ id = "apply" }: { id?: string }) {
  const uid = id;
  const [agreeOpen, setAgreeOpen] = useState(true);
  const [agree1, setAgree1] = useState(false);
  const [agree2, setAgree2] = useState(false);
  const [agree3, setAgree3] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openTerm, setOpenTerm] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const lastSubmit = useRef<{ phone: string; at: number } | null>(null);
  const allChecked = agree1 && agree2 && agree3;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    const trimmedPhone = phone.replace(/\D/g, "");

    if (!trimmedName || !trimmedPhone) {
      setError("이름과 휴대폰 번호를 입력해주세요.");
      return;
    }
    if (!/^01\d{8,9}$/.test(trimmedPhone)) {
      setError("올바른 휴대폰 번호를 입력해주세요.");
      return;
    }
    if (!agree1 || !agree2) {
      setError("필수 약관에 동의해주세요.");
      return;
    }

    const now = Date.now();
    if (
      lastSubmit.current &&
      lastSubmit.current.phone === trimmedPhone &&
      now - lastSubmit.current.at < 5000
    ) {
      setError("잠시 후 다시 시도해주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(LEAD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data && (data.error || data.message)) || "접수에 실패했습니다."
        );
      }
      lastSubmit.current = { phone: trimmedPhone, at: now };
      setName("");
      setPhone("");
      setAgree1(false);
      setAgree2(false);
      setAgree3(false);
      setSuccessOpen(true);
      window.fbq?.("track", "Lead");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setAll = (next: boolean) => {
    setAgree1(next);
    setAgree2(next);
    setAgree3(next);
  };

  // 010-XXXX-XXXX 자동 하이픈 포맷
  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  };

  return (
    <section id={id} className="bg-white">
      <div className="mx-auto max-w-[560px] px-4 sm:px-5 py-12 sm:py-20">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-[24px] sm:text-[32px] font-bold leading-[1.4] tracking-tight">
            힘들어서 미루고 있던 <span className="text-brand">내 집 정리</span>
            <br />
            커버링이 처리해 드릴게요
          </h2>
        </div>

        <form onSubmit={handleSubmit}>

        {/* 이름 / 연락처 (라벨 위에, 입력 아래) */}
        <div className="space-y-2.5">
          <div className="rounded-xl ring-1 ring-foreground/15 bg-white px-4 pt-2.5 pb-2">
            <Label
              htmlFor={`${uid}-name`}
              className="text-[11px] text-muted-foreground font-semibold block"
            >
              이름
            </Label>
            <Input
              id={`${uid}-name`}
              name="name"
              autoComplete="name"
              placeholder="이름을 입력해주세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border-0 h-7 px-0 text-base font-semibold focus-visible:ring-0 focus-visible:border-0"
            />
          </div>
          <div className="rounded-xl ring-1 ring-foreground/15 bg-white px-4 pt-2.5 pb-2">
            <Label
              htmlFor={`${uid}-tel`}
              className="text-[11px] text-muted-foreground font-semibold block"
            >
              휴대폰 번호
            </Label>
            <Input
              id={`${uid}-tel`}
              name="tel"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              maxLength={13}
              className="border-0 h-7 px-0 text-base font-semibold focus-visible:ring-0 focus-visible:border-0"
            />
          </div>
        </div>

        {/* 전체동의 펼침 */}
        <div className="mt-3 rounded-xl ring-1 ring-foreground/15 bg-white overflow-hidden">
          <div className="w-full flex items-center justify-between px-4 py-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox
                checked={allChecked}
                onCheckedChange={(v) => setAll(Boolean(v))}
              />
              <span className="font-bold text-[14px]">전체 동의</span>
            </label>
            <button
              type="button"
              onClick={() => setAgreeOpen((o) => !o)}
              aria-label="약관 상세 펼치기"
              aria-expanded={agreeOpen}
              className="p-1 -m-1"
            >
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  agreeOpen && "rotate-180"
                )}
              />
            </button>
          </div>
          {agreeOpen && (
            <div className="px-4 pb-4 border-t border-foreground/10 divide-y divide-foreground/5">
              {[
                {
                  st: agree1,
                  set: setAgree1,
                  label: "(필수) 개인정보 수집 및 활용 동의 ((주)커버링)",
                },
                {
                  st: agree2,
                  set: setAgree2,
                  label: "(필수) 견적 상담을 위한 카톡·문자 수신 동의",
                },
                {
                  st: agree3,
                  set: setAgree3,
                  label: "(선택) 마케팅 정보 수신 동의",
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-3"
                >
                  <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                    <Checkbox
                      checked={row.st}
                      onCheckedChange={(v) => row.set(Boolean(v))}
                    />
                    <span className="text-[13px] text-foreground/80">{row.label}</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setOpenTerm(i)}
                    aria-label={`${row.label} 자세히 보기`}
                    className="text-muted-foreground/60 text-base px-2 py-1 hover:text-foreground"
                  >
                    ›
                  </button>
                </div>
              ))}
              <div className="pt-3 text-[12px] font-bold">
                <span className="text-brand">✔ 혜택 및 이벤트 소식</span>
                <span className="text-foreground/70">
                  을 가장 먼저 알려드릴게요!
                </span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-[13px] text-[#EF4444] font-semibold text-center">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="brand"
          size="xl"
          disabled={submitting}
          className="w-full mt-5 rounded-[8px]"
        >
          {submitting ? "전송 중..." : "무료 전화상담 신청"}
        </Button>
        </form>
      </div>

      {/* 바텀 모달 — 약관 상세 */}
      <TermsModal openIndex={openTerm} onClose={() => setOpenTerm(null)} />

      {/* 신청 완료 모달 */}
      {successOpen && <SuccessModal onClose={() => setSuccessOpen(false)} />}
    </section>
  );
}

function SuccessModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="success-title"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-[400px] w-full p-7 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 체크 아이콘 */}
        <div className="mx-auto w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mb-4">
          <svg
            className="w-9 h-9 text-brand"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h3 id="success-title" className="text-[20px] sm:text-[22px] font-bold leading-snug">
          상담 신청해주셔서
          <br />
          감사합니다
        </h3>
        <p className="mt-3 text-[15px] sm:text-[16px] text-foreground/70 leading-relaxed">
          영업일 기준 <span className="text-brand font-bold">24시간 내</span>로
          <br />
          연락드릴게요!
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full h-12 rounded-[8px] bg-brand text-white text-[15px] font-bold hover:bg-brand-dark transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  );
}

const TERMS = [
  {
    title: "(필수) 개인정보 수집 및 활용 동의",
    body: `커버링은 견적 상담 및 서비스 제공을 위해 아래와 같이 개인정보를 수집·이용합니다.

▸ 수집 항목
  · 이름, 휴대폰 번호, 수거 주소

▸ 수집·이용 목적
  · 견적 안내 · 예약 확정 · 수거 진행 안내
  · 서비스 이용 관련 고객 문의 응대

▸ 보유 기간
  · 수집 후 6개월 보관 후 즉시 파기
  · 단, 관련 법령에 따라 일정 기간 보관이 필요한 경우 그에 따름

▸ 동의 거부 권리
  · 정보 제공 동의를 거부하실 수 있으나, 거부 시 서비스 신청·견적 안내가 제한됩니다.

전문은 개인정보처리방침에서 확인하실 수 있습니다.`,
  },
  {
    title: "(필수) 견적 상담을 위한 카톡·문자 수신 동의",
    body: `▸ 수신 채널
  · 카카오톡 알림톡 / 친구톡
  · SMS · LMS 문자

▸ 발송 내용
  · 신청한 견적에 대한 안내 · 예약 확인 · 수거 일정 안내
  · 상담사 응답 및 답변

▸ 수신 거부
  · 거부 시 견적 응답을 받으실 수 없습니다.
  · 동의 후에도 언제든 카톡 채널에서 차단으로 수신 거부할 수 있습니다.`,
  },
  {
    title: "(선택) 마케팅 정보 수신 동의",
    body: `▸ 발송 내용
  · 커버링의 신규 서비스 안내, 이벤트 · 프로모션 소식, 쿠폰 등 혜택 정보

▸ 발송 채널
  · 카카오톡 · SMS · 이메일

▸ 수신 거부
  · 선택 동의 항목이며, 미동의해도 서비스 신청에는 영향이 없습니다.
  · 동의 후에도 수신 거부 의사를 표시하면 언제든 발송이 중단됩니다.`,
  },
];

function TermsModal({
  openIndex,
  onClose,
}: {
  openIndex: number | null;
  onClose: () => void;
}) {
  // body scroll lock
  useEffect(() => {
    if (openIndex === null) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [openIndex]);

  if (openIndex === null) return null;
  const term = TERMS[openIndex];
  if (!term) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="term-modal-title"
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />

      {/* sheet */}
      <div
        className="relative w-full sm:max-w-[560px] max-h-[88vh] bg-white rounded-t-2xl sm:rounded-2xl sm:mb-6 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-foreground/10">
          <h3 id="term-modal-title" className="text-[16px] sm:text-[18px] font-bold leading-snug">
            {term.title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-1 p-2 text-foreground/60 hover:text-foreground text-xl leading-none"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-[13.5px] sm:text-[14px] text-foreground/80 leading-relaxed whitespace-pre-line">
          {term.body}
        </div>
        <div className="px-5 py-4 border-t border-foreground/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-[8px] bg-brand text-white text-[14px] font-bold hover:bg-brand-dark transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust 3 cards
// ---------------------------------------------------------------------------

function TrustTriple() {
  const items: {
    label: string;
    titleA: string;
    titleHL: string;
    titleB: string;
    titleBreak: string;
    desc: string;
    img?: string;
    hideText?: boolean; // 이미지 자체에 카피 합성된 경우 헤드라인/desc 숨김
    hideLabel?: boolean; // 이미지 안에 라벨 카피가 이미 있어서 라벨 숨김
    descOverlay?: boolean; // desc를 이미지 위 absolute overlay로
    headTop?: string; // 헤드 overlay 위치 (이미지 상단에서 거리, 기본 8px)
    cardPadTop?: string; // 카드 상단 패딩 — 이미지 자체를 아래로 밀어 헤드와 간격 확보
  }[] = [
    {
      label: "입증된 신뢰",
      titleA: "이미 ",
      titleHL: "40만+",
      titleB: "이 선택한",
      titleBreak: "믿을 수 있는 업체",
      desc: "",
      img: asset("/images/trust-01.jpg"),
      cardPadTop: "12px",
    },
    {
      label: "본사 직영",
      titleA: "",
      titleHL: "100% 신원 확인",
      titleB: "",
      titleBreak: "전문 기사님이 직접 방문",
      desc: "본사 자체 교육을 통과한\n전문 인력만 방문합니다",
      img: asset("/images/trust-02.jpg"),
      descOverlay: true,
      headTop: "12px",
      cardPadTop: "60px",
    },
    {
      label: "빠르고 간편하게",
      titleA: "",
      titleHL: "카톡 한 번",
      titleB: "이면",
      titleBreak: "수거 예약까지 끝",
      desc: "",
      img: asset("/images/trust-03.jpg"),
      headTop: "12px",
      cardPadTop: "60px",
    },
  ];
  return (
    <section id="trust-trigger" className="bg-[#051428] text-white">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle
          dark
          title={
            <>
              <StaggerText text="이젠 폐기물 때문에" />
              <br />
              <StaggerText
                text="시간 낭비하지 마세요"
                className="text-[#38E1FF]"
                startDelay={450}
              />
            </>
          }
          desc={
            <>
              동주민센터 신고 · 스티커 부착 · 직접 배출,
              <br className="sm:hidden" /> 커버링이 모두 대신해드립니다.
            </>
          }
        />
        {/* ─────────────────────────────────────────────────────────────
            TrustTriple 카드 overlay 위치 조절 (모두 헤드 overlay)
              · TRUST_HEAD_TOP  : 헤드라인(라벨+제목)이 이미지 상단에서 떨어진 거리
              · TRUST_DESC_BOTTOM : desc overlay가 이미지 하단에서 떨어진 거리
            ───────────────────────────────────────────────────────────── */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-14 sm:gap-10">
          {items.map((it) => (
            <div
              key={it.titleBreak}
              className="relative flex flex-col items-center text-center"
              style={{ paddingTop: it.cardPadTop }}
            >
              {/* 이미지 — 3:4 세로 */}
              {it.img ? (
                <Image
                  src={it.img}
                  alt={it.label}
                  width={1200}
                  height={1600}
                  sizes="(max-width: 640px) 100vw, 360px"
                  className="w-full h-auto block"
                />
              ) : (
                <Placeholder
                  w={900}
                  h={1200}
                  label={`${it.label} 이미지`}
                  className="bg-white/[0.06] border border-white/10 text-white/70"
                />
              )}

              {/* radial 페이드 overlay — 가장자리 섹션 BG와 융합 */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 70% 85% at center, transparent 35%, #051428 95%)",
                }}
              />

              {/* 상단 overlay: 라벨 + 헤드라인  ← TRUST_HEAD_TOP 조정 */}
              <div
                className="absolute inset-x-0 px-5 flex flex-col items-center gap-3 pointer-events-none"
                style={{ top: it.headTop ?? "8px" /* TRUST_HEAD_TOP */ }}
              >
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white/[0.06] ring-1 ring-white/15 text-white/85 text-[15px] font-bold tracking-[0.04em]">
                  {it.label}
                </span>
                <h3 className="text-[26px] sm:text-[24px] font-bold text-white leading-[1.35] keep-all break-keep">
                  {it.titleA}
                  <span className="text-[#38E1FF]">{it.titleHL}</span>
                  {it.titleB}
                  <br />
                  {it.titleBreak}
                </h3>
              </div>

              {/* 하단 overlay: desc — 카드별 옵션  ← TRUST_DESC_BOTTOM 조정 */}
              {it.desc && (
                <p
                  className="absolute inset-x-0 px-5 text-[15px] sm:text-[16px] text-white/75 leading-relaxed text-center pointer-events-none whitespace-pre-line"
                  style={{ bottom: "24px" /* TRUST_DESC_BOTTOM */ }}
                >
                  {it.desc}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// StatsBanner (다크)
// ---------------------------------------------------------------------------

function StatsBanner() {
  const stats = [
    { num: "5분", label: "평균 견적 응답" },
    { num: "당일", label: "최단 수거 일정" },
    { num: "3개 시도", label: "서울·경기·인천" },
    { num: "4.9", label: "카카오 채널 평점", suffix: "★" },
  ];
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1080px] px-5 py-14 sm:py-20">
        <div className="rounded-3xl bg-[color:var(--ink-dark)] text-white px-6 sm:px-10 py-12 sm:py-16">
          <div className="flex flex-col gap-3 text-center">
            <span className="text-[11px] font-bold tracking-[0.12em] text-white/50 uppercase">
              Covering Numbers
            </span>
            <h2 className="text-[22px] sm:text-[32px] font-bold leading-tight">
              많은 분들이 이미 짐 걱정에서
              <br className="sm:hidden" /> 자유로워졌습니다
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-2">
            {stats.map((s) => (
              <div
                key={s.label}
                className="text-center sm:border-l sm:border-white/10 sm:first:border-l-0"
              >
                <div className="text-[34px] sm:text-[40px] font-bold leading-none">
                  {s.suffix ? (
                    <>
                      <span className="text-[color:var(--hl-yellow)]">{s.suffix}</span> {s.num}
                    </>
                  ) : (
                    s.num
                  )}
                </div>
                <div className="text-[13px] text-white/60 mt-2">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

function CompareSection() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle
          title={
            <>
              주민센터에서 매번 신고하고
              <br />
              <span className="text-brand">무거운 짐 들고 나가지 마세요</span>
            </>
          }
        />

        <div className="mt-10 bg-white rounded-2xl ring-1 ring-foreground/10 overflow-hidden shadow-[0_10px_30px_-12px_rgba(0,0,0,0.12)]">
          {/* 상단 좌우 반반 이미지 + ✕/◯ 라벨 */}
          <div className="grid grid-cols-2">
            <div className="relative">
              <Image
                src={asset("/images/compare-a.jpg")}
                alt="기존 배출 방식"
                width={1500}
                height={1120}
                sizes="(max-width: 640px) 50vw, 320px"
                className="w-full h-full object-cover block"
              />
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-[#EF4444] text-white px-2.5 py-1 rounded-full text-[12px] font-bold">
                <span aria-hidden className="text-[14px] leading-none">✕</span>
                기존 방식
              </div>
            </div>
            <div className="relative">
              <Image
                src={asset("/images/compare-b.jpg")}
                alt="커버링 방문수거"
                width={1500}
                height={1120}
                sizes="(max-width: 640px) 50vw, 320px"
                className="w-full h-full object-cover block"
              />
              <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-brand text-white px-2.5 py-1 rounded-full text-[12px] font-bold">
                <span aria-hidden className="text-[14px] leading-none">○</span>
                커버링
              </div>
            </div>
          </div>

          {/* 본문 좌우 비교 리스트 */}
          <div className="grid grid-cols-2 divide-x divide-foreground/10">
            <div className="p-4 sm:p-6">
              <h3 className="text-[14px] sm:text-[17px] font-bold leading-snug">
                동주민센터
                <br />
                직접 배출
              </h3>
              <ul className="mt-3 space-y-2 text-[12.5px] sm:text-[14px] text-muted-foreground leading-relaxed">
                <li>· 품목별 신고·스티커 구매</li>
                <li>· 정해진 요일·장소 배출</li>
                <li>· 무거운 가구 직접 X</li>
                <li>· 미분리 시 과태료</li>
              </ul>
            </div>
            <div className="p-4 sm:p-6 bg-brand-soft/40">
              <h3 className="text-[14px] sm:text-[17px] font-bold leading-snug text-brand">
                카톡 신청
                <br />
                방문수거
              </h3>
              <ul className="mt-3 space-y-2 text-[12.5px] sm:text-[14px] text-foreground leading-relaxed">
                <li>· 카톡으로 5분 안에 예약</li>
                <li>· 집 안에서 그대로 수거</li>
                <li>· 가구·가전 한 번에</li>
                <li>· 추가요금 없는 확정견적</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Strengths (zig-zag)
// ---------------------------------------------------------------------------

function Strengths() {
  const items = [
    {
      num: "01",
      title: "사진 한 장이면 5분 안에 견적",
      desc: "카톡으로 짐 사진을 보내주시면 품목·수량·층수를 보고 정확한 금액을 산정합니다. 현장에서 금액이 바뀌지 않습니다.",
    },
    {
      num: "02",
      title: "집 안에서 그대로 수거",
      desc: "엘리베이터가 없거나 가구가 무거워 못 내리시는 분도 걱정 마세요. 수거 인력이 직접 집 안에서 들고 내려갑니다.",
    },
    {
      num: "03",
      title: "수거 후 영수증·인증샷까지 카톡 전송",
      desc: "정상 처리 여부를 사진으로 확인하실 수 있습니다. 처리 과정이 투명해 안심하고 맡기실 수 있습니다.",
    },
  ];
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle kicker="3가지 강점" title={<>왜 다들 커버링 방문수거에 맡길까요?</>} />
        <div className="mt-10 flex flex-col gap-6">
          {items.map((it, idx) => (
            <article
              key={it.num}
              className={cn(
                "grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 items-center bg-surface rounded-3xl p-6 sm:p-10",
                idx % 2 === 1 ? "sm:[&>*:first-child]:order-2" : ""
              )}
            >
              <Placeholder w={900} h={600} label={`강점 ${it.num} 이미지`} />
              <div>
                <span className="text-foreground/25 font-bold text-5xl sm:text-6xl leading-none tracking-tight">
                  {it.num}
                </span>
                <h3 className="mt-3 text-2xl sm:text-[26px] font-bold leading-snug">
                  {it.title}
                </h3>
                <p className="mt-3 text-base text-muted-foreground leading-relaxed">
                  {it.desc}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// PriceGuide
// ---------------------------------------------------------------------------

function PriceGuide() {
  const groups = [
    {
      head: "가구",
      items: [
        { name: "책상", price: "20,000원~" },
        { name: "옷장·서랍장", price: "30,000원~" },
        { name: "소파", price: "35,000원~" },
        { name: "싱글 매트리스·프레임", price: "50,000원~" },
      ],
    },
    {
      head: "가전",
      items: [
        { name: "TV·모니터", price: "5,000원~" },
        { name: "세탁기·건조기", price: "25,000원~" },
        { name: "에어컨 (분리 포함)", price: "25,000원~" },
        { name: "냉장고", price: "35,000원~" },
        { name: "안마의자", price: "50,000원~" },
      ],
    },
    {
      head: "기타·잡짐",
      items: [
        { name: "잡동사니 박스", price: "10,000원~" },
        { name: "80L 봉투", price: "10,000원~" },
        { name: "대형 마대자루", price: "20,000원~" },
        { name: "자전거·유모차·킥보드", price: "25,000원~" },
        { name: "러닝머신·헬스기구", price: "50,000원~" },
      ],
    },
  ];

  const [activeTab, setActiveTab] = useState(0);
  const active = groups[activeTab];

  return (
    <section id="price" className="bg-brand-soft">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle
          title={
            <>
              품목별 가격, <span className="text-brand">먼저 공개합니다</span>
            </>
          }
          desc="받아보신 견적 그대로, 추가요금은 없습니다!"
        />

        <div className="mt-10 mx-auto max-w-[600px] bg-white rounded-2xl p-4 sm:p-6 shadow-lg shadow-brand/10 ring-1 ring-foreground/5">
          {/* 탭 */}
          <div
            className="flex gap-1 p-1 rounded-full bg-foreground/[0.05]"
            role="tablist"
          >
            {groups.map((g, idx) => {
              const isActive = activeTab === idx;
              return (
                <button
                  key={g.head}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(idx)}
                  className={cn(
                    "flex-1 h-10 rounded-full text-[14px] sm:text-[15px] font-bold transition-all",
                    isActive
                      ? "bg-white text-foreground shadow-sm"
                      : "text-foreground/45 hover:text-foreground/70"
                  )}
                >
                  {g.head}
                </button>
              );
            })}
          </div>

          {/* 가격 리스트 */}
          <ul className="mt-4 sm:mt-5 px-2 sm:px-3 divide-y divide-foreground/10">
            {active.items.map((it) => {
              const m = it.price.match(/^([\d,]+)(원~?)$/);
              return (
                <li
                  key={it.name}
                  className="flex items-center justify-between py-3.5 sm:py-4 gap-3"
                >
                  <span className="text-foreground font-bold text-[15px] sm:text-[16px]">
                    {it.name}
                  </span>
                  <span className="whitespace-nowrap">
                    {m ? (
                      <>
                        <span className="font-bold text-brand text-[17px] sm:text-[18px] align-middle">
                          {m[1]}
                        </span>
                        <span className="text-foreground/70 text-[13px] font-bold ml-0.5">
                          {m[2]}
                        </span>
                      </>
                    ) : (
                      <span className="text-foreground/70 text-[14px] font-bold">
                        {it.price}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 pt-3 border-t border-foreground/10 text-[12px] text-muted-foreground space-y-1">
            <p>* 크기 · 층수 · 엘리베이터 유무 · 분해 여부에 따라 변동</p>
            <p>* 출장비 전 지역 50,000원</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ExtraPerks
// ---------------------------------------------------------------------------

function ExtraPerks() {
  const perks = [
    {
      title: "이사 · 청소 연계",
      desc: "이사·입주청소 업체와 일정 맞춰 짐만 따로 빼드립니다.",
    },
    {
      title: "당일·심야 수거",
      desc: "급한 일정도 가능. 카톡에 '당일' 한마디 적어주세요.",
    },
    {
      title: "사업장 정기 수거",
      desc: "매장·사무실 폐기물은 주 1회 / 월 1회 정기 계약이 가능합니다.",
    },
  ];
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle kicker="이런 것도 됩니다" title={<>대형폐기물만 끝이 아닙니다</>} />
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {perks.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl ring-1 ring-foreground/10 p-6 flex flex-col gap-3 bg-white"
            >
              <Placeholder w={600} h={360} label={`${p.title} 이미지`} />
              <h3 className="text-lg font-bold">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function Steps() {
  const steps = [
    { n: "01", t: "카톡으로 견적받기" },
    { n: "02", t: "예약 진행" },
    { n: "03", t: "방문수거" },
  ];
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle title={<>간단한 이용 절차</>} desc="5분이면 예약 완료!" />
        <ol className="mt-10 sm:mt-14 grid grid-cols-3 gap-3 sm:gap-8 items-start">
          {steps.map((s) => (
            <li key={s.n} className="flex flex-col items-center text-center">
              {/* 아이콘 동그라미 */}
              <div className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-full ring-1 ring-foreground/10 overflow-hidden bg-white">
                {/* 흰 BG 강제 */}
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: "#ffffff" }}
                />
                <Image
                  src={asset(`/images/step-${s.n}.png`)}
                  alt={s.t}
                  fill
                  sizes="(max-width: 640px) 80px, 112px"
                  className="object-contain p-2"
                  unoptimized
                />
              </div>
              {/* 번호 */}
              <span className="mt-4 text-brand font-bold text-[18px] sm:text-[22px] leading-none">
                {s.n}
              </span>
              {/* 라벨 */}
              <h3 className="mt-1.5 text-[13px] sm:text-[16px] font-bold leading-tight">
                {s.t}
              </h3>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FAQ (shadcn Accordion)
// ---------------------------------------------------------------------------

function Faq() {
  const list = [
    {
      q: "수거 가능한 지역이 어디까지인가요?",
      a: "현재 서울 / 경기 / 인천 전 지역에서 서비스 중입니다.",
    },
    {
      q: "스티커를 미리 사야 하나요?",
      a: "필요 없습니다.\n커버링이 자체적으로 폐기 처리하니, 손님은 스티커 구매·부착 없이 짐만 두시면 됩니다.",
    },
    {
      q: "1층까지 내릴 수 없는데 가능한가요?",
      a: "가능합니다.\n전문 기사님이 직접 방문하여 수거합니다.",
    },
    {
      q: "당일 수거도 되나요?",
      a: "차량 일정에 여유가 있으면 당일 수거가 가능합니다.\n가능 여부는 카톡으로 빠르게 안내드립니다.",
    },
    {
      q: "사업장(매장·사무실)도 가능한가요?",
      a: "네, 가능합니다.\n공사 폐기물을 제외한 모든 가구·가전·잡짐을 수거해드립니다.",
    },
  ];

  return (
    <section id="faq" className="bg-white">
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-20">
        <SectionTitle kicker="FAQ" title={<>자주 묻는 질문</>} />
        <div className="mt-10 max-w-3xl mx-auto">
          <Accordion className="border-t border-b border-foreground/10">
            {list.map((item, i) => (
              <AccordionItem key={i} value={`q-${i}`} className="border-b border-foreground/10">
                <AccordionTrigger className="py-5 text-[18px] sm:text-[19px] font-bold no-underline hover:no-underline">
                  Q. {item.q}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-[16px] sm:text-[17px] text-foreground/70 leading-relaxed pb-3 whitespace-pre-line">
                    {item.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA (다크)
// ---------------------------------------------------------------------------

function FinalCta() {
  return (
    <section className="bg-brand-soft text-foreground">
      <div className="mx-auto max-w-[1080px] px-5 pt-12 pb-10 sm:pt-20 sm:pb-14 text-center flex flex-col items-center gap-5">
        <h2 className="text-[28px] sm:text-[40px] font-bold leading-[1.2] tracking-tight">
          믿고 맡겨주세요
          <br />
          나머지는 <span className="text-brand">커버링</span>이 합니다.
        </h2>
        <p className="text-foreground/70 text-[15px] sm:text-lg">
          서울·경기·인천 어디든, 5분이면 예약 끝
        </p>
        <div className="w-full max-w-md flex flex-col sm:flex-row gap-3 mt-4">
          <a
            href={KAKAO_URL}
            onClick={() => trackContact("final_kakao")}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ size: "xl" }),
              "w-full sm:w-auto bg-[#FEE500] text-[#3C1E1E] hover:bg-[#FDD800] gap-2"
            )}
          >
            <KaTalkIcon className="w-5 h-5" />
            카카오톡으로 상담받기
          </a>
          <a
            href={`tel:${PHONE}`}
            onClick={() => trackContact("final_phone")}
            className={cn(
              buttonVariants({ variant: "soft", size: "xl" }),
              "w-full sm:w-auto gap-2"
            )}
          >
            <PhoneIcon className="w-5 h-5 text-[#1FBA5F]" />
            전화로 상담받기
          </a>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Floating CTA (카톡 + 전화)
// ---------------------------------------------------------------------------

function KaTalkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.78 1.78 5.22 4.5 6.64L5.32 21.4c-.1.32.24.58.52.4l4.42-2.84c.56.07 1.15.1 1.74.1 5.52 0 10-3.58 10-8s-4.48-8-10-8z" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function FloatingCta() {
  return (
    <div
      className={cn(
        "fixed right-3 sm:right-6 z-50 flex flex-col items-end gap-2.5 sm:gap-3 pointer-events-none",
        // 모바일: 하단 sticky CTA(56) + safe-area + 여유 24
        "bottom-[calc(env(safe-area-inset-bottom)+80px)] sm:bottom-6"
      )}
    >
      {/* 카톡 — PC: 말풍선 + 동그라미 / 모바일: 동그라미만 */}
      <div className="pointer-events-auto hidden sm:flex items-center gap-2">
        <div className="relative bg-white rounded-2xl ring-1 ring-foreground/10 shadow-lg shadow-black/5 px-3 py-2">
          <p className="text-sm font-bold leading-tight whitespace-nowrap">
            1분만에 카톡으로 받아보는{" "}
            <span className="text-brand">무료견적</span>
          </p>
          <span
            aria-hidden
            className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border-r border-t border-foreground/10 rotate-45"
          />
        </div>
        <a
          href={KAKAO_URL}
          onClick={() => trackContact("floating_kakao")}
          aria-label="카카오톡으로 무료 상담"
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#FEE500] shadow-xl shadow-black/15 hover:scale-105 transition-transform"
        >
          <KaTalkIcon className="w-7 h-7 text-[#3C1E1E]" />
        </a>
      </div>
      <a
        href={KAKAO_URL}
        onClick={() => trackContact("floating_kakao_m")}
        aria-label="카카오톡으로 무료 상담"
        className="sm:hidden pointer-events-auto inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#FEE500] shadow-xl shadow-black/15"
      >
        <KaTalkIcon className="w-6 h-6 text-[#3C1E1E]" />
      </a>

      {/* 전화 — 모바일/PC 통일: 번호 알약 + 동그라미 */}
      <div className="pointer-events-auto flex items-center gap-2">
        <a
          href={`tel:${PHONE}`}
          onClick={() => trackContact("floating_phone")}
          className="inline-flex items-center h-10 sm:h-11 px-3 sm:px-4 rounded-full bg-[#1FBA5F] shadow-lg shadow-[#1FBA5F]/25 text-[12.5px] sm:text-sm font-bold text-white"
        >
          {PHONE}
        </a>
        <a
          href={`tel:${PHONE}`}
          onClick={() => trackContact("floating_phone_icon")}
          aria-label="전화 상담"
          className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#1FBA5F] shadow-xl shadow-[#1FBA5F]/30 hover:bg-[#17a352] transition-colors"
        >
          <PhoneIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer
      className="bg-[color:var(--ink-dark)] text-white/70"
      style={{
        paddingBottom:
          "calc(env(safe-area-inset-bottom, 0px) + var(--sticky-cta-h, 0px))",
      }}
    >
      <div className="mx-auto max-w-[1080px] px-5 py-12 sm:py-16">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-8">
          <div className="flex flex-col gap-4">
            <Image
              src={asset("/images/footer_logo.png")}
              alt="커버링 방문수거"
              width={Math.round(32 * LOGO_RATIO)}
              height={32}
            />
            <p className="text-sm leading-relaxed">
              커버링 방문수거는 서울·경기·인천 권역의
              <br />
              대형폐기물 방문수거 서비스를 운영합니다.
            </p>
            <a
              href="https://abr.ge/u7gjoq"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-2 h-11 px-5 rounded-full bg-white text-foreground text-[14px] font-bold ring-1 ring-white/10 shadow-md hover:bg-brand-soft transition-colors"
            >
              <span>커버링 앱 다운로드</span>
              <span aria-hidden>→</span>
            </a>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm">
            <div className="flex flex-col gap-2">
              <span className="text-white font-bold">서비스</span>
              <a href="#apply" className="hover:text-white">
                견적 신청
              </a>
              <a href="#price" className="hover:text-white">
                가격 안내
              </a>
              <a href="#faq" className="hover:text-white">
                FAQ
              </a>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-white font-bold">회사</span>
              <a
                href="https://covering.app"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                회사소개
              </a>
              <a
                href="https://career.covering.app/"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white"
              >
                채용
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-xs leading-relaxed text-white/55">
          <p>
            Covering Co., Ltd. | 사업자등록번호 621-87-01772 | 통신판매업 제 2024-서울중구-1863 호
          </p>
          <p>본사 : 서울 종로구 경희궁길 14 신영빌딩 3층</p>
          <p>고객센터 {PHONE} | support@covering.app</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            <a
              href="https://covering.notion.site/2025-01-10-1665e589dc9f8027bcb1cf230b5f4c85?pvs=4"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              개인정보처리방침
            </a>
            <a
              href="https://covering.notion.site/2025-01-10-1665e589dc9f80d3b12eec6dfb6fb15d?pvs=4"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              서비스 이용약관
            </a>
            <a href="#apply" className="hover:text-white">
              마케팅 정보 수신 동의
            </a>
          </div>
          <p className="mt-4">
            Copyright © 2026 Covering Co., Ltd. | 누구나 처리를 간편하게 All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Home() {
  return (
    <>
      <NoticeBar />
      <TopBar />
      <main className="flex-1 bg-[color:var(--ink-dark)]">
        <Hero />
        <LeadForm />
        <TrustTriple />
        <CompareSection />
        <PriceGuide />
        <Steps />
        <LeadForm id="apply-2" />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <FloatingCta />
      <StickyMobileCta />
    </>
  );
}
