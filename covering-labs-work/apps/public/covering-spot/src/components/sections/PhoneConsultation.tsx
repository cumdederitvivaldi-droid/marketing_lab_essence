"use client";

import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { CTALink } from "@/components/ui/CTALink";
import { KakaoIcon } from "@/components/ui/KakaoIcon";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { track } from "@/lib/analytics";
import { COVERING_INBOUND_LEAD_URL } from "@/lib/constants";
import { formatPhone } from "@/lib/format";

// 백엔드 응답 timeout — 이 시간 초과 시 fetch abort 후 "일시적 오류" 메시지로 복구.
// 너무 짧으면 모바일 느린 회선에서 오탐, 너무 길면 무한 로딩 UX.
const SUBMIT_TIMEOUT_MS = 10_000;

type Status = "idle" | "submitting" | "success" | "error";

// window.fbq / window.wcs 는 CTALink.tsx 에서 declare global 로 정의됨 (import 로 머지).

export function PhoneConsultation() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [itemsNote, setItemsNote] = useState("");
  const [customerMemo, setCustomerMemo] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const phoneDigits = phone.replace(/\D/g, "");
    return (
      name.trim().length > 0 &&
      phoneDigits.length >= 9 &&
      address.trim().length > 0
    );
  }, [name, phone, address]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || status === "submitting") return;

    const eventProps = {
      hasItemsNote: itemsNote.trim().length > 0,
      hasMemo: customerMemo.trim().length > 0,
    };

    const phoneDigits = phone.replace(/\D/g, "");
    // 같은 phone 5초 내 재전송 차단 — 더블 클릭/실수 방지 (서버는 upsert 라서 데이터 손상은 없음).
    try {
      const key = `spot_phone_submit_${phoneDigits}`;
      const last = sessionStorage.getItem(key);
      if (last && Date.now() - Number(last) < 5_000) {
        setErrorMessage("방금 신청하셨어요. 잠시 후 다시 시도해 주세요.");
        setStatus("error");
        return;
      }
      sessionStorage.setItem(key, String(Date.now()));
    } catch { /* sessionStorage 차단 환경 무시 */ }

    setStatus("submitting");
    setErrorMessage(null);
    track("[CLICK] SpotHomeScreen_phoneSubmit", eventProps);

    // 타임아웃 — 응답이 SUBMIT_TIMEOUT_MS 이상 지연되면 abort 해서 로딩 상태 무한 유지를 방지.
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);

    try {
      // 백엔드(covering-spot-chatbot)가 Origin allowlist 로 인증 — 키/env 불필요.
      const res = await fetch(COVERING_INBOUND_LEAD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          itemsNote: itemsNote.trim() || undefined,
          customerMemo: customerMemo.trim() || undefined,
        }),
      });
      window.clearTimeout(timeoutId);

      if (!res.ok) {
        // 사용자에게는 일반 메시지, 콘솔에 상세 로그.
        const detail = await res.json().catch(() => null);
        console.error("[PhoneConsultation] submit failed", res.status, detail);
        if (res.status === 400) {
          setErrorMessage("입력 정보를 다시 확인해 주세요.");
        } else if (res.status === 401 || res.status === 403) {
          // 정상 운영 시 발생하면 안 됨 (origin allowlist 누락). 사용자에겐 일반 메시지.
          setErrorMessage("일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        } else {
          setErrorMessage("일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
        }
        setStatus("error");
        return;
      }

      // 메타 표준 'Contact' (CTALink 와 동일 컨벤션) + Naver CTS lead
      track("[EVENT] SpotPhoneLeadSubmit", eventProps);
      try {
        window.fbq?.("track", "Contact", { location: "phone_form" });
      } catch { /* fbq 미로드/차단 환경 무시 */ }
      try {
        window.wcs?.trans({ type: "lead" });
      } catch { /* Naver CTS 미로드/차단 환경 무시 */ }

      setStatus("success");
    } catch (err) {
      window.clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      console.error("[PhoneConsultation]", isAbort ? "timeout" : "network error", err);
      setErrorMessage(
        isAbort
          ? "응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요."
          : "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      );
      setStatus("error");
    }
  };

  return (
    <section
      id="phone-consultation"
      className="py-[120px] bg-bg-warm2 max-md:py-20"
    >
      <div className="max-w-[760px] mx-auto px-5">
        <ScrollReveal>
          <SectionHeader
            tag="전화 상담 신청"
            title={"전화로 편하게\n상담받아 보세요"}
            desc="이름·전화·주소만 남겨주시면 담당자가 직접 연락드려요. 카톡이 부담스러운 분도 OK."
            center
          />
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          {status === "success" ? (
            <SuccessCard name={name} />
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-border rounded-2xl p-8 max-md:p-6 shadow-[0_4px_24px_rgba(15,23,42,0.04)]"
            >
              {errorMessage && (
                <div
                  role="alert"
                  className="mb-5 rounded-md border border-semantic-red/30 bg-semantic-red/[0.06] px-4 py-3 text-sm text-semantic-red"
                >
                  {errorMessage}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <TextField
                  label="이름"
                  required
                  size="lg"
                  placeholder="홍길동"
                  autoComplete="name"
                  value={name}
                  maxLength={20}
                  disabled={status === "submitting"}
                  onChange={(e) => setName(e.target.value)}
                />
                <TextField
                  label="전화번호"
                  required
                  size="lg"
                  type="tel"
                  inputMode="numeric"
                  placeholder="010-1234-5678"
                  autoComplete="tel"
                  value={phone}
                  disabled={status === "submitting"}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                />
              </div>

              <div className="mt-4">
                <TextField
                  label="주소"
                  required
                  size="lg"
                  placeholder="서울시 광진구 OO로 12, 101동 1001호"
                  autoComplete="street-address"
                  value={address}
                  maxLength={120}
                  disabled={status === "submitting"}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="mt-4">
                <TextField
                  label="수거 품목 (선택)"
                  size="lg"
                  placeholder="옷장 2개, 침대 1개"
                  value={itemsNote}
                  maxLength={120}
                  disabled={status === "submitting"}
                  onChange={(e) => setItemsNote(e.target.value)}
                />
              </div>

              <div className="mt-4">
                <TextArea
                  label="요청 사항 (선택)"
                  rows={3}
                  placeholder="예: 토요일 오전 가능, 엘리베이터 없음"
                  value={customerMemo}
                  maxLength={300}
                  disabled={status === "submitting"}
                  onChange={(e) => setCustomerMemo(e.target.value)}
                />
              </div>

              <div className="mt-6">
                <Button
                  type="submit"
                  size="lg"
                  variant="primary"
                  fullWidth
                  loading={status === "submitting"}
                  disabled={!canSubmit}
                >
                  {status === "submitting" ? "신청 중..." : "전화 상담 신청하기"}
                </Button>
                <CTALink
                  location="consult"
                  className="mt-2.5 flex w-full items-center justify-center gap-2 bg-kakao text-text-primary text-base font-semibold h-[50px] rounded-md hover:bg-kakao-hover active:scale-[0.98] transition-all"
                >
                  <KakaoIcon />
                  <span>카톡으로 5분만에 견적받기</span>
                </CTALink>
                <p className="mt-3 text-center text-xs text-text-muted leading-relaxed">
                  입력하신 정보는 상담 목적으로만 사용되며, 영업시간 내 빠르게 연락드려요.
                </p>
              </div>
            </form>
          )}
        </ScrollReveal>
      </div>
    </section>
  );
}

function SuccessCard({ name }: { name: string }) {
  const displayName = name.trim() || "고객";
  return (
    <div className="bg-white border border-border rounded-2xl p-8 max-md:p-6 text-center shadow-[0_4px_24px_rgba(15,23,42,0.04)]">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-brand-400"
          />
        </svg>
      </div>
      <h3 className="text-[22px] font-extrabold tracking-[-0.5px] text-text-primary">
        {displayName}님, 상담 신청이 접수됐어요
      </h3>
      <p className="mt-3 text-[15px] text-text-sub leading-relaxed">
        영업시간 내 담당자가 입력하신 번호로 직접 연락드릴게요.
        <br />
        지금 바로 문의가 필요하시면 카카오톡으로도 가능해요.
      </p>
      <div className="mt-6">
        <CTALink
          location="after_consult"
          className="inline-flex items-center gap-2 bg-kakao text-text-primary text-[15px] font-bold py-3 px-5 rounded-lg hover:bg-kakao-hover transition-all duration-200"
        >
          <KakaoIcon />
          <span>카카오톡으로 추가 문의</span>
        </CTALink>
      </div>
    </div>
  );
}
