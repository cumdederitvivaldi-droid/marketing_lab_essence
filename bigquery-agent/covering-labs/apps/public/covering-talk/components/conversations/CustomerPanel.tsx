"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { Conversation, ConversationStatus, STATUS_LABELS } from "@/lib/store/conversations";
import { Phase, PHASE_LABELS, CollectedInfo } from "@/lib/ai/phases";
import { toast } from "sonner";
import { Check, X, Pencil, RotateCcw, Trash2, UserCheck, CalendarCheck, CreditCard, Edit3, Loader2, Calendar, ClipboardCopy, ChevronDown, ClipboardList, Calculator, ChevronUp } from "lucide-react";
import { Order, OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/store/orders";
import { QuoteEditor } from "./QuoteEditor";
import PaymentModal from "@/components/PaymentModal";
import LadderPrepaymentModal from "@/components/conversations/LadderPrepaymentModal";
import { getRegionPrices } from "@/lib/utils/trip-fee";
import { SchedulePreview, ScheduleSummaryBadge, AbcAvailabilityCards, type ScheduleData, type AbcData } from "./SchedulePreview";

const ALL_PHASES: Phase[] = [
  Phase.PHASE_1_INITIAL, Phase.PHASE_2_COLLECT, Phase.PHASE_3_SPEC,
  Phase.PHASE_3_1_MODIFY, Phase.PHASE_4_QUOTE, Phase.PHASE_5_NUDGE,
  Phase.PHASE_6_BOOKING, Phase.PHASE_7_CONFIRM, Phase.PHASE_8_POST,
  Phase.CLOSED,
];

interface Props {
  conv: Conversation;
  onRefresh: () => void;
  onDelete?: () => void;
}

const ALL_STATUSES: ConversationStatus[] = [
  "pending", "quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent",
  "wrong_inbound", "night_pickup", "booked", "cancelled",
  "needs_check", "no_response", "completed", "payment_check"
];

const ORDER_STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  confirmed: { label: "일정확정", bg: "var(--app-tag-green-bg)", text: "var(--app-tag-green-text)" },
  payment_requested: { label: "결제요청", bg: "var(--app-tag-purple-bg)", text: "var(--app-tag-purple-text)" },
  prepaid: { label: "선결제완료", bg: "#FCE7F3", text: "#BE185D" },
  completed: { label: "완료", bg: "var(--app-tag-teal-bg)", text: "var(--app-tag-teal-text)" },
  cancelled: { label: "취소", bg: "var(--app-btn-danger-bg)", text: "var(--app-btn-danger-text)" },
};

const PHASE_SHORT_LABELS: Record<string, string> = {
  [Phase.PHASE_1_INITIAL]: "P1",
  [Phase.PHASE_2_COLLECT]: "P2",
  [Phase.PHASE_3_SPEC]: "P3",
  [Phase.PHASE_3_1_MODIFY]: "P3.1",
  [Phase.PHASE_4_QUOTE]: "P4",
  [Phase.PHASE_5_NUDGE]: "P5",
  [Phase.PHASE_6_BOOKING]: "P6",
  [Phase.PHASE_7_CONFIRM]: "P7",
  [Phase.PHASE_8_POST]: "P8",
  [Phase.CLOSED]: "END",
};

const PHASE_PILL_COLORS: Record<string, { bg: string; text: string }> = {
  [Phase.PHASE_1_INITIAL]: { bg: "#E8F4FD", text: "#1976D2" },
  [Phase.PHASE_2_COLLECT]: { bg: "#FFF3E0", text: "#E65100" },
  [Phase.PHASE_3_SPEC]: { bg: "#FFF3E0", text: "#E65100" },
  [Phase.PHASE_3_1_MODIFY]: { bg: "#FFF8E1", text: "#F57F17" },
  [Phase.PHASE_4_QUOTE]: { bg: "#E8F5E9", text: "#2E7D32" },
  [Phase.PHASE_5_NUDGE]: { bg: "#F3E5F5", text: "#7B1FA2" },
  [Phase.PHASE_6_BOOKING]: { bg: "#E0F2F1", text: "#00695C" },
  [Phase.PHASE_7_CONFIRM]: { bg: "#E0F2F1", text: "#00695C" },
  [Phase.PHASE_8_POST]: { bg: "#ECEFF1", text: "#455A64" },
  [Phase.CLOSED]: { bg: "#F5F5F5", text: "#9E9E9E" },
};

// pill 드롭다운용: 너무 긴 것만 축약, 나머지는 원본 그대로
const STATUS_SHORT_LABELS: Record<string, string> = {
  quote_sent_nudge: "견적완료(넛지)",
  quote_sent_no_nudge: "견적완료",
  payment_check: "결제확인",
};

const STATUS_PILL_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "var(--app-tag-orange-bg)", text: "var(--app-tag-orange-text)" },
  quote_sent_nudge: { bg: "#E8F5E9", text: "#2E7D32" },
  quote_sent_no_nudge: { bg: "#E8F5E9", text: "#2E7D32" },
  nudge_sent: { bg: "#F3E5F5", text: "#7B1FA2" },
  wrong_inbound: { bg: "#ECEFF1", text: "#455A64" },
  night_pickup: { bg: "#EDE7F6", text: "#4527A0" },
  booked: { bg: "var(--app-tag-blue-bg)", text: "var(--app-accent)" },
  cancelled: { bg: "var(--app-btn-danger-bg)", text: "var(--app-btn-danger-text)" },
  needs_check: { bg: "var(--app-tag-yellow-bg)", text: "var(--app-tag-yellow-text)" },
  no_response: { bg: "#ECEFF1", text: "#455A64" },
  completed: { bg: "var(--app-tag-teal-bg)", text: "var(--app-tag-teal-text)" },
  payment_check: { bg: "var(--app-tag-purple-bg)", text: "var(--app-tag-purple-text)" },
};

/** 단일 24시간 → 오전/오후: "14:00" → "오후 2:00" */
function formatSingleTime(t: string): string {
  const match = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return t;
  const h = parseInt(match[1], 10);
  const m = match[2];
  if (h === 0) return `오전 12:${m}`;
  if (h < 12) return `오전 ${h}:${m}`;
  if (h === 12) return `오후 12:${m}`;
  return `오후 ${h - 12}:${m}`;
}

/** 시간 포맷: "14:00" → "오후 2:00", "14:00~16:00" → "오후 2:00~4:00" */
function formatTimeSlot(slot: string | null | undefined): string {
  if (!slot) return "미정";
  // 범위 형식: "14:00~16:00"
  const rangeMatch = slot.match(/^(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})$/);
  if (rangeMatch) {
    return `${formatSingleTime(rangeMatch[1])} ~ ${formatSingleTime(rangeMatch[2])}`;
  }
  // 이미 한글 범위: "오후 2:00~4:00" 등
  if (slot.includes("~") && /오[전후]/.test(slot)) return slot;
  // 단일 시간
  return formatSingleTime(slot);
}

/** 전화번호에 대시 추가: 01012345678 → 010-1234-5678 */
function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "미등록";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return raw; // 이미 포맷된 경우 그대로
}

/** referrer 텍스트("이전 페이지: <url>" 등) → 도메인 + path 위주 표시. 길면 끝 자르기. */
function formatReferrer(raw: string | null | undefined): string {
  if (!raw) return "—";
  const urlMatch = raw.match(/https?:\/\/[^\s]+/);
  if (urlMatch) {
    try {
      const u = new URL(urlMatch[0]);
      const tail = u.pathname === "/" ? "" : u.pathname.length > 30 ? u.pathname.slice(0, 30) + "…" : u.pathname;
      return u.host + tail;
    } catch {
      return urlMatch[0].slice(0, 60);
    }
  }
  return raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
}

const editLabelStyle: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 };
const editInputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", backgroundColor: "var(--app-surface)" };

export function CustomerPanel({ conv, onRefresh, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<"info" | "quote" | "booking">("info");
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ info: 0, quote: 0, booking: 0 });
  const [showDebug, setShowDebug] = useState(false);
  const [districtOverride, setDistrictOverride] = useState<string | null>(null);
  const [isEditingDistrict, setIsEditingDistrict] = useState(false);
  const [districtInput, setDistrictInput] = useState("");
  const effectiveDistrict = districtOverride ?? conv.collectedInfo?.district ?? null;

  const handleTabChange = (tab: "info" | "quote" | "booking") => {
    if (scrollRef.current) scrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    setActiveTab(tab);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollPositions.current[tab];
    });
  };

  const [memo, setMemo] = useState(conv.memo ?? "");
  const [isSavingMemo, startMemo] = useTransition();
  const [isChangingStatus, startStatus] = useTransition();
  const [isResetting, startReset] = useTransition();
  const [isChangingPhase, startPhase] = useTransition();

  // 고객명 편집
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(conv.name ?? "");
  const [isSavingName, startName] = useTransition();

  // 전화번호 편집
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(conv.phone ?? "");
  const [isSavingPhone, startPhone] = useTransition();

  // 브랜드메시지 캠페인 매칭 (phone → 최근 14일 내 발송된 캠페인)
  const [campaignBadge, setCampaignBadge] = useState<{
    campaign_id: string; campaign_label: string; group_tag: string | null; sent_at: string;
  } | null>(null);
  useEffect(() => {
    const phone = (conv.phone ?? "").replace(/[\s\-()]/g, "");
    if (!phone) { setCampaignBadge(null); return; }
    let cancelled = false;
    fetch(`/api/lab/brand-message/lookup-by-phone?phone=${encodeURIComponent(phone)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled && d?.found) setCampaignBadge(d.campaign); else if (!cancelled) setCampaignBadge(null); })
      .catch(() => { if (!cancelled) setCampaignBadge(null); });
    return () => { cancelled = true; };
  }, [conv.phone]);

  // 예약관리
  const [linkedBooking, setLinkedBooking] = useState<Order | null>(null);
  const [activeBookings, setActiveBookings] = useState<Order[]>([]);
  const [pastBookings, setPastBookings] = useState<Order[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null); // 수정 대상 (활성/지난 모두)
  const [showPastBookings, setShowPastBookings] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [showBookingEdit, setShowBookingEdit] = useState(false);
  const [bookingEditForm, setBookingEditForm] = useState({
    customerName: "", phone: "", address: "",
    date: "", timeSlot: "",
    timeAmPm: "오후", timeHour: "", timeMinute: "00", timeEndAmPm: "오후", timeEndHour: "", timeEndMinute: "00",
    crewSize: "1",
    hasElevator: false, hasParking: false, hasGroundAccess: true, needLadder: false,
    totalPrice: "",
    status: "confirmed" as string,
    items: [] as { category: string; name: string; price: number; quantity: number }[],
    memo: "",
  });
  const [bookingSaving, setBookingSaving] = useState(false);

  // ── 모달 드래그 ──
  const [modalPos, setModalPos] = useState({ x: -1, y: -1 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const onDragStart = (e: React.MouseEvent) => {
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setModalPos({ x: dragRef.current.origX + ev.clientX - dragRef.current.startX, y: dragRef.current.origY + ev.clientY - dragRef.current.startY });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const resetModalPos = () => setModalPos({ x: -1, y: -1 });

  // 수정 모달 닫힐 때 editingOrder 초기화
  useEffect(() => {
    if (!showBookingEdit) setEditingOrder(null);
  }, [showBookingEdit]);

  // 수동 예약 등록
  const [showCreateBooking, setShowCreateBooking] = useState(false);
  const [createBookingForm, setCreateBookingForm] = useState({
    customerName: "", date: "", timeAmPm: "오후", timeHour: "", timeMinute: "00",
    timeEndAmPm: "오후", timeEndHour: "", timeEndMinute: "00",
    address: "", customerPhone: "", items: "", amount: "",
  });
  const [creatingBooking, setCreatingBooking] = useState(false);

  // 결제 모달
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLadderModal, setShowLadderModal] = useState(false);

  // 일정 현황 모달
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [abcData, setAbcData] = useState<AbcData | null>(null);

  // 상담사 목록 + 배정 변경
  const [counselors, setCounselors] = useState<string[]>([]);
  const [isChangingAssignee, startAssignee] = useTransition();

  const fetchCounselors = useCallback(async () => {
    try {
      const res = await fetch("/api/counselors");
      const data = await res.json();
      setCounselors((data.counselors ?? []).map((c: { name: string }) => c.name));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCounselors(); }, [fetchCounselors]);

  // 예약 조회
  const PAST_STATUSES = ["completed", "cancelled"];
  const fetchBooking = useCallback(async () => {
    setBookingLoading(true);
    try {
      const res = await fetch(`/api/orders?sessionId=${conv.sessionId}`);
      const data = await res.json();
      const all: Order[] = data.orders ?? [];
      const active = all.filter((b) => !PAST_STATUSES.includes(b.status));
      const past = all.filter((b) => PAST_STATUSES.includes(b.status));
      setLinkedBooking(active[0] ?? null);
      setActiveBookings(active);
      setPastBookings(past);
    } catch { /* ignore */ }
    setBookingLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.sessionId]);

  useEffect(() => { fetchBooking(); }, [fetchBooking]);

  // 대화 업데이트 시 예약 정보도 새로고침 (메시지 전송 후 예약 생성 감지)
  // 단, 예약 수정 폼이 열려있으면 스킵 (폼 상태 초기화 방지)
  useEffect(() => {
    if (!showBookingEdit) fetchBooking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.updatedAt, conv.status]);

  // 일정 현황 fetch (기존 /api/schedule + ABC 블록 집계 병렬)
  const fetchSchedule = useCallback(async (date: string) => {
    setScheduleLoading(true);
    try {
      const [schedRes, abcRes] = await Promise.all([
        fetch(`/api/schedule?date=${date}`),
        fetch(`/api/schedule/abc?date=${date}`),
      ]);
      if (schedRes.ok) setScheduleData(await schedRes.json());
      if (abcRes.ok) {
        const abc = await abcRes.json();
        setAbcData({ date: abc.date, blocks: abc.blocks });
      } else {
        setAbcData(null);
      }
    } catch { /* ignore */ }
    setScheduleLoading(false);
  }, []);

  useEffect(() => {
    if (scheduleDate) fetchSchedule(scheduleDate);
  }, [scheduleDate, fetchSchedule]);

  // 수동 예약 등록 열기 (대화에서 수집된 정보 자동 채움)
  const openCreateBooking = () => {
    const ci = conv.collectedInfo;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ciAny = ci as any;

    // ── 시간 파싱 (다양한 포맷 대응) ──
    let amPm = "오후", hour = "", minute = "00", endAmPm = "오후", endHour = "", endMinute = "00";
    let timeStr = conv.booking?.preferredTime ?? "";

    // booking 데이터가 없으면 대화 메시지에서 시간 추출 시도
    if (!timeStr && conv.messages) {
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        const msg = conv.messages[i];
        if (msg.role === "assistant" || msg.role === "user") {
          const m = msg.content.match(/(오전|오후)\s*(\d{1,2})\s*[시:]\s*(?:(\d{1,2})\s*분?)?\s*[~\-]\s*(?:오전|오후)?\s*(\d{1,2})\s*[시:]/);
          if (m) { timeStr = msg.content; break; }
          const m2 = msg.content.match(/(오전|오후)\s*(\d{1,2})\s*[시:]/);
          if (m2) { timeStr = msg.content; break; }
        }
      }
    }

    // "오후 2:00~오후 4:00" 또는 "오후 2시~3시" 또는 "오후2:00" 등
    const startMatch = timeStr.match(/(오전|오후)\s*(\d{1,2})\s*[시:]?\s*(\d{1,2})?/);
    if (startMatch) {
      amPm = startMatch[1];
      hour = startMatch[2];
      minute = startMatch[3] || "00";
    }
    const endRangeMatch = timeStr.match(/[~\-]\s*(오전|오후)?\s*(\d{1,2})\s*[시:]?\s*(\d{1,2})?/);
    if (endRangeMatch) {
      endAmPm = endRangeMatch[1] || amPm; // 오전/오후 없으면 시작시간과 동일
      endHour = endRangeMatch[2];
      endMinute = endRangeMatch[3] || "00";
    }

    // ── 날짜 파싱 (booking 없으면 메시지에서 추출) ──
    let dateStr = conv.booking?.preferredDate ?? "";
    if (!dateStr && conv.messages) {
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        const msg = conv.messages[i];
        const dm = msg.content.match(/(\d{1,2})월\s*(\d{1,2})일/);
        if (dm) {
          const year = new Date().getFullYear();
          dateStr = `${year}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
          break;
        }
      }
    }

    // ── 품목 텍스트 생성 (collectedInfo.items → _prevQuoteSummary → quote items) ──
    let itemsText = "";
    if (ci?.items && ci.items.length > 0) {
      itemsText = ci.items.map((item) =>
        `${item.category}${item.spec ? `(${item.spec})` : ""} ${item.quantity}개`
      ).join(", ");
    } else if (ciAny?._prevQuoteSummary?.items?.length > 0) {
      itemsText = ciAny._prevQuoteSummary.items.join(", ");
    } else if (conv.quote?.items && conv.quote.items.length > 0) {
      itemsText = conv.quote.items.map((it: { category: string; spec?: string; quantity: number }) =>
        `${it.category}${it.spec ? `(${it.spec})` : ""} ${it.quantity}개`
      ).join(", ");
    }

    // ── 금액 (quote → _prevQuoteSummary) ──
    const amount = conv.quote?.totalPrice?.toString()
      ?? ciAny?._prevQuoteSummary?.totalPrice?.toString()
      ?? "";

    setCreateBookingForm({
      customerName: conv.name ?? "",
      date: dateStr,
      timeAmPm: amPm,
      timeHour: hour,
      timeMinute: minute,
      timeEndAmPm: endAmPm,
      timeEndHour: endHour,
      timeEndMinute: endMinute,
      address: ci?.address ?? "",
      customerPhone: conv.phone ?? "",
      items: itemsText,
      amount,
    });
    setShowCreateBooking(true);
    if (dateStr) {
      setScheduleDate(dateStr);
      fetchSchedule(dateStr);
    } else {
      fetchSchedule(scheduleDate);
    }
  };

  const handleCreateBooking = async () => {
    const f = createBookingForm;
    if (!f.customerName || !f.date || !f.address) {
      toast.error("고객 성함, 날짜, 수거주소는 필수입니다");
      return;
    }
    // 과거 날짜 차단
    {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(`${f.date}T00:00:00`);
      if (target < today) {
        toast.error("과거 날짜로는 예약할 수 없습니다. 날짜를 확인해 주세요.", { duration: 5000 });
        return;
      }
    }
    setCreatingBooking(true);
    try {
      let formattedTime = "";
      if (f.timeHour) {
        formattedTime = `${f.timeAmPm} ${f.timeHour}:${f.timeMinute || "00"}`;
        if (f.timeEndHour) {
          formattedTime += `~${f.timeEndAmPm} ${f.timeEndHour}:${f.timeEndMinute || "00"}`;
        }
      }

      // orders 테이블에 생성
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: f.customerName,
          phone: f.customerPhone,
          address: f.address,
          date: f.date,
          timeSlot: formattedTime,
          sessionId: conv.sessionId,
          items: conv.collectedInfo?.items?.map((item) => ({
            category: item.category ?? "기타",
            name: item.spec ?? item.category ?? "",
            displayName: item.spec ?? item.category ?? "",
            price: 0,
            quantity: item.quantity ?? 1,
          })) ?? [],
          totalPrice: parseInt(f.amount) || 0,
          hasElevator: conv.collectedInfo?.elevator ?? false,
          hasParking: conv.collectedInfo?.parking ?? false,
          memo: f.items,
          status: "confirmed",
        }),
      });
      if (!res.ok) throw new Error("등록 실패");

      // 대화 상태도 booked로 변경
      try {
        await fetch(`/api/conversations/${conv.sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "booked" }),
        });
      } catch { /* 대화 상태 변경 실패해도 예약은 성공 */ }
      toast.success("예약이 등록되었습니다.");
      setShowCreateBooking(false);
      setCreateBookingForm({
        customerName: "", date: "", timeAmPm: "오후", timeHour: "", timeMinute: "00",
        timeEndAmPm: "오후", timeEndHour: "", timeEndMinute: "00",
        address: "", customerPhone: "", items: "", amount: "",
      });
      fetchBooking();
      onRefresh();
    } catch {
      toast.error("등록 실패");
    }
    setCreatingBooking(false);
  };

  const openBookingEdit = (b: Order) => {
    // 품목 -> 구조화된 배열
    const itemsArr = (b.items ?? []).map((it) => ({
      category: it.category ?? "기타",
      name: it.displayName || it.name || "",
      price: it.price ?? 0,
      quantity: it.quantity ?? 1,
    }));

    // 시간 파싱
    const ts = b.timeSlot ?? "";
    let tAmPm = "오후", tHour = "", tMin = "00", tEndAmPm = "오후", tEndHour = "", tEndMin = "00";
    const korM = ts.match(/(오전|오후)\s*(\d{1,2}):?(\d{0,2})/);
    if (korM) {
      tAmPm = korM[1]; tHour = korM[2]; tMin = korM[3] || "00";
      // 종료시간: "~오후 3:00" 또는 "~3:00"
      const endM = ts.match(/[~\-]\s*(오전|오후)?\s*(\d{1,2}):?(\d{0,2})/);
      if (endM) {
        tEndAmPm = endM[1] || tAmPm; // 오전/오후 없으면 시작시간과 동일
        tEndHour = endM[2]; tEndMin = endM[3] || "00";
      }
    } else {
      const h24M = ts.match(/(\d{1,2}):(\d{2})/);
      if (h24M) {
        const h = parseInt(h24M[1]);
        tMin = h24M[2];
        tAmPm = h >= 12 ? "오후" : "오전";
        tHour = (h > 12 ? h - 12 : h === 0 ? 12 : h).toString();
        const endM = ts.match(/[~\-]\s*(\d{1,2}):(\d{2})/);
        if (endM) {
          const eh = parseInt(endM[1]);
          tEndMin = endM[2];
          tEndAmPm = eh >= 12 ? "오후" : "오전";
          tEndHour = (eh > 12 ? eh - 12 : eh === 0 ? 12 : eh).toString();
        }
      }
    }

    setBookingEditForm({
      customerName: b.customerName ?? "",
      phone: b.phone ?? "",
      address: b.address ?? "",
      date: b.date ?? "",
      timeSlot: ts,
      timeAmPm: tAmPm, timeHour: tHour, timeMinute: tMin, timeEndAmPm: tEndAmPm, timeEndHour: tEndHour, timeEndMinute: tEndMin,
      crewSize: (b.crewSize ?? 1).toString(),
      hasElevator: b.hasElevator ?? false,
      hasParking: b.hasParking ?? false,
      hasGroundAccess: b.hasGroundAccess ?? true,
      needLadder: b.needLadder ?? false,
      totalPrice: b.totalPrice?.toString() ?? "",
      status: b.status ?? "confirmed",
      items: itemsArr,
      memo: b.memo ?? "",
    });
    setEditingOrder(b);
    if (b.date) {
      setScheduleDate(b.date);
      fetchSchedule(b.date);
    }
    setShowBookingEdit(true);
  };

  const handleBookingSave = async () => {
    if (!editingOrder) return;
    setBookingSaving(true);

    const f = bookingEditForm;
    const orderItems = f.items.map((it) => ({
      category: it.category,
      name: it.name,
      displayName: it.name,
      price: it.price,
      quantity: it.quantity,
    }));

    // 시간 포맷팅
    let formattedTime = f.timeSlot;
    if (f.timeHour) {
      formattedTime = `${f.timeAmPm} ${f.timeHour}:${f.timeMinute || "00"}`;
      if (f.timeEndHour) formattedTime += `~${f.timeEndAmPm} ${f.timeEndHour}:${f.timeEndMinute || "00"}`;
    }

    const payload = {
      customerName: f.customerName,
      phone: f.phone,
      address: f.address,
      date: f.date,
      timeSlot: formattedTime,
      crewSize: parseInt(f.crewSize) || 1,
      hasElevator: f.hasElevator,
      hasParking: f.hasParking,
      hasGroundAccess: f.hasGroundAccess,
      needLadder: f.needLadder,
      totalPrice: f.totalPrice ? Number(f.totalPrice) : 0,
      status: f.status,
      items: orderItems,
      memo: f.memo,
    };

    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("예약 정보가 수정되었습니다.");
        setShowBookingEdit(false);
        fetchBooking();
      } else {
        toast.error("수정 실패");
      }
    } catch {
      toast.error("수정 요청 오류");
    }
    setBookingSaving(false);
  };

  const handleBookingCancel = async () => {
    if (!linkedBooking) return;
    if (!confirm("이 예약을 취소하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/orders/${linkedBooking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        toast.success("예약이 취소되었습니다.");
        fetchBooking();
      } else {
        toast.error("취소에 실패했습니다.");
      }
    } catch {
      toast.error("취소 요청 오류");
    }
  };

  const handleBookingDestroy = async () => {
    if (!linkedBooking) return;
    if (!confirm("이 예약을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
    try {
      const res = await fetch(`/api/orders/${linkedBooking.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("예약이 삭제되었습니다.");
        setLinkedBooking(null);
      } else {
        toast.error("삭제에 실패했습니다.");
      }
    } catch {
      toast.error("삭제 요청 오류");
    }
  };

  const handleAssigneeChange = (name: string) => {
    startAssignee(async () => {
      await fetch(`/api/conversations/${conv.sessionId}/assignee`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: name || null }),
      });
      onRefresh();
    });
  };

  // 세션 변경 시 메모 초기화
  useEffect(() => {
    setMemo(conv.memo ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.sessionId]);

  // 같은 세션 내 메모 업데이트 (서버에서 갱신 시)
  useEffect(() => {
    if (conv.memo !== undefined) setMemo(conv.memo ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.memo]);

  useEffect(() => { setNameInput(conv.name ?? ""); }, [conv.name]);
  useEffect(() => { setPhoneInput(conv.phone ?? ""); }, [conv.phone]);

  const handlePhaseChange = (phase: Phase) => {
    startPhase(async () => {
      await fetch(`/api/conversations/${conv.sessionId}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, reason: "상담사 수동 변경" }),
      });
      onRefresh();
    });
  };

  const handleStatusChange = (status: ConversationStatus) => {
    startStatus(async () => {
      await fetch(`/api/conversations/${conv.sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    });
  };

  const handlePhoneTag = (action: "request" | "complete" | "clear") => {
    const labels = { request: "전화요청 표시", complete: "전화상담완료 처리", clear: "전화요청 취소" };
    startStatus(async () => {
      const res = await fetch(`/api/conversations/${conv.sessionId}/phone-tag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast.success(`${labels[action]} 완료`);
        onRefresh();
      } else {
        toast.error("변경 실패");
      }
    });
  };

  const handleSaveMemo = () => {
    startMemo(async () => {
      await fetch(`/api/conversations/${conv.sessionId}/memo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });
      toast.success("메모가 저장되었습니다.");
    });
  };

  const saveField = (field: "name" | "phone", value: string) => {
    const transition = field === "name" ? startName : startPhone;
    transition(async () => {
      await fetch(`/api/conversations/${conv.sessionId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value.trim() }),
      });
      if (field === "name") setIsEditingName(false);
      else setIsEditingPhone(false);
      onRefresh();
    });
  };

  // Tab badge computations
  const lowConfidenceCount = conv.quote?.items?.filter((i: { confidence?: string }) => i.confidence === "low").length ?? 0;
  const medConfidenceCount = conv.quote?.items?.filter((i: { confidence?: string }) => i.confidence === "medium").length ?? 0;

  return (
    <div style={{
      width: 320, flexShrink: 0, backgroundColor: "var(--app-surface)",
      borderLeft: "1px solid var(--app-border)", height: "100%",
      display: "flex", flexDirection: "column",
    }}>
      {/* ===== COMPACT HEADER ===== */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--app-border)", flexShrink: 0 }}>
        {/* Row 1: Name + Phone with labels */}
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {/* Name */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", marginBottom: 2, fontWeight: 600 }}>고객명</div>
            {isEditingName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveField("name", nameInput); if (e.key === "Escape") { setIsEditingName(false); setNameInput(conv.name ?? ""); } }}
                  autoFocus
                  style={{
                    width: "100%", fontSize: 13, padding: "3px 6px",
                    border: "1px solid var(--app-accent)", borderRadius: 4,
                    outline: "none", color: "var(--app-text-primary)", boxSizing: "border-box",
                  }}
                />
                <button onClick={() => saveField("name", nameInput)} disabled={isSavingName} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, flexShrink: 0 }}>
                  <Check style={{ width: 14, height: 14, color: "#20C997" }} />
                </button>
                <button onClick={() => { setIsEditingName(false); setNameInput(conv.name ?? ""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, flexShrink: 0 }}>
                  <X style={{ width: 14, height: 14, color: "#ADB5BD" }} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingName(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 3, cursor: "pointer",
                  fontSize: 14, fontWeight: 600, color: conv.name ? "var(--app-text-primary)" : "var(--app-text-placeholder)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title="클릭하여 고객명 수정"
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{conv.name || "미등록"}</span>
                <Pencil style={{ width: 11, height: 11, color: "var(--app-text-placeholder)", flexShrink: 0 }} />
              </div>
            )}
          </div>
          {/* Phone */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", marginBottom: 2, fontWeight: 600 }}>전화번호</div>
            {isEditingPhone ? (
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <input
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveField("phone", phoneInput); if (e.key === "Escape") { setIsEditingPhone(false); setPhoneInput(conv.phone ?? ""); } }}
                  autoFocus
                  placeholder="010-0000-0000"
                  style={{
                    width: "100%", fontSize: 13, padding: "3px 6px",
                    border: "1px solid var(--app-accent)", borderRadius: 4,
                    outline: "none", color: "var(--app-text-primary)", boxSizing: "border-box",
                  }}
                />
                <button onClick={() => saveField("phone", phoneInput)} disabled={isSavingPhone} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, flexShrink: 0 }}>
                  <Check style={{ width: 14, height: 14, color: "#20C997" }} />
                </button>
                <button onClick={() => { setIsEditingPhone(false); setPhoneInput(conv.phone ?? ""); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, flexShrink: 0 }}>
                  <X style={{ width: 14, height: 14, color: "#ADB5BD" }} />
                </button>
              </div>
            ) : (
              <div
                onClick={() => setIsEditingPhone(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 3, cursor: "pointer",
                  fontSize: 13, color: conv.phone ? "var(--app-text-secondary)" : "var(--app-text-placeholder)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title="클릭하여 전화번호 수정"
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{formatPhone(conv.phone)}</span>
                <Pencil style={{ width: 11, height: 11, color: "var(--app-text-placeholder)", flexShrink: 0 }} />
              </div>
            )}
          </div>
        </div>

        {/* 브랜드메시지 캠페인 배지 — 최근 14일 내 발송된 phone 매칭 시 노출 */}
        {campaignBadge && (
          <div
            title={`${campaignBadge.campaign_label}${campaignBadge.group_tag ? ` (그룹 ${campaignBadge.group_tag})` : ""}\n발송: ${new Date(campaignBadge.sent_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 8px", marginBottom: 8,
              backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)",
              borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: "1px solid var(--app-tag-purple-text)",
            }}
          >
            <span>🎯</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {campaignBadge.campaign_label}
              {campaignBadge.group_tag && <span style={{ marginLeft: 4, opacity: 0.7 }}>({campaignBadge.group_tag})</span>}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 400, opacity: 0.8 }}>
              {Math.floor((Date.now() - new Date(campaignBadge.sent_at).getTime()) / (24 * 60 * 60 * 1000))}일 전
            </span>
          </div>
        )}

        {/* 전화요청 / 전화요청완료 배지 — Phase·Status pill 위에 별도 노출.
            클릭(전화요청 상태일 때) 시 즉시 전화요청완료 마커로 전환 (상태 유지). */}
        <PhoneRequestBadge
          tags={conv.tags ?? []}
          sessionId={conv.sessionId}
          onChanged={onRefresh}
        />


        {/* Row 2: Phase pill + Status pill */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select
            value={conv.currentPhase}
            onChange={(e) => handlePhaseChange(e.target.value as Phase)}
            disabled={isChangingPhase}
            style={{
              flex: 1, padding: "4px 20px 4px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              border: "none", cursor: "pointer",
              backgroundColor: PHASE_PILL_COLORS[conv.currentPhase]?.bg ?? "#F5F5F5",
              color: PHASE_PILL_COLORS[conv.currentPhase]?.text ?? "#666",
              appearance: "none", WebkitAppearance: "none" as never,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center",
              outline: "none", minWidth: 0,
            }}
          >
            {ALL_PHASES.map((p) => (
              <option key={p} value={p}>{PHASE_SHORT_LABELS[p]} {PHASE_LABELS[p]}</option>
            ))}
          </select>
          <select
            value={conv.status}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__phone_request__") return handlePhoneTag("request");
              if (v === "__phone_done__") return handlePhoneTag("complete");
              if (v === "__phone_clear__") return handlePhoneTag("clear");
              handleStatusChange(v as ConversationStatus);
            }}
            disabled={isChangingStatus}
            style={{
              flex: 1, padding: "4px 20px 4px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              border: "none", cursor: "pointer",
              backgroundColor: STATUS_PILL_COLORS[conv.status]?.bg ?? "#F5F5F5",
              color: STATUS_PILL_COLORS[conv.status]?.text ?? "#666",
              appearance: "none", WebkitAppearance: "none" as never,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23999'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center",
              outline: "none", minWidth: 0,
            }}
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_SHORT_LABELS[s] ?? STATUS_LABELS[s]}</option>
            ))}
            {!(conv.tags ?? []).includes("전화요청") && !(conv.tags ?? []).includes("전화요청완료") && (
              <option value="__phone_request__">☎️ 전화요청 표시 (오탐 보정)</option>
            )}
            {!(conv.tags ?? []).includes("전화요청완료") && (
              <option value="__phone_done__">☎️ 전화상담완료 처리</option>
            )}
            {((conv.tags ?? []).includes("전화요청") || (conv.tags ?? []).includes("전화요청완료")) && (
              <option value="__phone_clear__">❌ 전화요청 태그 취소</option>
            )}
          </select>
        </div>

        {/* Row 3: Counselor compact */}
        <select
          value={conv.assignee ?? ""}
          onChange={(e) => handleAssigneeChange(e.target.value)}
          disabled={isChangingAssignee}
          style={{
            width: "100%", padding: "4px 8px", fontSize: 12, borderRadius: 6,
            border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
            color: conv.assignee ? "var(--app-text-primary)" : "var(--app-text-placeholder)",
            outline: "none", cursor: "pointer",
          }}
        >
          <option value="">담당: 미배정</option>
          {counselors.map((name) => (
            <option key={name} value={name}>담당: {name}</option>
          ))}
        </select>

      </div>

      {/* ===== TAB BAR ===== */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--app-border)", flexShrink: 0 }}>
        {([
          { key: "info" as const, label: "정보", icon: <ClipboardList style={{ width: 14, height: 14 }} />, badge: null },
          { key: "quote" as const, label: "견적", icon: <Calculator style={{ width: 14, height: 14 }} />, badge: lowConfidenceCount + medConfidenceCount > 0 ? lowConfidenceCount + medConfidenceCount : null },
          { key: "booking" as const, label: "예약", icon: <CalendarCheck style={{ width: 14, height: 14 }} />, badge: linkedBooking ? "dot" : null },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "10px 0", fontSize: 13, fontWeight: 500, cursor: "pointer",
              backgroundColor: "transparent", border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--app-accent)" : "2px solid transparent",
              color: activeTab === tab.key ? "var(--app-accent)" : "var(--app-text-tertiary)",
              position: "relative",
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== null && tab.badge !== "dot" && (
              <span style={{
                minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#F57C00", color: "#fff",
                fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: "0 4px",
              }}>
                {tab.badge}
              </span>
            )}
            {tab.badge === "dot" && (
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                backgroundColor: linkedBooking?.status === "cancelled" ? "var(--app-btn-danger-text)" : "var(--app-tag-green-text)",
                display: "inline-block",
              }} />
            )}
          </button>
        ))}
      </div>

      {/* ===== SCROLLABLE TAB CONTENT ===== */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>

        {/* ── Tab 1: 정보 ── */}
        <div style={{ display: activeTab === "info" ? "block" : "none" }}>
          {/* 고객 상세 */}
          <Section title="고객 상세">
            <InfoRow label="식별키" value={conv.userKey} />
            <InfoRow label="최근 접속" value={new Date(conv.updatedAt).toLocaleString("ko-KR")} />
            <InfoRow label="유입" value={formatReferrer(conv.referrer)} />
            {(conv.status === "booked" || conv.status === "cancelled") && (
              <div style={{
                marginTop: 8, padding: "8px 10px",
                backgroundColor: conv.status === "cancelled" ? "var(--app-btn-danger-bg)" : "var(--app-tag-purple-bg)", borderRadius: 6,
                fontSize: 13, color: conv.status === "cancelled" ? "var(--app-btn-danger-text)" : "var(--app-tag-purple-text)",
              }}>
                {conv.status === "cancelled"
                  ? `예약취소${linkedBooking ? ` (기존: ${linkedBooking.date} ${formatTimeSlot(linkedBooking.timeSlot)})` : ""}`
                  : linkedBooking
                    ? `예약일: ${linkedBooking.date} ${formatTimeSlot(linkedBooking.timeSlot)}`
                    : "예약 상세 정보 없음"}
              </div>
            )}
          </Section>

          {/* 수집 정보 */}
          <Section title="수집 정보">
            <CollectedInfoPanel info={conv.collectedInfo} />
          </Section>

          {/* 상담 메모 */}
          <Section title="상담 이력">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="상담 메모를 입력하세요..."
              rows={4}
              style={{
                width: "100%", fontSize: 14, color: "var(--app-text-primary)",
                backgroundColor: "var(--app-bg)", borderRadius: 8,
                padding: "10px 12px", border: "1px solid var(--app-border)",
                outline: "none", resize: "vertical", lineHeight: 1.5,
              }}
            />
            <button
              onClick={handleSaveMemo}
              disabled={isSavingMemo}
              style={{
                marginTop: 8, width: "100%", height: 36,
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                borderRadius: 8, border: "none", fontSize: 14, fontWeight: 500,
                cursor: isSavingMemo ? "default" : "pointer",
              }}
            >
              {isSavingMemo ? "저장 중..." : "메모 저장"}
            </button>
          </Section>

          {/* 디버그/삭제 (collapsible) */}
          <div style={{ padding: "12px 20px" }}>
            <button
              onClick={() => setShowDebug(!showDebug)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8,
                border: "1px solid var(--app-border)", cursor: "pointer", fontSize: 12, color: "var(--app-text-tertiary)",
              }}
            >
              <span style={{ fontWeight: 600 }}>디버그 / 관리</span>
              <ChevronUp style={{
                width: 14, height: 14, transition: "transform 0.2s",
                transform: showDebug ? "rotate(0deg)" : "rotate(180deg)",
              }} />
            </button>
            {showDebug && (
              <>
                {conv.phaseHistory && conv.phaseHistory.length > 0 && (
                  <div style={{
                    marginTop: 8, padding: "10px 12px",
                    backgroundColor: "var(--app-bg)", borderRadius: 8,
                    border: "1px solid var(--app-border)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--app-text-tertiary)", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      Phase 이력
                    </div>
                    <PhaseTimeline history={conv.phaseHistory} currentPhase={conv.currentPhase} />
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    const ci = conv.collectedInfo;
                    const q = conv.quote;
                    const b = conv.booking;
                    const msgs = conv.messages ?? [];
                    const recentMsgs = msgs.slice(-20).map((m) => {
                      const time = new Date(m.timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                      const prefix = m.role === "user" ? "고객" : m.role === "assistant" ? (m.sentBy ? `AI(${m.sentBy})` : "AI") : m.role;
                      const img = m.imageUrl ? ` [이미지: ${m.imageUrl}]` : "";
                      return `[${time}] ${prefix}: ${m.content}${img}`;
                    }).join("\n");
                    const debugText = [
                      `=== 디버깅 정보 ===`,
                      `세션: ${conv.sessionId}`,
                      `Phase: ${conv.currentPhase}`,
                      `Status: ${conv.status}`,
                      `이름: ${conv.name ?? "미등록"} | 전화: ${conv.phone ?? "-"}`,
                      `담당: ${conv.assignee ?? "미배정"}`,
                      ``,
                      `--- 수집정보 ---`,
                      `주소: ${ci?.address ?? "미확인"}`,
                      `지역: ${ci?.district ?? "미확인"}`,
                      `층수: ${ci?.floor ?? "미확인"}`,
                      `엘베: ${ci?.elevator ?? "미확인"}`,
                      `주차: ${ci?.parking ?? "미확인"}`,
                      `품목: ${ci?.items?.map((it) => `${it.category}${it.spec ? `(${it.spec})` : ""} x${it.quantity}`).join(", ") || "없음"}`,
                      `특이사항: ${ci?.special_notes?.join(", ") || "없음"}`,
                      `사진: ${msgs.filter((m) => m.imageUrl).length}장`,
                      ``,
                      `--- 견적 ---`,
                      q ? [
                        `품목: ${q.items?.map((it) => `${it.name || it.category} x${it.quantity} = ${(it.unitPrice * it.quantity)?.toLocaleString()}원`).join(", ") || "없음"}`,
                        `기본가: ${q.basePrice?.toLocaleString()}원 | 사다리: ${(q.ladderFee ?? 0).toLocaleString()}원 | 출장비: ${(q.tripFee ?? 0).toLocaleString()}원`,
                        `VAT: ${(q.vatAmount ?? 0).toLocaleString()}원 | 총액: ${q.totalPrice?.toLocaleString()}원`,
                      ].join("\n") : "견적 없음",
                      ``,
                      `--- 예약 ---`,
                      b ? `${b.customerName ?? "-"} | ${b.phone ?? "-"} | ${b.preferredDate ?? "-"} ${b.preferredTime ?? "-"}` : "예약 없음",
                      ``,
                      `--- Phase 이력 ---`,
                      conv.phaseHistory?.map((h) => `${h.from}→${h.to} (${h.reason}) ${new Date(h.timestamp).toLocaleString("ko-KR")}`).join("\n") || "없음",
                      ``,
                      `--- 최근 대화 (${msgs.length}건 중 최근 20건) ---`,
                      recentMsgs,
                      ``,
                      `메모: ${conv.memo || "없음"}`,
                      `생성: ${new Date(conv.createdAt).toLocaleString("ko-KR")}`,
                      `수정: ${new Date(conv.updatedAt).toLocaleString("ko-KR")}`,
                    ].join("\n");
                    navigator.clipboard.writeText(debugText).then(() => {
                      toast.success("디버깅 정보가 클립보드에 복사되었습니다");
                    });
                  }}
                  style={{
                    flex: 1, height: 36,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                    borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 12, fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  <ClipboardCopy style={{ width: 12, height: 12 }} />
                  디버깅 복사
                </button>
                <button
                  onClick={() => {
                    if (!confirm("이 대화를 완전히 삭제합니다. 목록에서도 사라집니다. 계속하시겠습니까?")) return;
                    startReset(async () => {
                      const res = await fetch(`/api/conversations/${conv.sessionId}/reset`, { method: "DELETE" });
                      if (res.ok) {
                        toast.success("대화가 삭제되었습니다.");
                        onDelete?.();
                      } else {
                        toast.error("삭제에 실패했습니다.");
                      }
                    });
                  }}
                  disabled={isResetting}
                  style={{
                    flex: 1, height: 36,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)",
                    borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 12, fontWeight: 500,
                    cursor: isResetting ? "default" : "pointer",
                    opacity: isResetting ? 0.5 : 1,
                  }}
                >
                  <Trash2 style={{ width: 12, height: 12 }} />
                  삭제
                </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Tab 2: 견적 ── */}
        <div style={{ display: activeTab === "quote" ? "block" : "none" }}>
          {/* Confidence summary banner */}
          {(lowConfidenceCount + medConfidenceCount > 0) && (
            <div style={{
              margin: "8px 16px 0", padding: "6px 12px", borderRadius: 8,
              backgroundColor: "#FFF3E0", border: "1px solid #FFE0B2",
              fontSize: 12, fontWeight: 600, color: "#E65100",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>&#9888;</span>
              확인 필요:
              {lowConfidenceCount > 0 && <span> low {lowConfidenceCount}건</span>}
              {medConfidenceCount > 0 && <span> medium {medConfidenceCount}건</span>}
            </div>
          )}
          <Section title="견적 편집">
            <QuoteEditor sessionId={conv.sessionId} quote={conv.quote} district={effectiveDistrict} onDistrictChange={(d) => setDistrictOverride(d)} onRefresh={onRefresh} />
          </Section>
        </div>

        {/* ── Tab 3: 예약 ── */}
        <div style={{ display: activeTab === "booking" ? "block" : "none" }}>
          {/* 수거 희망일 + 시간안내 발송 — 예약 준비 단계 */}
          <Section title="시간 안내">
            <RequestedDatePicker conv={conv} onRefresh={onRefresh} />
          </Section>

          <Section title="예약관리">
            {bookingLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--app-text-tertiary)", fontSize: 14 }}>
                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                조회 중...
              </div>
            ) : activeBookings.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {activeBookings.map((bk) => (
                  <div key={bk.id} style={{ padding: "10px 0", borderBottom: activeBookings.length > 1 ? "1px solid var(--app-border-light)" : "none" }}>
                    {/* 상태 badge + 주문번호 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600, padding: "4px 10px", borderRadius: 12,
                          backgroundColor: ORDER_STATUS_MAP[bk.status]?.bg ?? ORDER_STATUS_COLORS[bk.status]?.bg ?? "var(--app-surface-secondary)",
                          color: ORDER_STATUS_MAP[bk.status]?.text ?? ORDER_STATUS_COLORS[bk.status]?.text ?? "var(--app-text-secondary)",
                        }}>
                          {ORDER_STATUS_MAP[bk.status]?.label ?? ORDER_STATUS_LABELS[bk.status as OrderStatus] ?? bk.status}
                        </span>
                        {bk.orderNumber && (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-tertiary)", fontFamily: "monospace" }}>
                            #{bk.orderNumber}
                          </span>
                        )}
                      </div>
                      <button onClick={fetchBooking} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--app-text-tertiary)" }} title="새로고침">
                        <RotateCcw style={{ width: 13, height: 13 }} />
                      </button>
                    </div>

                    {/* 정보 */}
                    <InfoRow label="고객명" value={bk.customerName} />
                    <InfoRow label="연락처" value={formatPhone(bk.phone)} />
                    <InfoRow label="주소" value={bk.address} />
                    <InfoRow label="수거일" value={bk.date || "미정"} />
                    <InfoRow label="시간대" value={formatTimeSlot(bk.timeSlot)} />
                    <InfoRow
                      label="담당 기사"
                      value={bk.driverName
                        ? `${bk.driverName}${bk.driverPhone ? ` · ${formatPhone(bk.driverPhone)}` : ""}`
                        : "배정전"}
                    />
                    <InfoRow label="엘리베이터" value={bk.hasElevator ? "있음" : "없음"} />
                    {bk.items.length > 0 && (
                      <div style={{ marginBottom: 8, fontSize: 15 }}>
                        <span style={{ color: "var(--app-text-tertiary)", display: "block", marginBottom: 4 }}>품목 ({bk.items.length})</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {bk.items.map((item, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", backgroundColor: i % 2 === 0 ? "var(--app-surface-secondary)" : "transparent", borderRadius: 4 }}>
                              <span style={{ color: "var(--app-text-primary)" }}>{item.displayName || item.name || item.category}</span>
                              <span style={{ color: "var(--app-text-secondary)", flexShrink: 0, marginLeft: 8 }}>{item.quantity}개</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <InfoRow label="금액" value={`${bk.totalPrice.toLocaleString()}원`} />
                    {bk.memo && <InfoRow label="메모" value={bk.memo} />}

                    {/* 액션 버튼 */}
                    <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                      <button onClick={() => openBookingEdit(bk)}
                        style={{ flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        <Edit3 style={{ width: 12, height: 12 }} /> 수정
                      </button>
                      {bk.status !== "cancelled" && (
                        <button onClick={() => { setLinkedBooking(bk); setShowPaymentModal(true); }}
                          style={{ flex: 1, height: 32, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: bk.paymentIds?.length > 0 ? "var(--app-tag-purple-bg)" : "var(--app-tag-blue-bg)", color: bk.paymentIds?.length > 0 ? "var(--app-tag-purple-text)" : "var(--app-accent)", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                          <CreditCard style={{ width: 12, height: 12 }} /> {bk.paymentIds?.length > 0 ? "결제확인" : "결제요청"}
                        </button>
                      )}
                      {bk.status !== "cancelled" && bk.status !== "completed" && (
                        <button onClick={() => { setLinkedBooking(bk); handleBookingCancel(); }}
                          style={{ height: 32, width: 32, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)", borderRadius: 8, border: "none", cursor: "pointer", flexShrink: 0 }} title="예약 취소">
                          <X style={{ width: 14, height: 14 }} />
                        </button>
                      )}
                    </div>

                    {/* 사다리차 선결제 — needLadder 인 예약에서만 노출 */}
                    {bk.status !== "cancelled" && bk.needLadder && (
                      <button onClick={() => { setLinkedBooking(bk); setShowLadderModal(true); }}
                        style={{ width: "100%", height: 32, marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                        🪜 사다리차 선결제 요청
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 14, color: "var(--app-text-placeholder)", textAlign: "center", padding: "8px 0" }}>
                <CalendarCheck style={{ width: 20, height: 20, marginBottom: 4, opacity: 0.5, display: "inline-block" }} />
                <div>연결된 예약 없음</div>
              </div>
            )}

            {/* 수동 예약 등록 버튼 — 항상 표시 (다중 예약 지원) */}
            {!bookingLoading && (
              <button
                onClick={openCreateBooking}
                style={{
                  width: "100%", height: 36, marginTop: 10,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)", borderRadius: 8,
                  border: "1px solid var(--app-border)", fontSize: 14, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <CalendarCheck style={{ width: 14, height: 14 }} />
                {activeBookings.length > 0 ? "예약 추가 등록" : "수동 예약 등록"}
              </button>
            )}

            {/* 지난 예약 (완료/취소) */}
            {pastBookings.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setShowPastBookings(!showPastBookings)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 10px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8,
                    border: "1px solid var(--app-border)", cursor: "pointer", fontSize: 13, color: "var(--app-text-secondary)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>지난 예약 ({pastBookings.length}건)</span>
                  <ChevronDown style={{
                    width: 14, height: 14, transition: "transform 0.2s",
                    transform: showPastBookings ? "rotate(180deg)" : "rotate(0deg)",
                  }} />
                </button>
                {showPastBookings && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    {pastBookings.map((pb) => (
                      <div
                        key={pb.id}
                        style={{
                          padding: "10px 12px", borderRadius: 8,
                          border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
                          fontSize: 13, opacity: 0.85,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                              fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                              backgroundColor: ORDER_STATUS_MAP[pb.status]?.bg ?? ORDER_STATUS_COLORS[pb.status]?.bg ?? "var(--app-surface-secondary)",
                              color: ORDER_STATUS_MAP[pb.status]?.text ?? ORDER_STATUS_COLORS[pb.status]?.text ?? "var(--app-text-secondary)",
                            }}>
                              {ORDER_STATUS_MAP[pb.status]?.label ?? ORDER_STATUS_LABELS[pb.status as OrderStatus] ?? pb.status}
                            </span>
                            {pb.orderNumber && (
                              <span style={{ fontSize: 11, color: "var(--app-text-placeholder)", fontFamily: "monospace" }}>
                                #{pb.orderNumber}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>{pb.date || "날짜 미정"}</span>
                        </div>
                        <div style={{ color: "var(--app-text-secondary)", lineHeight: 1.6 }}>
                          <div>{pb.customerName} · {pb.totalPrice?.toLocaleString()}원</div>
                          {pb.items?.length > 0 && (
                            <div style={{ color: "var(--app-text-tertiary)" }}>
                              {pb.items.map((item) =>
                                `${item.displayName || item.category} ${item.quantity}개`
                              ).join(", ")}
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                          <button
                            onClick={() => openBookingEdit(pb)}
                            style={{
                              padding: "4px 10px", fontSize: 12, backgroundColor: "var(--app-surface-secondary)",
                              color: "var(--app-text-secondary)", borderRadius: 6, border: "none", cursor: "pointer",
                            }}
                          >
                            수정
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 예약 현황 보기 버튼 */}
            <button
              onClick={() => { setShowSchedule(true); fetchSchedule(scheduleDate); }}
              style={{
                width: "100%", height: 36, marginTop: 12,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)", borderRadius: 8,
                border: "1px solid var(--app-border)", fontSize: 14, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Calendar style={{ width: 14, height: 14 }} />
              예약 현황 보기
            </button>
          </Section>
        </div>
      </div>

      {/* ===== MODALS (outside tabs) ===== */}

      {/* 예약 수정 모달 — 예약관리 신규등록과 동일 레이아웃 */}
      {showBookingEdit && editingOrder && (
        <div
          onClick={() => { setShowBookingEdit(false); resetModalPos(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, maxHeight: "85vh", overflow: "auto",
              backgroundColor: "var(--app-surface)", borderRadius: 16,
              boxShadow: "var(--app-shadow-lg)",
              ...(modalPos.x >= 0 ? { position: "fixed" as const, top: modalPos.y, left: modalPos.x } : {}),
            }}
          >
            <div
              onMouseDown={onDragStart}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", cursor: "grab", userSelect: "none" }}
            >
              <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>예약 수정</h2>
              <button
                onClick={() => { setShowBookingEdit(false); resetModalPos(); }}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "transparent", border: "none", cursor: "pointer",
                }}
              >
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 24px 24px" }}>
              {/* 상태 */}
              <div>
                <label style={editLabelStyle}>상태</label>
                <select
                  value={bookingEditForm.status}
                  onChange={(e) => setBookingEditForm({ ...bookingEditForm, status: e.target.value })}
                  style={editInputStyle}
                >
                  {[
                    ["confirmed", "일정확정"],
                    ["payment_requested", "결제요청"],
                    ["prepaid", "선결제완료"],
                    ["completed", "완료"],
                    ["cancelled", "취소"],
                  ].map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* 고객명 + 연락처 (2열) */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={editLabelStyle}>고객명</label>
                  <input value={bookingEditForm.customerName} onChange={(e) => setBookingEditForm({ ...bookingEditForm, customerName: e.target.value })} style={editInputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={editLabelStyle}>연락처</label>
                  <input value={bookingEditForm.phone} onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                    let fmt = digits;
                    if (digits.length > 7) fmt = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                    else if (digits.length > 3) fmt = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                    setBookingEditForm({ ...bookingEditForm, phone: fmt });
                  }} placeholder="010-0000-0000" style={editInputStyle} />
                </div>
              </div>

              {/* 날짜 + 시간 (2열) */}
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={editLabelStyle}>날짜</label>
                  <input type="date" value={bookingEditForm.date} onChange={(e) => {
                    setBookingEditForm({ ...bookingEditForm, date: e.target.value });
                    setScheduleDate(e.target.value);
                    fetchSchedule(e.target.value);
                  }} style={editInputStyle} />
                </div>
              </div>

              {/* 수거시간 */}
              <div>
                <label style={editLabelStyle}>수거시간</label>
                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                  <select value={bookingEditForm.timeAmPm} onChange={(e) => setBookingEditForm({ ...bookingEditForm, timeAmPm: e.target.value })}
                    style={{ width: 72, padding: "8px 4px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, backgroundColor: "var(--app-surface)", cursor: "pointer" }}>
                    <option value="오전">오전</option>
                    <option value="오후">오후</option>
                  </select>
                  <input type="number" value={bookingEditForm.timeHour} onChange={(e) => setBookingEditForm({ ...bookingEditForm, timeHour: e.target.value })}
                    placeholder="시" min={1} max={12}
                    style={{ width: 50, padding: "8px 4px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, textAlign: "center" }} />
                  <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                  <input type="number" value={bookingEditForm.timeMinute} onChange={(e) => setBookingEditForm({ ...bookingEditForm, timeMinute: e.target.value })}
                    placeholder="분" min={0} max={59}
                    style={{ width: 50, padding: "8px 4px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, textAlign: "center" }} />
                  <span style={{ color: "var(--app-text-tertiary)", margin: "0 2px" }}>~</span>
                  <select value={bookingEditForm.timeEndAmPm} onChange={(e) => setBookingEditForm({ ...bookingEditForm, timeEndAmPm: e.target.value })}
                    style={{ width: 72, padding: "8px 4px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, backgroundColor: "var(--app-surface)", cursor: "pointer" }}>
                    <option value="오전">오전</option>
                    <option value="오후">오후</option>
                  </select>
                  <input type="number" value={bookingEditForm.timeEndHour} onChange={(e) => setBookingEditForm({ ...bookingEditForm, timeEndHour: e.target.value })}
                    placeholder="시" min={1} max={12}
                    style={{ width: 50, padding: "8px 4px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, textAlign: "center" }} />
                  <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                  <input type="number" value={bookingEditForm.timeEndMinute} onChange={(e) => setBookingEditForm({ ...bookingEditForm, timeEndMinute: e.target.value })}
                    placeholder="분" min={0} max={59}
                    style={{ width: 50, padding: "8px 4px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, textAlign: "center" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 3 }}>종료시간은 선택사항입니다</div>
              </div>

              {/* 인원 */}
              <div>
                <label style={editLabelStyle}>인원</label>
                <select value={bookingEditForm.crewSize} onChange={(e) => setBookingEditForm({ ...bookingEditForm, crewSize: e.target.value })} style={editInputStyle}>
                  <option value="1">1인</option>
                  <option value="2">2인</option>
                  <option value="3">3인</option>
                  <option value="4">4인</option>
                </select>
              </div>

              {/* 주소 */}
              <div>
                <label style={editLabelStyle}>주소</label>
                <input value={bookingEditForm.address} onChange={(e) => setBookingEditForm({ ...bookingEditForm, address: e.target.value })} style={editInputStyle} />
              </div>

              {/* 금액 */}
              <div>
                <label style={editLabelStyle}>금액</label>
                <input type="number" value={bookingEditForm.totalPrice} onChange={(e) => setBookingEditForm({ ...bookingEditForm, totalPrice: e.target.value })} style={editInputStyle} />
              </div>

              {/* 체크박스 (엘리베이터, 주차, 사다리차) */}
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: "var(--app-text-primary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={bookingEditForm.hasElevator} onChange={(e) => setBookingEditForm({ ...bookingEditForm, hasElevator: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--app-accent)" }} />
                  엘리베이터
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: "var(--app-text-primary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={bookingEditForm.hasParking} onChange={(e) => setBookingEditForm({ ...bookingEditForm, hasParking: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--app-accent)" }} />
                  주차 가능
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: "var(--app-text-primary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={bookingEditForm.hasGroundAccess} onChange={(e) => setBookingEditForm({ ...bookingEditForm, hasGroundAccess: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--app-accent)" }} />
                  지상출입
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: "var(--app-text-primary)", cursor: "pointer" }}>
                  <input type="checkbox" checked={bookingEditForm.needLadder} onChange={(e) => setBookingEditForm({ ...bookingEditForm, needLadder: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--app-accent)" }} />
                  사다리차
                </label>
              </div>

              {/* 품목 (구조화 테이블) */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <label style={{ ...editLabelStyle, marginBottom: 0 }}>품목 ({bookingEditForm.items.length}개)</label>
                  <button onClick={() => setBookingEditForm({
                    ...bookingEditForm,
                    items: [...bookingEditForm.items, { category: "", name: "", price: 0, quantity: 1 }],
                  })} style={{
                    fontSize: 13, fontWeight: 600, color: "var(--app-accent)", backgroundColor: "transparent",
                    border: "none", cursor: "pointer", padding: "2px 6px",
                  }}>+ 추가</button>
                </div>
                {bookingEditForm.items.length > 0 && (
                  <div style={{ border: "1px solid var(--app-border)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 70px 50px 30px", gap: 0, backgroundColor: "var(--app-surface-hover)", padding: "6px 8px", fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)" }}>
                      <span>카테고리</span><span>품목명</span><span>단가</span><span>수량</span><span></span>
                    </div>
                    {bookingEditForm.items.map((item, idx) => (
                      <div key={idx} style={{ display: "grid", gridTemplateColumns: "80px 1fr 70px 50px 30px", gap: 0, padding: "4px 8px", borderTop: "1px solid var(--app-border-light)", alignItems: "center" }}>
                        <input value={item.category} onChange={(e) => {
                          const arr = [...bookingEditForm.items]; arr[idx] = { ...arr[idx], category: e.target.value };
                          setBookingEditForm({ ...bookingEditForm, items: arr });
                        }} style={{ fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 4, padding: "4px 6px", width: "100%", boxSizing: "border-box" }} />
                        <input value={item.name} onChange={(e) => {
                          const arr = [...bookingEditForm.items]; arr[idx] = { ...arr[idx], name: e.target.value };
                          setBookingEditForm({ ...bookingEditForm, items: arr });
                        }} style={{ fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 4, padding: "4px 6px", width: "100%", boxSizing: "border-box", marginLeft: 4 }} />
                        <input type="number" value={item.price} onChange={(e) => {
                          const arr = [...bookingEditForm.items]; arr[idx] = { ...arr[idx], price: Number(e.target.value) };
                          setBookingEditForm({ ...bookingEditForm, items: arr });
                        }} style={{ fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 4, padding: "4px 6px", width: "100%", boxSizing: "border-box", marginLeft: 4 }} />
                        <input type="number" value={item.quantity} onChange={(e) => {
                          const arr = [...bookingEditForm.items]; arr[idx] = { ...arr[idx], quantity: Number(e.target.value) };
                          setBookingEditForm({ ...bookingEditForm, items: arr });
                        }} min={1} style={{ fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 4, padding: "4px 6px", width: "100%", boxSizing: "border-box", marginLeft: 4 }} />
                        <button onClick={() => {
                          const arr = bookingEditForm.items.filter((_, i) => i !== idx);
                          setBookingEditForm({ ...bookingEditForm, items: arr });
                        }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-btn-danger-text)", fontSize: 17, fontWeight: 700, padding: 0, marginLeft: 4 }}>x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 메모 */}
              <div>
                <label style={editLabelStyle}>메모</label>
                <textarea value={bookingEditForm.memo} onChange={(e) => setBookingEditForm({ ...bookingEditForm, memo: e.target.value })} rows={3} placeholder="고객 요청사항, 주의사항 등" style={{ ...editInputStyle, resize: "vertical" as const }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 22 }}>
              <button onClick={() => setShowBookingEdit(false)} style={{
                flex: 1, padding: "12px 20px", fontSize: 15, fontWeight: 500,
                color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
                border: "none", borderRadius: 8, cursor: "pointer",
              }}>취소</button>
              <button onClick={handleBookingSave} disabled={bookingSaving} style={{
                flex: 1, padding: "12px 20px", fontSize: 15, fontWeight: 600,
                color: "var(--app-btn-primary-text)", backgroundColor: bookingSaving ? "var(--app-border)" : "var(--app-btn-primary-bg)",
                border: "none", borderRadius: 8, cursor: bookingSaving ? "not-allowed" : "pointer",
              }}>{bookingSaving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 수동 예약 등록 모달 — 예약관리 신규등록과 동일 */}
      {showCreateBooking && (
        <div
          onClick={() => { setShowCreateBooking(false); resetModalPos(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, maxHeight: "85vh", overflow: "auto",
              backgroundColor: "var(--app-surface)", borderRadius: 16,
              boxShadow: "var(--app-shadow-lg)",
              ...(modalPos.x >= 0 ? { position: "fixed" as const, top: modalPos.y, left: modalPos.x } : {}),
            }}
          >
            <div
              onMouseDown={onDragStart}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", cursor: "grab", userSelect: "none" }}
            >
              <h2 style={{ fontSize: 19, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>신규 예약 등록</h2>
              <button
                onClick={() => { setShowCreateBooking(false); resetModalPos(); }}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "transparent", border: "none", cursor: "pointer",
                }}
              >
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 24px 24px" }}>
              {/* 고객 성함 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>고객 성함</label>
                <input
                  value={createBookingForm.customerName}
                  onChange={(e) => setCreateBookingForm({ ...createBookingForm, customerName: e.target.value })}
                  placeholder="고객 성함을 입력하세요"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* 날짜 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>날짜</label>
                <input
                  type="date"
                  value={createBookingForm.date}
                  onChange={(e) => {
                    setCreateBookingForm({ ...createBookingForm, date: e.target.value });
                    setScheduleDate(e.target.value);
                    fetchSchedule(e.target.value);
                  }}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* 수거시간 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>수거시간</label>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={createBookingForm.timeAmPm}
                    onChange={(e) => setCreateBookingForm({ ...createBookingForm, timeAmPm: e.target.value })}
                    style={{ width: 80, padding: "8px 6px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="오전">오전</option>
                    <option value="오후">오후</option>
                  </select>
                  <input
                    type="number"
                    value={createBookingForm.timeHour}
                    onChange={(e) => setCreateBookingForm({ ...createBookingForm, timeHour: e.target.value })}
                    placeholder="시"
                    min={1} max={12}
                    style={{ width: 56, padding: "8px 4px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", textAlign: "center" }}
                  />
                  <span style={{ fontSize: 15, color: "var(--app-text-secondary)" }}>:</span>
                  <input
                    type="number"
                    value={createBookingForm.timeMinute}
                    onChange={(e) => setCreateBookingForm({ ...createBookingForm, timeMinute: e.target.value })}
                    placeholder="분"
                    min={0} max={59}
                    style={{ width: 56, padding: "8px 4px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", textAlign: "center" }}
                  />
                  <span style={{ fontSize: 15, color: "var(--app-text-tertiary)", margin: "0 2px" }}>~</span>
                  <select
                    value={createBookingForm.timeEndAmPm}
                    onChange={(e) => setCreateBookingForm({ ...createBookingForm, timeEndAmPm: e.target.value })}
                    style={{ width: 80, padding: "8px 6px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="오전">오전</option>
                    <option value="오후">오후</option>
                  </select>
                  <input
                    type="number"
                    value={createBookingForm.timeEndHour}
                    onChange={(e) => setCreateBookingForm({ ...createBookingForm, timeEndHour: e.target.value })}
                    placeholder="시"
                    min={1} max={12}
                    style={{ width: 56, padding: "8px 4px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", textAlign: "center" }}
                  />
                  <span style={{ fontSize: 15, color: "var(--app-text-secondary)" }}>:</span>
                  <input
                    type="number"
                    value={createBookingForm.timeEndMinute}
                    onChange={(e) => setCreateBookingForm({ ...createBookingForm, timeEndMinute: e.target.value })}
                    placeholder="분"
                    min={0} max={59}
                    style={{ width: 56, padding: "8px 4px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", textAlign: "center" }}
                  />
                </div>
                <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 4 }}>
                  종료시간은 선택사항입니다 (예: 오후 2:00 ~ 오후 4:30)
                </div>
              </div>

              {/* 예약 현황 미리보기 */}
              {createBookingForm.date ? (
                <div style={{ padding: "4px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>
                      {createBookingForm.date.replace(/-/g, ".")} 예약 현황
                    </div>
                    <ScheduleSummaryBadge data={scheduleData} loading={scheduleLoading} />
                  </div>
                  <SchedulePreview
                    scheduleData={scheduleData}
                    abcData={abcData}
                    loading={scheduleLoading}
                    mode="medium"
                  />
                </div>
              ) : (
                <div style={{
                  padding: "12px 16px", borderRadius: 10,
                  backgroundColor: "var(--app-bg)", fontSize: 13, color: "var(--app-text-tertiary)",
                  textAlign: "center",
                }}>
                  날짜를 선택하면 예약 현황이 표시됩니다
                </div>
              )}

              {/* 수거주소 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>수거주소</label>
                <input
                  value={createBookingForm.address}
                  onChange={(e) => setCreateBookingForm({ ...createBookingForm, address: e.target.value })}
                  placeholder="수거 주소를 입력하세요"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* 고객 연락처 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>고객 연락처</label>
                <input
                  value={createBookingForm.customerPhone}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                    let formatted = digits;
                    if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                    else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                    setCreateBookingForm({ ...createBookingForm, customerPhone: formatted });
                  }}
                  placeholder="010-0000-0000"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* 품목/특이사항 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>품목/특이사항</label>
                <textarea
                  value={createBookingForm.items}
                  onChange={(e) => setCreateBookingForm({ ...createBookingForm, items: e.target.value })}
                  placeholder="품목이나 특이사항을 입력하세요"
                  rows={3}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", resize: "vertical" }}
                />
              </div>

              {/* 정산금액 */}
              <div>
                <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>정산금액</label>
                <input
                  value={createBookingForm.amount}
                  onChange={(e) => setCreateBookingForm({ ...createBookingForm, amount: e.target.value })}
                  placeholder="예: 50000"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 15, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
              <button onClick={() => setShowCreateBooking(false)} style={{
                padding: "10px 20px", fontSize: 15, fontWeight: 500,
                color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
                border: "none", borderRadius: 8, cursor: "pointer",
              }}>취소</button>
              <button onClick={handleCreateBooking} disabled={creatingBooking} style={{
                padding: "10px 20px", fontSize: 15, fontWeight: 600,
                color: "var(--app-btn-primary-text)", backgroundColor: creatingBooking ? "var(--app-border)" : "var(--app-tag-purple-text)",
                border: "none", borderRadius: 8, cursor: creatingBooking ? "not-allowed" : "pointer",
              }}>{creatingBooking ? "등록 중..." : "등록"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 결제 모달 */}
      {showPaymentModal && linkedBooking && (
        <PaymentModal
          booking={linkedBooking}
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onRefresh={() => { fetchBooking(); onRefresh(); }}
        />
      )}

      {/* 사다리차 선결제 모달 */}
      {showLadderModal && linkedBooking && (
        <LadderPrepaymentModal
          parentOrder={linkedBooking}
          isOpen={showLadderModal}
          onClose={() => setShowLadderModal(false)}
          onRefresh={() => { fetchBooking(); onRefresh(); }}
        />
      )}

      {/* 예약 현황 모달 */}
      {showSchedule && (
        <div
          onClick={() => setShowSchedule(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: "var(--app-surface)", borderRadius: 16, padding: "28px 32px",
            width: 580, maxHeight: "85vh", overflowY: "auto",
            boxShadow: "var(--app-shadow-lg)",
          }}>
            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)" }}>
                예약 현황
              </h3>
              <button
                onClick={() => setShowSchedule(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>

            {/* 날짜 선택 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <Calendar style={{ width: 16, height: 16, color: "var(--app-text-secondary)", flexShrink: 0 }} />
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => { setScheduleDate(e.target.value); fetchSchedule(e.target.value); }}
                style={{
                  flex: 1, fontSize: 15, color: "var(--app-text-primary)",
                  border: "1px solid var(--app-border)", borderRadius: 8,
                  padding: "10px 12px", outline: "none", backgroundColor: "var(--app-surface)",
                }}
              />
              <button
                onClick={() => fetchSchedule(scheduleDate)}
                style={{
                  height: 38, width: 38, display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "var(--app-surface-secondary)", borderRadius: 8, border: "none", cursor: "pointer",
                }}
                title="새로고침"
              >
                <RotateCcw style={{ width: 14, height: 14, color: "var(--app-text-secondary)" }} />
              </button>
            </div>

            <div>
              {/* 건수 + 날짜 */}
              {!scheduleLoading && scheduleData && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--app-text-primary)" }}>
                    {scheduleDate.replace(/-/g, ".")} 예약
                  </span>
                  <ScheduleSummaryBadge data={scheduleData} loading={false} size="lg" />
                </div>
              )}

              <SchedulePreview
                scheduleData={scheduleData}
                abcData={abcData}
                loading={scheduleLoading}
                mode="full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EditableRow({ label, value, isEditing, input, onInputChange, onEdit, onSave, onCancel, isSaving, placeholder }: {
  label: string; value: string; isEditing: boolean; input: string;
  onInputChange: (v: string) => void; onEdit: () => void; onSave: () => void; onCancel: () => void;
  isSaving: boolean; placeholder?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 15 }}>
      <span style={{ color: "var(--app-text-tertiary)", flexShrink: 0, width: 70 }}>{label}</span>
      {isEditing ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
            autoFocus
            placeholder={placeholder}
            style={{
              width: 120, fontSize: 14, padding: "4px 8px",
              border: "1px solid var(--app-accent)", borderRadius: 6,
              outline: "none", color: "var(--app-text-primary)",
            }}
          />
          <button onClick={onSave} disabled={isSaving} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <Check style={{ width: 16, height: 16, color: "#20C997" }} />
          </button>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <X style={{ width: 16, height: 16, color: "#ADB5BD" }} />
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: value === "미등록" ? "var(--app-text-placeholder)" : "var(--app-text-primary)", textAlign: "right" }}>{value}</span>
          <button onClick={onEdit} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <Pencil style={{ width: 13, height: 13, color: "var(--app-text-placeholder)" }} />
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "20px 20px", borderBottom: "1px solid var(--app-border-light)" }}>
      <h3 style={{
        fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)",
        margin: "0 0 12px", letterSpacing: "-0.01em",
      }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 15 }}>
      <span style={{ color: "var(--app-text-tertiary)", flexShrink: 0, width: 70 }}>{label}</span>
      <span style={{ color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function RequestedDatePicker({ conv, onRefresh }: { conv: Conversation; onRefresh: () => void }) {
  const ci = (conv.collectedInfo || {}) as CollectedInfo & { requestedDate?: string | null };
  const [date, setDate] = useState<string>(ci.requestedDate || "");
  const [saving, setSaving] = useState(false);
  const [sendingAbc, setSendingAbc] = useState(false);
  const [abcData, setAbcData] = useState<AbcData | null>(null);
  const [abcLoading, setAbcLoading] = useState(false);

  // conv 가 외부에서 바뀌면 동기화 (AI 가 requestedDate 업데이트 시)
  useEffect(() => {
    setDate((ci.requestedDate as string) || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ci.requestedDate]);

  // 날짜 바뀌면 ABC 잔여 조회
  useEffect(() => {
    if (!date) { setAbcData(null); return; }
    let cancelled = false;
    setAbcLoading(true);
    fetch(`/api/schedule/abc?date=${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setAbcData(d ? { date: d.date, closed: d.closed, blocks: d.blocks } : null); })
      .catch(() => { if (!cancelled) setAbcData(null); })
      .finally(() => { if (!cancelled) setAbcLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const save = async (newDate: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conv.sessionId}/requested-date`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate || null }),
      });
      if (!res.ok) throw new Error();
      onRefresh();
    } catch { toast.error("저장 실패"); } finally { setSaving(false); }
  };

  const handleDateChange = (v: string) => {
    setDate(v);
    save(v);
  };

  const sendAbcSlots = async () => {
    if (!date) { toast.error("수거 희망일을 먼저 선택해 주세요"); return; }
    setSendingAbc(true);
    try {
      const res = await fetch(`/api/conversations/${conv.sessionId}/send-abc-slots`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || "발송 실패"); return; }
      if (d.noAvailable) {
        toast.error(`${date} 예약 불가 — 모든 시간대가 마감되었습니다. 고객에게 다른 날짜를 안내해 주세요.`, { duration: 6000 });
      } else {
        toast.success(`시간안내 발송 (${d.blocks?.join(", ")})`);
        onRefresh();
      }
    } catch { toast.error("네트워크 오류"); }
    finally { setSendingAbc(false); }
  };

  // 모든 블록 이용 불가 여부 (closed 강제 마감 포함 + 전 블록 풀)
  const allBlocksUnavailable = abcData
    ? abcData.closed === true || (["A", "B", "C"] as const).every((b) => !abcData.blocks[b].available)
    : false;
  const isDateClosed = abcData?.closed === true;

  return (
    <div style={{ padding: "10px 12px", fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 날짜 */}
      <div>
        <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 4, fontWeight: 600 }}>수거 희망일</div>
        <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} disabled={saving}
          style={{ width: "100%", padding: "6px 10px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 6, backgroundColor: "var(--app-surface)", boxSizing: "border-box" }} />
      </div>

      {/* ABC 잔여 — 희망일 기준 즉시 확인 */}
      {date && (
        <>
          <AbcAvailabilityCards abcData={abcData} loading={abcLoading} size="compact" />
          {!abcLoading && isDateClosed && (
            <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "white", backgroundColor: "#DC2626", borderRadius: 6, textAlign: "center" }}>
              이 날짜는 마감되어 예약 불가합니다
            </div>
          )}
          {!abcLoading && !isDateClosed && allBlocksUnavailable && (
            <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, color: "#DC2626", backgroundColor: "#FEE2E2", borderRadius: 6, textAlign: "center" }}>
              전 시간대 마감 — 다른 날짜 안내 필요
            </div>
          )}
        </>
      )}

      {/* 시간안내 발송 버튼 */}
      <button onClick={sendAbcSlots} disabled={sendingAbc || !date || allBlocksUnavailable}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "8px 14px", fontSize: 13, fontWeight: 600,
          backgroundColor: !date || allBlocksUnavailable ? "var(--app-surface-secondary)" : "#EDE9FE",
          color: !date || allBlocksUnavailable ? "var(--app-text-tertiary)" : "#6D28D9",
          border: "1px solid var(--app-border)", borderRadius: 8,
          cursor: (sendingAbc || !date || allBlocksUnavailable) ? "not-allowed" : "pointer",
        }}>
        {sendingAbc ? "발송중..." : allBlocksUnavailable ? "예약 불가" : "시간안내 발송"}
      </button>
    </div>
  );
}

function CollectedInfoPanel({ info }: { info: CollectedInfo }) {
  const check = (v: unknown) => v != null && v !== "";
  const items = info?.items ?? [];
  const specialNotes = info?.special_notes ?? [];
  return (
    <div style={{ fontSize: 14 }}>
      <CheckRow label="주소" checked={check(info?.address)} value={info?.address ?? "미확인"} />
      <CheckRow label="지역(구)" checked={check(info?.district)} value={info?.district ?? "미확인"} />
      <CheckRow label="층수" checked={check(info?.floor)} value={info?.floor != null ? `${info.floor}층` : "미확인"} />
      <CheckRow label="엘리베이터" checked={info?.elevator != null} value={info?.elevator == null ? "미확인" : info.elevator ? "있음" : "없음"} negative={info?.elevator === false} />
      <CheckRow label="주차" checked={info?.parking != null} value={info?.parking == null ? "미확인" : info.parking ? "가능" : "불가"} negative={info?.parking === false} />
      {items.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>품목 ({items.length}건)</span>
          <div style={{ marginTop: 4 }}>
            {items.map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between",
                padding: "4px 0", borderBottom: i < items.length - 1 ? "1px solid var(--app-border-light)" : "none",
              }}>
                <span style={{ color: "var(--app-text-primary)" }}>
                  {item.category}{item.spec ? ` (${item.spec})` : ""}
                </span>
                <span style={{ color: "var(--app-text-secondary)" }}>x{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {specialNotes.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <span style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>특이사항</span>
          {specialNotes.map((note, i) => (
            <div key={i} style={{ color: "var(--app-tag-orange-text)", fontSize: 13, marginTop: 2 }}>
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ label, checked, value, negative }: { label: string; checked: boolean; value: string; negative?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "3px 0", gap: 6 }}>
      <span style={{
        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, color: "#fff",
        backgroundColor: negative ? "#FF6B6B" : checked ? "#20C997" : "#DEE2E6",
      }}>{negative ? "!" : checked ? "\u2713" : ""}</span>
      <span style={{ color: "var(--app-text-tertiary)", fontSize: 13, width: 65, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: negative ? "#E03131" : checked ? "var(--app-text-primary)" : "var(--app-text-placeholder)",
        flex: 1, textAlign: "right", fontSize: 13, fontWeight: negative ? 600 : 400,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{value}</span>
    </div>
  );
}

function PhaseTimeline({ history, currentPhase }: { history: { from: string; to: string; reason: string; triggered_by: string; timestamp: string }[]; currentPhase: string }) {
  return (
    <div style={{ position: "relative", paddingLeft: 16 }}>
      {/* 세로 라인 */}
      <div style={{
        position: "absolute", left: 5, top: 4, bottom: 4,
        width: 2, backgroundColor: "var(--app-border)",
      }} />
      {history.map((h, i) => {
        const isCurrent = h.to === currentPhase;
        return (
          <div key={i} style={{ position: "relative", marginBottom: 12, paddingLeft: 8 }}>
            {/* 도트 */}
            <div style={{
              position: "absolute", left: -14, top: 4,
              width: 10, height: 10, borderRadius: "50%",
              backgroundColor: isCurrent ? "var(--app-accent)" : "var(--app-text-placeholder)",
              border: isCurrent ? "2px solid #93C5FD" : "2px solid var(--app-border)",
            }} />
            <div style={{ fontSize: 13, fontWeight: isCurrent ? 600 : 400, color: isCurrent ? "var(--app-accent)" : "var(--app-text-secondary)" }}>
              {PHASE_LABELS[h.to as Phase] ?? h.to}
            </div>
            <div style={{ fontSize: 12, color: "var(--app-text-placeholder)", marginTop: 1 }}>
              {h.reason} · {h.triggered_by === "agent" ? "상담사" : "자동"}
            </div>
            <div style={{ fontSize: 11, color: "var(--app-text-placeholder)", marginTop: 1 }}>
              {new Date(h.timestamp).toLocaleString("ko-KR")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PhoneRequestBadge({ tags }: { tags: string[]; sessionId: string; onChanged: () => void }) {
  const hasOpen = tags.includes("전화요청");
  const hasDone = tags.includes("전화요청완료");
  if (!hasOpen && !hasDone) return null;
  const isDone = hasDone && !hasOpen;
  return (
    <div
      title={isDone ? "전화상담 처리 완료" : "전화상담 요청중 — 상담상태 드롭다운에서 '전화상담완료' 선택 시 종료"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 8px", marginBottom: 8,
        borderRadius: 12, fontSize: 11, fontWeight: 700,
        backgroundColor: isDone ? "#E0F2F1" : "#FFF3E0",
        color: isDone ? "#00695C" : "#E65100",
        border: `1px solid ${isDone ? "#80CBC4" : "#FFB74D"}`,
      }}
    >
      {isDone ? "✅ 전화요청완료" : "☎️ 전화요청"}
    </div>
  );
}
