"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// 딥링크 URL 파라미터 (useSearchParams 대신 window 직접 읽기 — Suspense 회피)
function readUrlSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try { return new URLSearchParams(window.location.search).get("sessionId"); } catch { return null; }
}
import {
  Loader2, RefreshCw, Search, ChevronLeft, ChevronRight,
  Edit3, X, ArrowUp, ArrowDown, Calendar, Send, CreditCard, Plus,
  MessageSquare, List, Package, Inbox, Phone, Trash2, FileText, Check, AlertCircle, Upload, Eye,
  Bot, User, ImageIcon, Users, ClipboardList, Calculator, CalendarCheck, Pencil, ChevronUp, ClipboardCopy, Paperclip, Link2,
} from "lucide-react";
import { toast } from "sonner";
import type { LunchOrder, LunchOrderStatus, LunchSettlementType } from "@/lib/store/lunch-orders";
import regionPricesJson from "@/lib/data/region-prices.json";
import type { LunchVendor } from "@/lib/store/lunch-vendors";
import { LunchPaymentModal } from "@/components/lunch/modals/LunchPaymentModal";
import { LunchInvoicesView as InvoiceListView } from "@/components/lunch/LunchInvoicesView";
import { LunchChatView as ChatView } from "@/components/lunch/LunchChatView";

const PAGE_SIZE = 30;
// removed: AUTO_SYNC_MS (시트 동기화 제거됨)

type ViewMode = "chat" | "orders" | "invoices";

const STATUS_TABS: { label: string; value: LunchOrderStatus | "all" }[] = [
  { label: "전체", value: "all" },
  { label: "일정확정", value: "confirmed" },
  { label: "결제요청", value: "payment_requested" },
  { label: "정산완료", value: "completed" },
  { label: "취소", value: "cancelled" },
];

const SETTLEMENT_LABELS: Record<LunchSettlementType, string> = {
  link_pay: "링크페이",
  monthly_invoice: "월말정산",
  tax_invoice: "세금계산서",
};

export default function LunchPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  // 딥링크: /lunch?sessionId=xxx 진입 시 chat 탭으로 강제
  useEffect(() => {
    if (readUrlSessionId()) setViewMode("chat");
  }, []);
  const [orders, setOrders] = useState<LunchOrder[]>([]);
  const [vendors, setVendors] = useState<LunchVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<LunchOrderStatus | "all">("all");
  const [settlementFilter, setSettlementFilter] = useState<LunchSettlementType | "all">("all");
  const [page, setPage] = useState(0);

  // checkbox selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [bulkSendMethod, setBulkSendMethod] = useState<"2" | "0">("2");

  // edit modal
  const [editOrder, setEditOrder] = useState<LunchOrder | null>(null);
  const [saving, setSaving] = useState(false);

  // payment modal
  const [paymentOrder, setPaymentOrder] = useState<LunchOrder | null>(null);

  // create modal
  const [showCreate, setShowCreate] = useState(false);
  const [autoSendSessionId, setAutoSendSessionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // 주소 정규화 상태 (모달 open 시 자동 1회, 실패 시 원문 유지)
  const [lunchAddrNormState, setLunchAddrNormState] = useState<"idle" | "loading" | "success" | "failed">("idle");
  const lunchAddrNormTrigger = useRef<string>("");

  // chat view selected order
  const [chatSelectedId, setChatSelectedId] = useState<string | null>(null);

  // timerRef 제거 (자동 동기화 불필요)
  // lastSyncRef 제거 (시트 동기화 불필요)

  // 지역별 가격표 (출장비 계산용 — 로컬 JSON 직접 사용)
  const regionPrices = regionPricesJson as { region: string; price1: number; lunchSmall?: number }[];

  // vendor map for quick lookup
  const vendorMap = useMemo(() => {
    const map = new Map<string, LunchVendor>();
    for (const v of vendors) {
      map.set(v.id, v);
      map.set(v.name, v);
    }
    return map;
  }, [vendors]);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [oRes, vRes] = await Promise.all([
        fetch("/api/lunch"),
        fetch("/api/lunch?type=vendors"),
      ]);
      const oData = await oRes.json();
      const vData = await vRes.json();
      setOrders(oData.orders || []);
      setVendors(vData.vendors || []);
      // data loaded
    } catch {
      if (!silent) toast.error("데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Filter & Sort ───────────────────────────

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (settlementFilter !== "all" && o.settlementType !== settlementFilter) return false;
      if (dateFilter && o.date !== dateFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const searchable = [o.vendorName, o.pickupAddress, o.siteContact, o.orderNumber, o.notes].join(" ").toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [orders, statusFilter, settlementFilter, dateFilter, searchTerm]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date": cmp = a.date.localeCompare(b.date); break;
        case "vendorName": cmp = a.vendorName.localeCompare(b.vendorName); break;
        case "totalAmount": cmp = a.totalAmount - b.totalAmount; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "settlementType": cmp = a.settlementType.localeCompare(b.settlementType); break;
        case "isPickedUp": cmp = (a.isPickedUp ? 1 : 0) - (b.isPickedUp ? 1 : 0); break;
        case "invoiceIssued": cmp = (a.invoiceIssued ? 1 : 0) - (b.invoiceIssued ? 1 : 0); break;
        default: cmp = a.date.localeCompare(b.date);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ─── Stats ───────────────────────────────────

  const stats = useMemo(() => {
    const active = orders.filter((o) => o.status !== "cancelled");
    const completed = active.filter((o) => o.status === "completed");
    const payReq = active.filter((o) => o.status === "payment_requested");
    const confirmed = active.filter((o) => o.status === "confirmed");
    return {
      totalAmount: active.reduce((s, o) => s + o.totalAmount, 0),
      totalCount: active.length,
      completedAmount: completed.reduce((s, o) => s + o.totalAmount, 0),
      completedCount: completed.length,
      unsettledAmount: payReq.reduce((s, o) => s + o.totalAmount, 0),
      unsettledCount: payReq.length,
      confirmedAmount: confirmed.reduce((s, o) => s + o.totalAmount, 0),
      confirmedCount: confirmed.length,
    };
  }, [orders]);

  // ─── Helpers ─────────────────────────────────

  const getVendorPhone = (order: LunchOrder): string => {
    if (order.vendorId) {
      const v = vendorMap.get(order.vendorId);
      if (v?.ownerPhone) return v.ownerPhone;
    }
    const v = vendorMap.get(order.vendorName);
    if (v?.ownerPhone) return v.ownerPhone;
    return "";
  };

  const formatPhone = (phone: string) => {
    if (!phone) return "-";
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return phone;
  };

  const formatAmount = (n: number) => {
    if (!n) return "-";
    return `${n.toLocaleString()}원`;
  };

  const getSettlementLabel = (st: LunchSettlementType) => SETTLEMENT_LABELS[st] || st;

  const getSettlementColor = (st: LunchSettlementType) => {
    switch (st) {
      case "link_pay": return { bg: "var(--app-tag-orange-bg)", text: "var(--app-tag-orange-text)" };
      case "monthly_invoice": return { bg: "var(--app-tag-purple-bg)", text: "var(--app-tag-purple-text)" };
      case "tax_invoice": return { bg: "var(--app-tag-blue-bg)", text: "var(--app-accent)" };
    }
  };

  const getStatusText = (o: LunchOrder) => {
    if (o.status === "completed") return "정산 완료";
    if (o.status === "payment_requested") return "미정산";
    return "";
  };

  const getStatusBadge = (status: LunchOrder["status"]) => {
    const map: Record<string, { label: string; bg: string; color: string }> = {
      confirmed: { label: "일정확정", bg: "var(--app-tag-blue-bg)", color: "var(--app-accent)" },
      payment_requested: { label: "결제요청", bg: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)" },
      completed: { label: "완료", bg: "var(--app-tag-green-bg)", color: "var(--app-tag-green-text)" },
      cancelled: { label: "취소", bg: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)" },
    };
    return map[status] || { label: status, bg: "var(--app-bg)", color: "var(--app-text-tertiary)" };
  };

  // ─── Checkbox logic ──────────────────────────

  const paginatedIds = paginated.map((o) => o.id);
  const allPageSelected = paginatedIds.length > 0 && paginatedIds.every((id) => selectedRows.has(id));

  const toggleSelectAll = () => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedIds.forEach((id) => next.delete(id));
      } else {
        paginatedIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ─── Bulk Payment ────────────────────────────

  const handleBulkPayment = async () => {
    if (selectedRows.size === 0) return;

    const targets = orders
      .filter((o) => selectedRows.has(o.id))
      .map((o) => ({
        id: o.id,
        vendorName: o.vendorName,
        ownerPhone: getVendorPhone(o),
        totalAmount: o.totalAmount,
      }));

    const invalid = targets.filter((t) => !t.totalAmount || t.totalAmount <= 0 || !t.ownerPhone || t.ownerPhone.replace(/\D/g, "").length < 10);
    if (invalid.length > 0) {
      const names = invalid.map((t) => t.vendorName).join(", ");
      toast.error(`금액 또는 연락처가 없는 건이 있습니다: ${names}`);
      return;
    }

    const methodLabel = bulkSendMethod === "2" ? "카카오톡" : "SMS";
    if (!confirm(`${targets.length}건에 ${methodLabel}으로 결제 링크를 발송하시겠습니까?`)) return;

    setSending(true);
    try {
      const res = await fetch("/api/lunch/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendType: bulkSendMethod, rows: targets }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`결제 발송: 성공 ${data.successCount}건, 실패 ${data.failCount}건`);
        data.results?.filter((r: { success: boolean }) => !r.success).forEach((r: { vendorName: string; message: string }) => {
          toast.error(`${r.vendorName}: ${r.message}`);
        });
        setSelectedRows(new Set());
        fetchData(true);
      } else {
        toast.error(data.error || "결제 발송 실패");
      }
    } catch {
      toast.error("결제 발송 중 오류 발생");
    } finally {
      setSending(false);
    }
  };

  // ─── Edit ────────────────────────────────────

  const [editForm, setEditForm] = useState({
    date: "",
    timeAmPm: "오후" as string,
    timeHour: "",
    timeMinute: "00",
    boxCount: "",
    pickupAddress: "",
    siteContact: "",
    ownerPhone: "",
    notes: "",
    sortingPrice: 0,
    totalAmount: 0,
    settlementType: "link_pay" as LunchSettlementType,
    isPickedUp: false,
    invoiceIssued: false,
    status: "confirmed" as LunchOrderStatus,
  });

  const handleDelete = async (o: LunchOrder) => {
    if (!confirm(`"${o.vendorName}" (${o.date}) 주문을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch("/api/lunch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("삭제되었습니다");
      fetchData(true);
    } catch {
      toast.error("삭제 실패");
    }
  };

  const openEdit = (o: LunchOrder) => {
    setEditOrder(o);
    const v = vendorMap.get(o.vendorId || "") || vendorMap.get(o.vendorName);
    // 시간 파싱: "오후 2:00" → amPm=오후, hour=2, minute=00 / "야간" → amPm=야간
    let timeAmPm = "오후", timeHour = "", timeMinute = "00";
    const pt = o.pickupTime || "";
    if (pt.includes("야간")) {
      timeAmPm = "야간";
    } else {
      const tm = pt.match(/(오전|오후)\s*(\d{1,2}):?(\d{0,2})/);
      if (tm) { timeAmPm = tm[1]; timeHour = tm[2]; timeMinute = tm[3] || "00"; }
      else { timeHour = ""; }
    }
    setEditForm({
      date: o.date,
      timeAmPm, timeHour, timeMinute,
      boxCount: o.boxCount,
      pickupAddress: o.pickupAddress,
      siteContact: o.siteContact,
      ownerPhone: v?.ownerPhone || getVendorPhone(o),
      notes: o.notes,
      sortingPrice: o.sortingPrice,
      totalAmount: o.totalAmount,
      settlementType: o.settlementType,
      isPickedUp: o.isPickedUp,
      invoiceIssued: o.invoiceIssued,
      status: o.status,
    });
  };

  const handleSave = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      // 시간 조합
      const pickupTime = editForm.timeAmPm === "야간"
        ? "야간"
        : editForm.timeHour
          ? `${editForm.timeAmPm} ${editForm.timeHour}:${editForm.timeMinute || "00"}`
          : "";
      const { ownerPhone, timeAmPm: _ta, timeHour: _th, timeMinute: _tm, ...rest } = editForm;
      const orderUpdates = { ...rest, pickupTime };
      const res = await fetch("/api/lunch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editOrder.id, updates: orderUpdates }),
      });
      if (!res.ok) throw new Error();

      // 벤더 사장님 연락처 업데이트
      if (ownerPhone) {
        const v = vendorMap.get(editOrder.vendorId || "") || vendorMap.get(editOrder.vendorName);
        if (v && v.ownerPhone !== ownerPhone) {
          await fetch(`/api/lunch/vendors/${v.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerPhone }),
          });
        }
      }

      toast.success("정보가 수정되었습니다");
      setEditOrder(null);
      fetchData(true);
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // ─── 모달 드래그 ──────────────────────────────
  const [modalPos, setModalPos] = useState({ x: -1, y: -1 }); // -1 = centered
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

  // ─── Create ──────────────────────────────────

  const [createForm, setCreateForm] = useState({
    vendorId: "" as string,
    vendorName: "",
    date: "",
    timeAmPm: "오후" as string,
    timeHour: "",
    timeMinute: "00",
    boxCount: "",
    pickupAddress: "",
    siteContact: "",
    ownerPhone: "",
    notes: "",
    totalAmount: "",
    sortingPrice: "",
    settlementType: "link_pay" as LunchSettlementType,
    businessNumber: "",
    representativeName: "",
    taxEmail: "",
  });
  const [vendorSearchFocused, setVendorSearchFocused] = useState(false);

  /** 주소에서 지역명(구/시) 추출 → 출장비 조회 (boxCount < 100 이면 lunchSmall 적용) */
  const extractTripFee = useCallback((address: string, boxCount?: number): { district: string | null; fee: number } => {
    if (!address || regionPrices.length === 0) return { district: null, fee: 0 };
    for (const rp of regionPrices) {
      if (!rp?.region) continue;
      const fee100 = rp.price1 ?? 0;
      const feeSmall = rp.lunchSmall ?? fee100;
      const boxes = boxCount ?? 100;
      const fee = boxes < 100 ? feeSmall : fee100;
      if (address.includes(rp.region)) return { district: rp.region, fee };
      const stripped = rp.region.replace(/[구시]$/, "");
      if (stripped.length >= 2 && address.includes(stripped)) return { district: rp.region, fee };
    }
    return { district: null, fee: 0 };
  }, [regionPrices]);

  /** 수정 모달: 필드 변경 시 최종금액 자동 계산 */
  const updateEditForm = useCallback((updates: Partial<typeof editForm>) => {
    setEditForm((f) => {
      const next = { ...f, ...updates };
      const isNight = next.timeAmPm === "야간";
      const boxes = parseInt(String(next.boxCount)) || 0;
      const sorting = typeof next.sortingPrice === "number" ? next.sortingPrice : (parseInt(String(next.sortingPrice)) || 0);
      next.sortingPrice = sorting;
      if (isNight) {
        next.totalAmount = Math.max(sorting * boxes, boxes > 0 ? 10000 : 0);
      } else {
        const fee = extractTripFee(next.pickupAddress || "", boxes).fee ?? 0;
        next.totalAmount = fee + sorting * boxes;
      }
      return next;
    });
  }, [extractTripFee]);

  /** 최종 정산금액 자동 계산 */
  const calcTotal = useCallback((address: string, boxCount: string, sortingPrice: string, isNight: boolean) => {
    const boxes = parseInt(boxCount) || 0;
    const sorting = parseInt((sortingPrice || "0").replace(/[^0-9]/g, "")) || 0;
    const sortingTotal = sorting * boxes;

    if (isNight) {
      // 야간: 선별가격 × 도시락개수 (최소 1만원)
      return boxes > 0 ? Math.max(sortingTotal, 10000) : 0;
    }
    // 주간: 출장비 + (선별가격 × 도시락개수)
    const { fee } = extractTripFee(address, boxes);
    return (fee || 0) + sortingTotal;
  }, [extractTripFee]);

  /** createForm 변경 시 자동 계산 */
  const updateCreateForm = useCallback((updates: Partial<typeof createForm>) => {
    setCreateForm((f) => {
      const next = { ...f, ...updates };
      const isNight = next.timeAmPm === "야간";
      const auto = calcTotal(next.pickupAddress, next.boxCount, next.sortingPrice, isNight);
      return { ...next, totalAmount: auto > 0 ? auto.toLocaleString() : "" };
    });
  }, [calcTotal]);

  const vendorSuggestions = useMemo(() => {
    if (!createForm.vendorName) return vendors.filter((v) => v.isActive).slice(0, 10);
    const q = createForm.vendorName.toLowerCase();
    return vendors.filter((v) => v.isActive && v.name.toLowerCase().includes(q)).slice(0, 10);
  }, [vendors, createForm.vendorName]);

  // 모달 open 시 주소 자동 정규화 (1회, trigger ref로 중복 방지)
  useEffect(() => {
    if (!showCreate) {
      lunchAddrNormTrigger.current = "";
      setLunchAddrNormState("idle");
      return;
    }
    const addr = createForm.pickupAddress.trim();
    if (addr.length < 4) return;
    // 같은 주소 중복 정규화 방지
    if (lunchAddrNormTrigger.current === addr) return;
    lunchAddrNormTrigger.current = addr;
    setLunchAddrNormState("loading");
    (async () => {
      try {
        const res = await fetch("/api/address/normalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr }),
        });
        const data = await res.json();
        if (res.ok && data.matched) {
          const combined = data.detail ? `${data.fullAddress} ${data.detail}`.trim() : data.fullAddress;
          if (combined !== addr) {
            updateCreateForm({ pickupAddress: combined });
          }
          setLunchAddrNormState("success");
        } else {
          setLunchAddrNormState("failed");
        }
      } catch {
        setLunchAddrNormState("failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate, createForm.pickupAddress]);

  const resetCreateForm = () => {
    setCreateForm({
      vendorId: "", vendorName: "",
      date: "", timeAmPm: "오후", timeHour: "", timeMinute: "00",
      boxCount: "", pickupAddress: "", siteContact: "", ownerPhone: "",
      notes: "", totalAmount: "", sortingPrice: "",
      businessNumber: "", representativeName: "", taxEmail: "",
      settlementType: "link_pay",
    });
  };

  const selectVendor = (v: LunchVendor) => {
    setCreateForm((f) => ({
      ...f,
      vendorId: v.id,
      vendorName: v.name,
      // 수거주소는 매번 다르므로 자동입력 안 함
      settlementType: (v.settlementType as LunchSettlementType) || f.settlementType,
    }));
    setVendorSearchFocused(false);
  };

  const handleCreate = async () => {
    const name = createForm.vendorId ? (vendors.find((v) => v.id === createForm.vendorId)?.name || createForm.vendorName) : createForm.vendorName;
    if (!name || !createForm.date) {
      toast.error("지점명과 날짜는 필수입니다");
      return;
    }
    // 과거 날짜 차단
    {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(`${createForm.date}T00:00:00`);
      if (target < today) {
        toast.error("과거 날짜로는 예약할 수 없습니다. 날짜를 확인해 주세요.", { duration: 5000 });
        return;
      }
    }
    setCreating(true);
    try {
      const pickupTime = createForm.timeAmPm === "야간"
        ? "야간"
        : createForm.timeHour
          ? `${createForm.timeAmPm} ${createForm.timeHour}:${createForm.timeMinute || "00"}`
          : "";
      const res = await fetch("/api/lunch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: {
            vendorName: name,
            vendorId: createForm.vendorId || null,
            date: createForm.date,
            pickupTime,
            boxCount: createForm.boxCount,
            pickupAddress: createForm.pickupAddress,
            siteContact: createForm.siteContact,
            ownerPhone: createForm.ownerPhone || "",
            businessNumber: createForm.businessNumber || "",
            representativeName: createForm.representativeName || "",
            taxEmail: createForm.taxEmail || "",
            notes: createForm.notes,
            totalAmount: parseInt(createForm.totalAmount.replace(/[^0-9]/g, "")) || 0,
            sortingPrice: parseInt(createForm.sortingPrice.replace(/[^0-9]/g, "")) || 0,
            settlementType: createForm.settlementType,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "등록 실패");
      toast.success("등록되었습니다");
      setShowCreate(false);
      resetCreateForm();
      await fetchData(true);

      // 채팅에서 등록한 경우 결제 안내 메시지 자동 발송
      if (autoSendSessionId) {
        const isCardPay = createForm.settlementType === "link_pay";
        const message = isCardPay
          ? `예약이 완료되었습니다! 결제 관련 안내 말씀드립니다.

📌 카드 결제
수거 완료 익일 오후 3시에 결제 링크가 발송됩니다.
(발송일로부터 7일 이내 결제 진행 부탁드립니다.)
정책이 변경되어 이전 결제 미확인시 다음 예약이 불가합니다 !`
          : `예약이 완료되었습니다! 결제 관련 안내 말씀드립니다.

📌 계좌 이체
안내해 드린 금액 입금 후 채널로 문의 주시면 확인 도와드리겠습니다.
하나은행 274-910018-04204 (주)커버링
정책이 변경되어 이전 결제 미확인시 다음 예약이 불가합니다 ! (월말정산 제외)

📌 세금계산서
매주 금요일에 발행해 드리고 있습니다.`;
        try {
          const sendRes = await fetch(`/api/lunch/conversations/${autoSendSessionId}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, suppressDuplicateWindow: 3600 }),
          });
          if (sendRes.ok) {
            const d = await sendRes.json().catch(() => ({}));
            if (d.skipped) {
              const prev = d.previousAt ? new Date(d.previousAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "";
              toast(`결제 안내는 1시간 이내 이미 발송됨 (${prev}) — 중복 차단`, { icon: "⏱️" });
            } else {
              toast.success("결제 안내 메시지 발송 완료");
            }
          } else {
            const d = await sendRes.json().catch(() => ({}));
            toast.error(`메시지 발송 실패: ${d.detail || d.error || sendRes.status}`);
          }
        } catch { toast.error("메시지 발송 오류"); }
        setAutoSendSessionId(null);
      }

      // 등록된 주문으로 채팅뷰 이동
      if (data.order?.id) {
        setChatSelectedId(data.order.id);
        setViewMode("chat");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setCreating(false);
    }
  };

  // ─── Input Style ─────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 12px", fontSize: 14,
    border: "1px solid var(--app-input-border)", borderRadius: 8,
    outline: "none", boxSizing: "border-box",
  };

  // ─── Loading ─────────────────────────────────

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
        <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 15 }}>데이터 로딩 중...</span>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────

  // 예약(목록) 뷰일 때는 전체 영역 사용 (conversations 패턴)
  if (viewMode !== "chat") {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

        {/* 뷰 전환 탭 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          padding: "0 24px",
          borderBottom: "1px solid var(--app-border)",
          backgroundColor: "var(--app-surface)",
          flexShrink: 0,
        }}>
          {([
            { key: "chat" as ViewMode, label: "상담", icon: MessageSquare },
            { key: "orders" as ViewMode, label: "예약", icon: Calendar },
            { key: "invoices" as ViewMode, label: "세금계산서", icon: FileText },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 48, padding: "0 16px",
                fontSize: 14, fontWeight: viewMode === key ? 600 : 400,
                color: viewMode === key ? "var(--app-accent)" : "var(--app-text-tertiary)",
                borderBottom: viewMode === key ? "2px solid var(--app-accent)" : "2px solid transparent",
                background: "none", cursor: "pointer",
                border: "none", borderBottomStyle: "solid", borderBottomWidth: 2,
                borderBottomColor: viewMode === key ? "var(--app-accent)" : "transparent",
              }}
            >
              <Icon style={{ width: 16, height: 16 }} />
              {label}
            </button>
          ))}
        </div>

        {/* 세금계산서 탭 */}
        {viewMode === "invoices" && (
          <InvoiceListView vendors={vendors} orders={orders} onRefresh={() => fetchData(true)} />
        )}

        {/* 예약 목록 콘텐츠 */}
        {viewMode === "orders" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header + Stats */}
          <div style={{ padding: "20px 32px", borderBottom: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>예약 관리</h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {selectedRows.size > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {([{ value: "2" as const, label: "KKO" }, { value: "0" as const, label: "SMS" }]).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setBulkSendMethod(value)}
                        title={value === "2" ? "카카오톡" : "SMS"}
                        style={{
                          height: 34, padding: "0 10px", borderRadius: 8,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          backgroundColor: bulkSendMethod === value ? "var(--app-tag-purple-bg)" : "var(--app-surface-secondary)",
                          border: bulkSendMethod === value ? "2px solid var(--app-tag-purple-text)" : "1px solid var(--app-border)",
                          fontSize: 12, fontWeight: 600, cursor: "pointer",
                          color: bulkSendMethod === value ? "var(--app-tag-purple-text)" : "var(--app-text-secondary)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      onClick={handleBulkPayment}
                      disabled={sending}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "8px 16px", fontSize: 13, fontWeight: 600,
                        color: "var(--app-btn-primary-text)",
                        backgroundColor: sending ? "var(--app-border)" : "var(--app-accent)",
                        border: "none", borderRadius: 8,
                        cursor: sending ? "not-allowed" : "pointer", marginLeft: 4,
                      }}
                    >
                      {sending ? (
                        <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Send style={{ width: 14, height: 14 }} />
                      )}
                      {sending ? "발송 중..." : `결제전송 (${selectedRows.size}건)`}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowCreate(true)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", fontSize: 13, fontWeight: 600,
                    color: "var(--app-btn-primary-text)", backgroundColor: "var(--app-tag-purple-text)",
                    border: "none", borderRadius: 8, cursor: "pointer",
                  }}
                >
                  <Plus style={{ width: 14, height: 14 }} /> 신규등록
                </button>
                <button
                  onClick={async () => {
                    toast("미정산 건 조회 중...", { icon: "🔄" });
                    try {
                      const res = await fetch("/api/lunch/payment/check-unsettled", { method: "POST" });
                      const data = await res.json();
                      if (data.updated > 0) toast.success(`${data.updated}건 정산완료 업데이트`);
                      else toast.success("새로고침 완료");
                    } catch { toast.success("새로고침 완료"); }
                    fetchData();
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", fontSize: 13, fontWeight: 600,
                    color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
                    border: "none", borderRadius: 8, cursor: "pointer",
                  }}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} /> 새로고침
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "총 금액", value: stats.totalAmount, count: stats.totalCount, color: "var(--app-text-primary)" },
                { label: "정산완료", value: stats.completedAmount, count: stats.completedCount, color: "var(--app-btn-success-text)" },
                { label: "미정산", value: stats.unsettledAmount, count: stats.unsettledCount, color: "var(--app-btn-danger-text)" },
                { label: "진행중", value: stats.confirmedAmount, count: stats.confirmedCount, color: "var(--app-accent)" },
              ].map((s) => (
                <div key={s.label} style={{ padding: "12px 20px", backgroundColor: "var(--app-bg)", borderRadius: 10, minWidth: 140 }}>
                  <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 4 }}>{s.label} ({s.count}건)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}원</div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter + Table + Pagination + Modals (기존 목록 뷰) */}
        <>
          {/* Filter Bar */}
          {/* 필터 바 (방문수거 스타일) */}
          <div style={{
            padding: "12px 32px", backgroundColor: "var(--app-surface)",
            borderBottom: "1px solid var(--app-border)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>
              총 <strong style={{ color: "var(--app-text-primary)" }}>{sorted.length}건</strong>
            </span>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {/* 상태 필터 */}
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as LunchOrderStatus | "all"); setPage(0); }}
                style={{
                  padding: "7px 12px", fontSize: 13,
                  border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
                  color: statusFilter !== "all" ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
                  backgroundColor: "var(--app-surface)", cursor: "pointer",
                }}
              >
                <option value="all">전체 상태</option>
                <option value="confirmed">일정확정</option>
                <option value="payment_requested">결제요청</option>
                <option value="completed">정산완료</option>
                <option value="cancelled">취소</option>
              </select>

              {/* 정산방식 필터 */}
              <select
                value={settlementFilter}
                onChange={(e) => { setSettlementFilter(e.target.value as LunchSettlementType | "all"); setPage(0); }}
                style={{
                  padding: "7px 12px", fontSize: 13,
                  border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
                  color: settlementFilter !== "all" ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
                  backgroundColor: "var(--app-surface)", cursor: "pointer",
                }}
              >
                <option value="all">전체 정산</option>
                <option value="link_pay">링크페이</option>
                <option value="monthly_invoice">월말정산</option>
                <option value="tax_invoice">세금계산서</option>
              </select>

              {/* 날짜 */}
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Calendar style={{
                  width: 14, height: 14, color: "var(--app-text-tertiary)",
                  position: "absolute", left: 10, pointerEvents: "none",
                }} />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => { setDateFilter(e.target.value); setPage(0); }}
                  style={{
                    width: 160, padding: "7px 12px 7px 30px", fontSize: 13,
                    border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
                    color: dateFilter ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
                  }}
                />
                {dateFilter && (
                  <button
                    onClick={() => { setDateFilter(""); setPage(0); }}
                    style={{
                      position: "absolute", right: 6, width: 18, height: 18,
                      borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      backgroundColor: "var(--app-border)", border: "none", cursor: "pointer", padding: 0,
                    }}
                  >
                    <X style={{ width: 10, height: 10, color: "var(--app-text-secondary)" }} />
                  </button>
                )}
              </div>

              {/* 검색 */}
              <div style={{ position: "relative" }}>
                <Search style={{
                  width: 14, height: 14, color: "var(--app-text-tertiary)",
                  position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                }} />
                <input
                  type="text"
                  placeholder="검색 (지점명, 주소, 순번 등)"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  style={{
                    width: 240, padding: "7px 12px 7px 30px", fontSize: 13,
                    border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 32px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--app-bg)", position: "sticky", top: 0, zIndex: 1 }}>
                  <Th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                  </Th>
                  {HEADERS.map((h, idx) => (
                    <Th
                      key={idx}
                      onClick={h.sortKey ? () => {
                        if (sortKey === h.sortKey) {
                          setSortOrder((s) => s === "asc" ? "desc" : "asc");
                        } else {
                          setSortKey(h.sortKey!);
                          setSortOrder("asc");
                        }
                        setPage(0);
                      } : undefined}
                      style={{ cursor: h.sortKey ? "pointer" : "default", userSelect: h.sortKey ? "none" : "auto" }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        {h.label}
                        {h.sortKey && sortKey === h.sortKey && (
                          sortOrder === "asc"
                            ? <ArrowUp style={{ width: 12, height: 12, color: "var(--app-accent)" }} />
                            : <ArrowDown style={{ width: 12, height: 12, color: "var(--app-accent)" }} />
                        )}
                      </span>
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={14} style={{ padding: 40, textAlign: "center", color: "var(--app-text-tertiary)" }}>데이터가 없습니다</td></tr>
                ) : (
                  paginated.map((o) => {
                    const isSelected = selectedRows.has(o.id);
                    const sColor = getSettlementColor(o.settlementType);
                    const sBadge = getStatusBadge(o.status);
                    const vendorPhone = getVendorPhone(o);
                    return (
                      <tr
                        key={o.id}
                        style={{
                          borderBottom: "1px solid var(--app-border-light)",
                          backgroundColor: isSelected ? "var(--app-selected-bg)" : "transparent",
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(o.id)}
                            style={{ cursor: "pointer", width: 16, height: 16 }}
                          />
                        </td>
                        {/* 주문번호 */}
                        <td style={{ padding: "10px 8px", color: "var(--app-text-tertiary)", fontSize: 11, fontFamily: "monospace" }}>{o.orderNumber}</td>
                        {/* 상태 */}
                        <td style={{ padding: "10px 8px" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 8px",
                            fontSize: 11, fontWeight: 600, borderRadius: 10,
                            backgroundColor: sBadge.bg, color: sBadge.color,
                            whiteSpace: "nowrap",
                          }}>{sBadge.label}</span>
                        </td>
                        {/* 날짜 */}
                        <td style={{ padding: "10px 8px", whiteSpace: "nowrap", fontSize: 12 }}>{o.date}</td>
                        {/* 지점명 */}
                        <td style={{ padding: "10px 8px", fontWeight: 600 }}>{o.vendorName}</td>
                        {/* 수거시간 / 개수 */}
                        <td style={{ padding: "10px 8px", fontSize: 12 }}>
                          <div>{o.pickupTime || "-"}</div>
                          {o.boxCount && <div style={{ color: "var(--app-text-tertiary)", fontSize: 11 }}>{o.boxCount}개</div>}
                        </td>
                        {/* 수거주소 */}
                        <td style={{
                          padding: "10px 8px", maxWidth: 200, fontSize: 12,
                          color: "var(--app-text-secondary)", lineHeight: 1.4,
                        }}>
                          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.pickupAddress}>
                            {o.pickupAddress || "-"}
                          </div>
                          {o.siteContact && (
                            <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                              현장: {o.siteContact}
                            </div>
                          )}
                        </td>
                        {/* 연락처 (사장님 + 현장) */}
                        <td style={{ padding: "10px 8px", fontSize: 12 }}>
                          {vendorPhone ? (
                            <div>
                              <div style={{ color: "var(--app-text-secondary)" }}>{formatPhone(vendorPhone)}</div>
                              <div style={{ fontSize: 10, color: "var(--app-text-tertiary)" }}>사장님</div>
                            </div>
                          ) : (
                            <span style={{ color: "var(--app-text-placeholder)" }}>-</span>
                          )}
                        </td>
                        {/* 금액 */}
                        <td style={{ padding: "10px 8px", fontWeight: 600 }}>
                          <div>{formatAmount(o.totalAmount)}</div>
                          {o.sortingPrice > 0 && (
                            <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 400 }}>선별 {o.sortingPrice.toLocaleString()}원</div>
                          )}
                        </td>
                        {/* 정산방식 */}
                        <td style={{ padding: "10px 8px" }}>
                          <span style={{
                            display: "inline-block", padding: "3px 8px",
                            fontSize: 11, fontWeight: 600, borderRadius: 10,
                            backgroundColor: sColor.bg, color: sColor.text,
                            whiteSpace: "nowrap",
                          }}>{getSettlementLabel(o.settlementType)}</span>
                        </td>
                        {/* 수거완료 */}
                        <td style={{ padding: "10px 8px" }}>
                          <StatusBadge value={o.isPickedUp ? "완료" : ""} goodText="완료" />
                        </td>
                        {/* 매출발행 */}
                        <td style={{ padding: "10px 8px" }}>
                          <StatusBadge value={o.invoiceIssued ? "발행 완료" : ""} goodText="발행 완료" />
                        </td>
                        {/* 비고 (현금영수증/세금계산서/메모) */}
                        <td style={{
                          padding: "10px 8px", fontSize: 12, color: "var(--app-text-secondary)",
                          maxWidth: 160, lineHeight: 1.4,
                        }}>
                          <div style={{
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                            overflow: "hidden", wordBreak: "break-all",
                          }} title={o.notes}>
                            {o.notes || "-"}
                          </div>
                        </td>
                        {/* Actions */}
                        <td style={{ padding: "10px 8px" }}>
                          <div style={{ display: "flex", gap: 4 }}>
                            {o.settlementType === "link_pay" && (
                              <button
                                onClick={() => setPaymentOrder(o)}
                                title={o.paymentIds.length > 0 ? "결제확인" : "결제전송"}
                                style={{
                                  width: 28, height: 28, borderRadius: 6,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  backgroundColor: o.paymentIds.length > 0 ? "var(--app-tag-purple-bg)" : "var(--app-tag-blue-bg)",
                                  border: "none", cursor: "pointer",
                                }}
                              >
                                <CreditCard style={{ width: 13, height: 13, color: o.paymentIds.length > 0 ? "var(--app-tag-purple-text)" : "var(--app-accent)" }} />
                              </button>
                            )}
                            <button
                              onClick={() => openEdit(o)}
                              title="수정"
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                backgroundColor: "var(--app-surface-secondary)", border: "none", cursor: "pointer",
                              }}
                            >
                              <Edit3 style={{ width: 13, height: 13, color: "var(--app-text-secondary)" }} />
                            </button>
                            <button
                              onClick={() => handleDelete(o)}
                              title="삭제"
                              style={{
                                width: 28, height: 28, borderRadius: 6,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                backgroundColor: "var(--app-surface-secondary)", border: "none", cursor: "pointer",
                              }}
                            >
                              <Trash2 style={{ width: 13, height: 13, color: "var(--app-btn-danger-text, #ef4444)" }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              padding: "12px 32px", borderTop: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            }}>
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: page === 0 ? "var(--app-surface-secondary)" : "var(--app-surface)",
                  border: "1px solid var(--app-border)", cursor: page === 0 ? "default" : "pointer",
                  opacity: page === 0 ? 0.5 : 1,
                }}
              >
                <ChevronLeft style={{ width: 16, height: 16 }} />
              </button>
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === -1 ? (
                  <span key={`dot-${i}`} style={{ width: 24, textAlign: "center", fontSize: 13, color: "var(--app-text-tertiary)" }}>...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      minWidth: 32, height: 32, borderRadius: 8, padding: "0 6px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      backgroundColor: page === p ? "var(--app-accent)" : "var(--app-surface)",
                      color: page === p ? "var(--app-btn-primary-text)" : "var(--app-text-primary)",
                      border: page === p ? "none" : "1px solid var(--app-border)",
                      fontSize: 13, fontWeight: page === p ? 600 : 400, cursor: "pointer",
                    }}
                  >
                    {p + 1}
                  </button>
                )
              )}
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: page >= totalPages - 1 ? "var(--app-surface-secondary)" : "var(--app-surface)",
                  border: "1px solid var(--app-border)", cursor: page >= totalPages - 1 ? "default" : "pointer",
                  opacity: page >= totalPages - 1 ? 0.5 : 1,
                }}
              >
                <ChevronRight style={{ width: 16, height: 16 }} />
              </button>
            </div>
          )}
        </>

      {/* Edit Modal */}
      {editOrder && (
        <div
          onClick={() => { setEditOrder(null); resetModalPos(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, maxHeight: "85vh", overflow: "auto",
              backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
              boxShadow: "var(--app-shadow-lg)",
              ...(modalPos.x >= 0 ? { position: "fixed" as const, top: modalPos.y, left: modalPos.x } : {}),
            }}
          >
            <div onMouseDown={onDragStart} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", cursor: "grab", userSelect: "none" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>주문 정보 수정</h2>
                <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "4px 0 0" }}>
                  #{editOrder.orderNumber} · {editOrder.vendorName} · {editOrder.date}
                </p>
              </div>
              <button
                onClick={() => { setEditOrder(null); resetModalPos(); }}
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
              {/* 날짜 + 수거시간 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <ModalField label="수거일" required>
                  <input type="date" value={editForm.date} onChange={(e) => updateEditForm({ date: e.target.value })} style={inputStyle} />
                </ModalField>
                <ModalField label="수거시간" required>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select value={editForm.timeAmPm} onChange={(e) => updateEditForm({ timeAmPm: e.target.value })}
                      style={{ padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                      <option value="오전">오전</option>
                      <option value="오후">오후</option>
                      <option value="야간">야간</option>
                    </select>
                    {editForm.timeAmPm !== "야간" && (
                      <>
                        <input value={editForm.timeHour} onChange={(e) => updateEditForm({ timeHour: e.target.value })}
                          placeholder="시" style={{ width: 50, padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, textAlign: "center" }} />
                        <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                        <input value={editForm.timeMinute} onChange={(e) => updateEditForm({ timeMinute: e.target.value })}
                          placeholder="분" style={{ width: 50, padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, textAlign: "center" }} />
                      </>
                    )}
                  </div>
                  {editForm.timeAmPm === "야간" && (
                    <div style={{ fontSize: 11, color: "var(--app-tag-purple-text)", marginTop: 4, fontWeight: 500 }}>
                      야간 수거 (출장비 없음, 최소 1만원)
                    </div>
                  )}
                </ModalField>
              </div>

              {/* 도시락 개수 + 현장 담당자 */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <ModalField label="도시락 개수" required>
                  <input value={editForm.boxCount} onChange={(e) => updateEditForm({ boxCount: e.target.value })} placeholder="50" style={inputStyle} />
                </ModalField>
                <ModalField label="현장 담당자">
                  <input value={editForm.siteContact} onChange={(e) => setEditForm({ ...editForm, siteContact: e.target.value })} placeholder="담당자명 / 연락처" style={inputStyle} />
                </ModalField>
              </div>

              {/* 사장님 연락처 */}
              <ModalField label="사장님 연락처 (결제용)">
                <input value={editForm.ownerPhone} onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let formatted = digits;
                  if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                  else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                  setEditForm({ ...editForm, ownerPhone: formatted });
                }} placeholder="010-0000-0000" style={inputStyle} />
              </ModalField>

              {/* 수거주소 */}
              <ModalField label="수거주소" required>
                <input value={editForm.pickupAddress} onChange={(e) => updateEditForm({ pickupAddress: e.target.value })} placeholder="서울시 강남구 ..." style={inputStyle} />
              </ModalField>

              <ModalField label="비고">
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} placeholder="현금영수증/세금계산서 이메일, 특이사항 등" style={{ ...inputStyle, resize: "vertical" }} />
              </ModalField>
              <div style={{ display: "flex", gap: 12 }}>
                <ModalField label="선별가격" style={{ flex: 1 }}>
                  <input
                    value={editForm.sortingPrice || ""}
                    onChange={(e) => updateEditForm({ sortingPrice: parseInt(e.target.value.replace(/\D/g, "")) || 0 })}
                    placeholder="0"
                    style={inputStyle}
                  />
                </ModalField>
                <ModalField label="최종 정산금액" style={{ flex: 1 }}>
                  <input
                    value={editForm.totalAmount || ""}
                    onChange={(e) => setEditForm({ ...editForm, totalAmount: parseInt(e.target.value.replace(/\D/g, "")) || 0 })}
                    placeholder="자동 계산"
                    style={{ ...inputStyle, backgroundColor: "var(--app-surface-secondary)" }}
                  />
                  {(() => {
                    const isNight = editForm.timeAmPm === "야간";
                    const boxes = parseInt(editForm.boxCount) || 0;
                    const sorting = editForm.sortingPrice || 0;
                    const fee = isNight ? 0 : (extractTripFee(editForm.pickupAddress || "", boxes).fee ?? 0);
                    const calc = isNight ? Math.max(sorting * boxes, boxes > 0 ? 10000 : 0) : fee + sorting * boxes;
                    return (
                      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>
                        {isNight
                          ? `선별(${sorting.toLocaleString()}) x ${boxes}개 = ${(sorting * boxes).toLocaleString()}원${sorting * boxes < 10000 && boxes > 0 ? " → 최소 10,000원" : ""}`
                          : `출장비(${fee.toLocaleString()}${boxes < 100 ? " ·100↓" : ""}) + 선별(${sorting.toLocaleString()}) x ${boxes}개 = ${calc.toLocaleString()}원`
                        }
                      </div>
                    );
                  })()}
                </ModalField>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <ModalField label="수거완료" style={{ flex: 1 }}>
                  <select
                    value={editForm.isPickedUp ? "true" : "false"}
                    onChange={(e) => setEditForm({ ...editForm, isPickedUp: e.target.value === "true" })}
                    style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="false">미완료</option>
                    <option value="true">완료</option>
                  </select>
                </ModalField>
                <ModalField label="매출발행" style={{ flex: 1 }}>
                  <select
                    value={editForm.invoiceIssued ? "true" : "false"}
                    onChange={(e) => setEditForm({ ...editForm, invoiceIssued: e.target.value === "true" })}
                    style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="false">미발행</option>
                    <option value="true">발행 완료</option>
                  </select>
                </ModalField>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <ModalField label="정산방식" style={{ flex: 1 }}>
                  <select
                    value={editForm.settlementType}
                    onChange={(e) => setEditForm({ ...editForm, settlementType: e.target.value as LunchSettlementType })}
                    style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="link_pay">링크페이</option>
                    <option value="monthly_invoice">월말정산</option>
                    <option value="tax_invoice">세금계산서</option>
                  </select>
                </ModalField>
                <ModalField label="상태" style={{ flex: 1 }}>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as LunchOrderStatus })}
                    style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}
                  >
                    <option value="confirmed">일정확정</option>
                    <option value="payment_requested">결제요청</option>
                    <option value="completed">정산완료</option>
                    <option value="cancelled">취소</option>
                  </select>
                </ModalField>
              </div>

              {/* 세금계산서 사업자 정보 — 링크페이 아닌 경우만 */}
              {editForm.settlementType !== "link_pay" && editOrder && (() => {
                const v = vendorMap.get(editOrder.vendorId || "") || vendorMap.get(editOrder.vendorName);
                if (!v) return null;
                return (
                  <EditVendorTaxInfo vendor={v} inputStyle={inputStyle} onSaved={() => fetchData(true)} />
                );
              })()}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
              <button onClick={() => setEditOrder(null)} style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 500,
                color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
                border: "none", borderRadius: 8, cursor: "pointer",
              }}>취소</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 600,
                color: "var(--app-btn-primary-text)", backgroundColor: saving ? "var(--app-border)" : "var(--app-accent)",
                border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
              }}>{saving ? "저장 중..." : "저장"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div onClick={() => { setShowCreate(false); resetModalPos(); }} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          backgroundColor: "var(--app-modal-backdrop)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 500, maxHeight: "85vh", overflow: "auto",
            backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
            boxShadow: "var(--app-shadow-lg)",
            ...(modalPos.x >= 0 ? { position: "fixed", top: modalPos.y, left: modalPos.x } : {}),
          }}>
            <div onMouseDown={onDragStart} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px 16px", cursor: "grab", userSelect: "none",
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>런치 신규 등록</h2>
              <button onClick={() => { setShowCreate(false); resetModalPos(); }} style={{
                width: 32, height: 32, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none", cursor: "pointer",
              }}><X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} /></button>
            </div>
            <div style={{ padding: "0 24px 24px" }}>

            <LunchCreateFormFields
              createForm={createForm}
              updateCreateForm={updateCreateForm}
              setCreateForm={setCreateForm}
              vendorSearchFocused={vendorSearchFocused}
              setVendorSearchFocused={setVendorSearchFocused}
              vendorSuggestions={vendorSuggestions}
              selectVendor={selectVendor}
              extractTripFee={extractTripFee}
              inputStyle={inputStyle}
            />

            <button onClick={handleCreate} disabled={creating || !createForm.vendorName} style={{
              marginTop: 20, width: "100%", height: 44, borderRadius: 10,
              backgroundColor: (creating || !createForm.vendorName) ? "var(--app-border)" : "var(--app-tag-purple-text)",
              color: "var(--app-btn-primary-text)", border: "none", fontSize: 14, fontWeight: 600,
              cursor: (creating || !createForm.vendorName) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {creating ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 16, height: 16 }} />}
              {creating ? "등록 중..." : "등록"}
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentOrder && (
        <LunchPaymentModal
          order={orders.find((o) => o.id === paymentOrder.id) || paymentOrder}
          ownerPhone={getVendorPhone(paymentOrder)}
          onClose={() => setPaymentOrder(null)}
          onRefresh={() => fetchData(true)}
        />
      )}
        </div>
        )}
      </div>
    );
  }

  // ─── Chat View (기본 화면) ──────────────────────
  return (
    <div className="h-full flex" style={{ backgroundColor: "var(--app-bg)" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <ChatView
        orders={orders}
        vendors={vendors}
        vendorMap={vendorMap}
        selectedId={chatSelectedId}
        onSelect={setChatSelectedId}
        getVendorPhone={getVendorPhone}
        formatAmount={formatAmount}
        formatPhone={formatPhone}
        setViewMode={setViewMode}
        onRefresh={() => fetchData(true)}
        onPaymentOrder={setPaymentOrder}
        onEditOrder={openEdit}
        extractTripFee={extractTripFee}
        regionPrices={regionPrices}
        onCreateOrder={(vendorId, vendorName, aiOrderDataStr, sessionId) => {
          resetCreateForm();
          setAutoSendSessionId(sessionId || null);
          // AI 주문 데이터로 모달 자동채움
          const aiData = aiOrderDataStr ? (() => { try { return JSON.parse(aiOrderDataStr); } catch { return null; } })() : null;
          if (aiData) {
            const settlementMap: Record<string, LunchSettlementType> = { link_pay: "link_pay", monthly_invoice: "monthly_invoice", tax_invoice: "tax_invoice" };
            setCreateForm(f => ({
              ...f,
              vendorId: vendorId || "",
              vendorName: aiData.vendorName || vendorName || "",
              date: aiData.date || "",
              timeAmPm: aiData.timeAmPm || "오후",
              timeHour: aiData.timeHour || "",
              timeMinute: aiData.timeMinute || "00",
              boxCount: aiData.boxCount || "",
              pickupAddress: aiData.pickupAddress || "",
              ownerPhone: aiData.ownerPhone || "",
              siteContact: aiData.siteContact || "",
              notes: aiData.notes || "",
              settlementType: settlementMap[aiData.settlementType] || f.settlementType,
            }));
          } else if (vendorId && vendorName) {
            const v = vendors.find(vv => vv.id === vendorId);
            setCreateForm(f => ({
              ...f,
              vendorId: vendorId,
              vendorName: vendorName,
              settlementType: (v?.settlementType as LunchSettlementType) || f.settlementType,
            }));
          }
          setShowCreate(true);
        }}
      />

      {/* Create Modal (chat뷰에서도 동일한 신규등록 모달) */}
      {showCreate && (
        <div onClick={() => { setShowCreate(false); resetModalPos(); }} style={{
          position: "fixed", inset: 0, zIndex: 1000,
          backgroundColor: "var(--app-modal-backdrop)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            width: 500, maxHeight: "85vh", overflow: "auto",
            backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
            boxShadow: "var(--app-shadow-lg)",
            ...(modalPos.x >= 0 ? { position: "fixed", top: modalPos.y, left: modalPos.x } : {}),
          }}>
            <div onMouseDown={onDragStart} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px 16px", cursor: "grab", userSelect: "none",
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>런치 신규 등록</h2>
              <button onClick={() => { setShowCreate(false); resetModalPos(); }} style={{
                width: 32, height: 32, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none", cursor: "pointer",
              }}><X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} /></button>
            </div>
            <div style={{ padding: "0 24px 24px" }}>

            <LunchCreateFormFields
              createForm={createForm}
              updateCreateForm={updateCreateForm}
              setCreateForm={setCreateForm}
              vendorSearchFocused={vendorSearchFocused}
              setVendorSearchFocused={setVendorSearchFocused}
              vendorSuggestions={vendorSuggestions}
              selectVendor={selectVendor}
              extractTripFee={extractTripFee}
              inputStyle={inputStyle}
            />

            <button onClick={handleCreate} disabled={creating || !createForm.vendorName} style={{
              marginTop: 20, width: "100%", height: 44, borderRadius: 10,
              backgroundColor: (creating || !createForm.vendorName) ? "var(--app-border)" : "var(--app-tag-purple-text)",
              color: "var(--app-btn-primary-text)", border: "none", fontSize: 14, fontWeight: 600,
              cursor: (creating || !createForm.vendorName) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {creating ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 16, height: 16 }} />}
              {creating ? "등록 중..." : "등록"}
            </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentOrder && (
        <LunchPaymentModal
          order={orders.find((o) => o.id === paymentOrder.id) || paymentOrder}
          ownerPhone={getVendorPhone(paymentOrder)}
          onClose={() => setPaymentOrder(null)}
          onRefresh={() => fetchData(true)}
        />
      )}

      {/* Edit Modal (ChatView에서도 수정 버튼 동작) */}
      {editOrder && (
        <div
          onClick={() => { setEditOrder(null); resetModalPos(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520, maxHeight: "85vh", overflow: "auto",
              backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
              boxShadow: "var(--app-shadow-lg)",
              ...(modalPos.x >= 0 ? { position: "fixed" as const, top: modalPos.y, left: modalPos.x } : {}),
            }}
          >
            <div onMouseDown={onDragStart} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 16px", cursor: "grab", userSelect: "none" }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>주문 정보 수정</h2>
                <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "4px 0 0" }}>
                  #{editOrder.orderNumber} · {editOrder.vendorName} · {editOrder.date}
                </p>
              </div>
              <button onClick={() => { setEditOrder(null); resetModalPos(); }} style={{
                width: 32, height: 32, borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none", cursor: "pointer",
              }}>
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 24px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <ModalField label="수거일" required>
                  <input type="date" value={editForm.date} onChange={(e) => updateEditForm({ date: e.target.value })} style={inputStyle} />
                </ModalField>
                <ModalField label="수거시간" required>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select value={editForm.timeAmPm} onChange={(e) => updateEditForm({ timeAmPm: e.target.value })}
                      style={{ padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                      <option value="오전">오전</option>
                      <option value="오후">오후</option>
                      <option value="야간">야간</option>
                    </select>
                    {editForm.timeAmPm !== "야간" && (
                      <>
                        <input value={editForm.timeHour} onChange={(e) => updateEditForm({ timeHour: e.target.value })}
                          placeholder="시" style={{ width: 50, padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, textAlign: "center" }} />
                        <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                        <input value={editForm.timeMinute} onChange={(e) => updateEditForm({ timeMinute: e.target.value })}
                          placeholder="분" style={{ width: 50, padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, textAlign: "center" }} />
                      </>
                    )}
                  </div>
                  {editForm.timeAmPm === "야간" && (
                    <div style={{ fontSize: 11, color: "var(--app-tag-purple-text)", marginTop: 4, fontWeight: 500 }}>
                      야간 수거 (출장비 없음, 최소 1만원)
                    </div>
                  )}
                </ModalField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <ModalField label="도시락 개수" required>
                  <input value={editForm.boxCount} onChange={(e) => updateEditForm({ boxCount: e.target.value })} placeholder="50" style={inputStyle} />
                </ModalField>
                <ModalField label="현장 담당자">
                  <input value={editForm.siteContact} onChange={(e) => setEditForm({ ...editForm, siteContact: e.target.value })} placeholder="담당자명 / 연락처" style={inputStyle} />
                </ModalField>
              </div>
              <ModalField label="사장님 연락처 (결제용)">
                <input value={editForm.ownerPhone} onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let formatted = digits;
                  if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                  else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                  setEditForm({ ...editForm, ownerPhone: formatted });
                }} placeholder="010-0000-0000" style={inputStyle} />
              </ModalField>
              <ModalField label="수거주소" required>
                <input value={editForm.pickupAddress} onChange={(e) => updateEditForm({ pickupAddress: e.target.value })} placeholder="서울시 강남구 ..." style={inputStyle} />
              </ModalField>
              <ModalField label="비고">
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} placeholder="현금영수증/세금계산서 이메일, 특이사항 등" style={{ ...inputStyle, resize: "vertical" }} />
              </ModalField>
              <div style={{ display: "flex", gap: 12 }}>
                <ModalField label="선별가격" style={{ flex: 1 }}>
                  <input value={editForm.sortingPrice || ""} onChange={(e) => updateEditForm({ sortingPrice: parseInt(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="0" style={inputStyle} />
                </ModalField>
                <ModalField label="최종 정산금액" style={{ flex: 1 }}>
                  <input value={editForm.totalAmount || ""} onChange={(e) => setEditForm({ ...editForm, totalAmount: parseInt(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="자동 계산" style={{ ...inputStyle, backgroundColor: "var(--app-surface-secondary)" }} />
                </ModalField>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <ModalField label="수거완료" style={{ flex: 1 }}>
                  <select value={editForm.isPickedUp ? "true" : "false"} onChange={(e) => setEditForm({ ...editForm, isPickedUp: e.target.value === "true" })} style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}>
                    <option value="false">미완료</option>
                    <option value="true">완료</option>
                  </select>
                </ModalField>
                <ModalField label="매출발행" style={{ flex: 1 }}>
                  <select value={editForm.invoiceIssued ? "true" : "false"} onChange={(e) => setEditForm({ ...editForm, invoiceIssued: e.target.value === "true" })} style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}>
                    <option value="false">미발행</option>
                    <option value="true">발행 완료</option>
                  </select>
                </ModalField>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <ModalField label="정산방식" style={{ flex: 1 }}>
                  <select value={editForm.settlementType} onChange={(e) => setEditForm({ ...editForm, settlementType: e.target.value as LunchSettlementType })} style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}>
                    <option value="link_pay">링크페이</option>
                    <option value="monthly_invoice">월말정산</option>
                    <option value="tax_invoice">세금계산서</option>
                  </select>
                </ModalField>
                <ModalField label="상태" style={{ flex: 1 }}>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as LunchOrderStatus })} style={{ ...inputStyle, backgroundColor: "var(--app-surface)" }}>
                    <option value="confirmed">일정확정</option>
                    <option value="payment_requested">결제요청</option>
                    <option value="completed">정산완료</option>
                    <option value="cancelled">취소</option>
                  </select>
                </ModalField>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={() => { setEditOrder(null); resetModalPos(); }} style={{
                  padding: "10px 20px", fontSize: 14, fontWeight: 500,
                  color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
                  border: "none", borderRadius: 8, cursor: "pointer",
                }}>취소</button>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: "10px 20px", fontSize: 14, fontWeight: 600,
                  color: "var(--app-btn-primary-text)", backgroundColor: saving ? "var(--app-border)" : "var(--app-accent)",
                  border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
                }}>{saving ? "저장 중..." : "저장"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


// ─── Helper Components ────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-primary)" }}>{children}</span>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

// ─── Table Header Definitions ─────────────────

const HEADERS: { label: string; sortKey?: string }[] = [
  { label: "주문번호" },
  { label: "상태", sortKey: "status" },
  { label: "날짜", sortKey: "date" },
  { label: "지점명", sortKey: "vendorName" },
  { label: "수거시간 / 개수" },
  { label: "수거주소" },
  { label: "연락처" },
  { label: "금액", sortKey: "totalAmount" },
  { label: "정산방식", sortKey: "settlementType" },
  { label: "수거", sortKey: "isPickedUp" },
  { label: "매출발행" },
  { label: "비고" },
  { label: "" },
];

// ─── Shared UI Components ─────────────────────

function Th({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "10px 8px", textAlign: "left",
        fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)",
        borderBottom: "1px solid var(--app-border)", whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function StatusBadge({ value, goodText }: { value: string; goodText: string }) {
  if (!value) return <span style={{ color: "var(--app-text-placeholder)", fontSize: 12 }}>-</span>;
  const isDone = value === goodText;
  return (
    <span style={{
      display: "inline-block", padding: "3px 8px",
      fontSize: 11, fontWeight: 600, borderRadius: 10,
      backgroundColor: isDone ? "var(--app-tag-green-bg)" : "var(--app-tag-orange-bg)",
      color: isDone ? "var(--app-tag-green-text)" : "var(--app-tag-orange-text)",
      whiteSpace: "nowrap",
    }}>{value}</span>
  );
}

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: number[] = [];
  pages.push(0);
  if (current > 2) pages.push(-1);
  for (let i = Math.max(1, current - 1); i <= Math.min(total - 2, current + 1); i++) pages.push(i);
  if (current < total - 3) pages.push(-1);
  pages.push(total - 1);
  return pages;
}

function ModalField({ label, children, style, required }: { label: string; children: React.ReactNode; style?: React.CSSProperties; required?: boolean }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>
        {label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any

function LunchCreateFormFields({ createForm, updateCreateForm, setCreateForm, vendorSearchFocused, setVendorSearchFocused, vendorSuggestions, selectVendor, extractTripFee, inputStyle }: any) {
  const isNight = createForm.timeAmPm === "야간";
  const boxes = parseInt(createForm.boxCount) || 0;
  const result = extractTripFee(createForm.pickupAddress, boxes) || { district: null, fee: 0 };
  const district = result.district ?? null;
  const tripFee = result.fee ?? 0;
  const sorting = parseInt((createForm.sortingPrice || "0").replace(/[^0-9]/g, "")) || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Vendor autocomplete */}
      <ModalField label="지점명" required>
        <div style={{ position: "relative" }}>
          <input
            value={createForm.vendorName}
            onChange={(e) => updateCreateForm({ vendorName: e.target.value, vendorId: "" })}
            onFocus={() => setVendorSearchFocused(true)}
            onBlur={() => setTimeout(() => setVendorSearchFocused(false), 200)}
            placeholder="지점명을 입력하세요 (예: 본도시락 당산점)"
            style={inputStyle}
            autoComplete="off"
          />
          {vendorSearchFocused && vendorSuggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
              backgroundColor: "var(--app-modal-bg)", border: "1px solid var(--app-border)",
              borderRadius: 8, boxShadow: "var(--app-shadow-lg)", maxHeight: 200, overflowY: "auto",
              marginTop: 4,
            }}>
              {vendorSuggestions.map((v: { id: string; name: string; address?: string }) => (
                <div
                  key={v.id}
                  onMouseDown={() => selectVendor(v)}
                  style={{
                    padding: "10px 12px", cursor: "pointer", fontSize: 13,
                    borderBottom: "1px solid var(--app-border-light)",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  <div style={{ fontWeight: 600, color: "var(--app-text-primary)" }}>{v.name}</div>
                  {v.address && <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>{v.address}</div>}
                </div>
              ))}
            </div>
          )}
          {createForm.vendorId && (
            <div style={{ fontSize: 11, color: "var(--app-accent)", marginTop: 4 }}>
              기존 지점 선택됨 — 정산방식 자동입력
            </div>
          )}
        </div>
      </ModalField>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ModalField label="날짜" required>
          <input type="date" value={createForm.date} onChange={(e) => updateCreateForm({ date: e.target.value })}
            style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </ModalField>
        <ModalField label="수거시간" required>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={createForm.timeAmPm} onChange={(e) => updateCreateForm({ timeAmPm: e.target.value })}
              style={{ padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
              <option value="오전">오전</option>
              <option value="오후">오후</option>
              <option value="야간">야간</option>
            </select>
            {!isNight && (
              <>
                <input value={createForm.timeHour} onChange={(e) => updateCreateForm({ timeHour: e.target.value })}
                  placeholder="시" style={{ width: 50, padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                <input value={createForm.timeMinute} onChange={(e) => updateCreateForm({ timeMinute: e.target.value })}
                  placeholder="분" style={{ width: 50, padding: "8px 6px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, textAlign: "center" }} />
              </>
            )}
          </div>
          {isNight && (
            <div style={{ fontSize: 11, color: "var(--app-tag-purple-text)", marginTop: 4, fontWeight: 500 }}>
              야간 수거 (출장비 없음, 최소 1만원)
            </div>
          )}
        </ModalField>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ModalField label="도시락 개수" required>
          <input value={createForm.boxCount} onChange={(e) => updateCreateForm({ boxCount: e.target.value })}
            placeholder="50" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </ModalField>
        <ModalField label="현장 담당자">
          <input value={createForm.siteContact} onChange={(e) => updateCreateForm({ siteContact: e.target.value })}
            placeholder="담당자명 / 연락처" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </ModalField>
      </div>

      {/* 새 지점일 때 사장님 연락처 입력 */}
      {!createForm.vendorId && (
        <ModalField label="사장님 연락처 (결제용)">
          <input value={createForm.ownerPhone} onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
            let formatted = digits;
            if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
            else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
            updateCreateForm({ ownerPhone: formatted });
          }}
            placeholder="010-0000-0000" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>
            새 지점 등록 시 결제 링크 발송용 연락처
          </div>
        </ModalField>
      )}

      <ModalField label="수거주소" required>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={createForm.pickupAddress} onChange={(e) => updateCreateForm({ pickupAddress: e.target.value })}
            placeholder="서울시 강남구 ..." style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          <button type="button" disabled={!createForm.pickupAddress.trim()}
            onClick={async () => {
              const addr = createForm.pickupAddress.trim();
              if (addr.length < 4) { toast.error("주소가 너무 짧습니다"); return; }
              try {
                const res = await fetch("/api/address/normalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr }) });
                const data = await res.json();
                if (!res.ok) { toast.error(data.error || "정규화 실패"); return; }
                if (!data.matched) { toast.error("매칭되는 주소 없음 (원문 유지)"); return; }
                const combined = data.detail ? `${data.fullAddress} ${data.detail}`.trim() : data.fullAddress;
                updateCreateForm({ pickupAddress: combined });
                toast.success(`정규화 완료: ${data.sigungu || ""}`);
              } catch { toast.error("정규화 네트워크 오류"); }
            }}
            style={{ padding: "8px 12px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 12, backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)", cursor: createForm.pickupAddress.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
            주소 정규화
          </button>
        </div>
        {!isNight && district && (
          <div style={{ fontSize: 11, color: "var(--app-accent)", marginTop: 4 }}>
            {district} — 출장비 {tripFee.toLocaleString()}원
          </div>
        )}
        {!isNight && createForm.pickupAddress && !district && (
          <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>
            지역을 매칭할 수 없습니다 (출장비 0원)
          </div>
        )}
      </ModalField>

      <ModalField label="선별가격" required>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {([
            { label: "500원", value: "500" },
            { label: "450원", value: "450" },
            { label: "400원", value: "400" },
            { label: "직접입력", value: "" },
          ]).map(({ label, value }) => {
            const isActive = value ? createForm.sortingPrice === value : !["500", "450", "400"].includes(createForm.sortingPrice);
            return (
              <button key={label} onClick={() => { if (value) updateCreateForm({ sortingPrice: value }); else updateCreateForm({ sortingPrice: "" }); }}
                style={{
                  flex: 1, padding: "7px 0", fontSize: 12, fontWeight: isActive ? 600 : 400, borderRadius: 6, cursor: "pointer",
                  backgroundColor: isActive ? "var(--app-accent)" : "var(--app-bg)",
                  color: isActive ? "white" : "var(--app-text-secondary)",
                  border: isActive ? "none" : "1px solid var(--app-border)",
                }}>{label}</button>
            );
          })}
        </div>
        {!["500", "450", "400"].includes(createForm.sortingPrice) && (
          <input value={createForm.sortingPrice} onChange={(e) => updateCreateForm({ sortingPrice: e.target.value })}
            placeholder="직접 입력 (원)" type="number" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        )}
      </ModalField>

      <ModalField label="최종 정산금액">
        <input value={createForm.totalAmount} onChange={(e) => setCreateForm((f: typeof createForm) => ({ ...f, totalAmount: e.target.value }))}
          placeholder="자동 계산" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", backgroundColor: "var(--app-surface-secondary)" }} />
        <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>
          {isNight
            ? `선별(${sorting.toLocaleString()}) × ${boxes}개 = ${(sorting * boxes).toLocaleString()}원${sorting * boxes < 10000 && boxes > 0 ? " → 최소 10,000원" : ""}`
            : `출장비(${tripFee.toLocaleString()}${boxes < 100 ? " ·100↓" : ""}) + 선별(${sorting.toLocaleString()}) × ${boxes}개 = ${(tripFee + sorting * boxes).toLocaleString()}원`
          }
        </div>
      </ModalField>

      <ModalField label="정산방식" required>
        <select value={createForm.settlementType} onChange={(e) => updateCreateForm({ settlementType: e.target.value })}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
          <option value="link_pay">링크페이</option>
          <option value="monthly_invoice">월말정산</option>
          <option value="tax_invoice">세금계산서</option>
        </select>
      </ModalField>

      {/* 세금계산서 사업자 정보 — 링크페이가 아닌 경우 */}
      {createForm.settlementType !== "link_pay" && (
        <CreateTaxInfoSection createForm={createForm} updateCreateForm={updateCreateForm} vendorSuggestions={vendorSuggestions} />
      )}

      <ModalField label="비고">
        <textarea value={createForm.notes} onChange={(e) => updateCreateForm({ notes: e.target.value })}
          rows={2} placeholder="현금영수증/세금계산서 이메일, 특이사항 등" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--app-border)", borderRadius: 8, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
      </ModalField>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CreateTaxInfoSection({ createForm, updateCreateForm, vendorSuggestions }: any) {
  const [uploading, setUploading] = useState(false);
  const certRef = useRef<HTMLInputElement>(null);
  const hasVendor = !!createForm.vendorId;
  // 기존 벤더 선택 시 벤더 정보 표시
  const selectedVendor = hasVendor ? vendorSuggestions.find((v: { id: string }) => v.id === createForm.vendorId) : null;

  const handleCertUpload = async (file: File) => {
    if (!createForm.vendorId) { toast.error("기존 지점을 선택한 후 업로드하세요"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/lunch/vendors/${createForm.vendorId}/cert`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("업로드 실패");
      toast.success("사업자등록증 업로드 완료");
    } catch (err) { toast.error(err instanceof Error ? err.message : "업로드 실패"); }
    finally { setUploading(false); }
  };

  const smallInput: React.CSSProperties = {
    width: "100%", padding: "6px 8px", border: "1px solid var(--app-border)",
    borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box" as const,
  };

  return (
    <div style={{ padding: 12, backgroundColor: "var(--app-bg)", borderRadius: 8, border: "1px solid var(--app-border)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 10, display: "flex", alignItems: "center", gap: 5 }}>
        <FileText style={{ width: 12, height: 12 }} /> 세금계산서 사업자 정보
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hasVendor && selectedVendor?.businessNumber ? (
          <div style={{ fontSize: 11, color: "var(--app-accent)", padding: "4px 0" }}>
            기존 지점 사업자 정보 사용: {selectedVendor.businessNumber} / {selectedVendor.representativeName || "-"}
          </div>
        ) : (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>사업자등록번호</label>
              <input value={createForm.businessNumber || ""} onChange={(e) => updateCreateForm({ businessNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="1234567890" style={smallInput} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>대표자명</label>
                <input value={createForm.representativeName || ""} onChange={(e) => updateCreateForm({ representativeName: e.target.value })}
                  placeholder="홍길동" style={smallInput} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>수신 이메일</label>
                <input value={createForm.taxEmail || ""} onChange={(e) => updateCreateForm({ taxEmail: e.target.value })}
                  placeholder="tax@example.com" style={smallInput} />
              </div>
            </div>
          </>
        )}

        {/* 사업자등록증 업로드 */}
        <div style={{ borderTop: "1px solid var(--app-border-light)", paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)" }}>사업자등록증</span>
            <button onClick={() => certRef.current?.click()} disabled={uploading || !createForm.vendorId} style={{
              fontSize: 10, color: createForm.vendorId ? "var(--app-text-secondary)" : "var(--app-text-placeholder)",
              background: "none", border: "none", cursor: createForm.vendorId ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 2,
            }}><Upload style={{ width: 10, height: 10 }} /> {uploading ? "..." : "업로드"}</button>
          </div>
          {!createForm.vendorId && (
            <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", padding: "4px 0" }}>
              기존 지점 선택 시 또는 등록 후 업로드 가능
            </div>
          )}
          <input ref={certRef} type="file" accept="image/*,.pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCertUpload(f); e.target.value = ""; }}
            style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}

// ─── Hover Tooltip ──────────────────────────────

function HoverTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: "relative", display: "inline-flex", cursor: "help" }}
    >
      {children}
      {show && (
        <span style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "#1F2937",
          color: "white",
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.4,
          padding: "8px 10px",
          borderRadius: 6,
          whiteSpace: "normal",
          width: "max-content",
          maxWidth: 280,
          zIndex: 10000,
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          pointerEvents: "none",
        }}>
          {text}
          <span style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1F2937",
          }} />
        </span>
      )}
    </span>
  );
}


// ─── Edit Modal Tax Info ──────────────────────

/** 수정 모달 내 세금계산서 사업자 정보 인라인 편집 */
function EditVendorTaxInfo({ vendor, inputStyle, onSaved }: {
  vendor: LunchVendor;
  inputStyle: React.CSSProperties;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    businessNumber: vendor.businessNumber || "",
    representativeName: vendor.representativeName || "",
    taxEmail: vendor.taxEmail || "",
    taxPhone: vendor.taxPhone || vendor.ownerPhone || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const certRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/lunch/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast.success("사업자 정보 저장 완료");
      onSaved();
    } catch {
      toast.error("사업자 정보 저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleCertUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/lunch/vendors/${vendor.id}/cert`, { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "업로드 실패"); }
      toast.success("사업자등록증 업로드 완료");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "업로드 실패"); }
    finally { setUploading(false); }
  };

  const smallInput: React.CSSProperties = { ...inputStyle, fontSize: 12, padding: "6px 8px" };

  return (
    <div style={{
      padding: 12, backgroundColor: "var(--app-bg)", borderRadius: 8,
      border: "1px solid var(--app-border)", marginTop: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", display: "flex", alignItems: "center", gap: 5 }}>
          <FileText style={{ width: 12, height: 12 }} /> 세금계산서 사업자 정보
        </div>
        <button onClick={handleSave} disabled={saving} style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
          backgroundColor: "#059669", color: "white", border: "none", cursor: "pointer",
        }}>
          {saving ? "..." : "저장"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ModalField label="사업자등록번호">
          <input value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
            placeholder="1234567890" style={smallInput} />
        </ModalField>
        <div style={{ display: "flex", gap: 8 }}>
          <ModalField label="대표자명" style={{ flex: 1 }}>
            <input value={form.representativeName} onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
              placeholder="홍길동" style={smallInput} />
          </ModalField>
          <ModalField label="수신 이메일" style={{ flex: 1 }}>
            <input value={form.taxEmail} onChange={(e) => setForm({ ...form, taxEmail: e.target.value })}
              placeholder="tax@example.com" style={smallInput} />
          </ModalField>
        </div>
        <ModalField label="연락처">
          <input value={form.taxPhone} onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
            let formatted = digits;
            if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
            else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
            setForm({ ...form, taxPhone: formatted });
          }}
            placeholder="사장님 번호 (기본)" style={smallInput} />
          {!form.taxPhone && <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", marginTop: 2 }}>비워두면 사장님 연락처 사용</div>}
        </ModalField>

        {/* 사업자등록증 업로드 */}
        <div style={{ borderTop: "1px solid var(--app-border-light)", paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)" }}>사업자등록증</span>
            <div style={{ display: "flex", gap: 4 }}>
              {vendor.businessCertUrl && (
                <button onClick={() => window.open(vendor.businessCertUrl, "_blank")} style={{
                  fontSize: 10, color: "var(--app-accent)", background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 2,
                }}><Eye style={{ width: 10, height: 10 }} /> 보기</button>
              )}
              <button onClick={() => certRef.current?.click()} disabled={uploading} style={{
                fontSize: 10, color: "var(--app-text-secondary)", background: "none", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 2,
              }}><Upload style={{ width: 10, height: 10 }} /> {uploading ? "..." : vendor.businessCertUrl ? "재업로드" : "업로드"}</button>
            </div>
          </div>
          {vendor.businessCertUrl ? (
            vendor.businessCertUrl.endsWith(".pdf") ? (
              <div onClick={() => window.open(vendor.businessCertUrl, "_blank")} style={{
                padding: "6px 8px", borderRadius: 6, backgroundColor: "var(--app-surface-secondary)",
                fontSize: 11, color: "var(--app-text-secondary)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
              }}><FileText style={{ width: 12, height: 12 }} /> 사업자등록증.pdf</div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vendor.businessCertUrl} alt="사업자등록증" onClick={() => window.open(vendor.businessCertUrl, "_blank")}
                style={{ width: "100%", borderRadius: 6, cursor: "zoom-in", border: "1px solid var(--app-border)" }} />
            )
          ) : (
            <div onClick={() => certRef.current?.click()} style={{
              padding: "10px", borderRadius: 6, border: "1px dashed var(--app-border)",
              textAlign: "center", fontSize: 11, color: "var(--app-text-placeholder)", cursor: "pointer",
            }}>{uploading ? "업로드 중..." : "이미지 또는 PDF 업로드"}</div>
          )}
          <input ref={certRef} type="file" accept="image/*,.pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCertUpload(f); e.target.value = ""; }}
            style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}

