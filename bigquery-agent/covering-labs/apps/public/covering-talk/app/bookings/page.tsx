"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, RefreshCw, Search, ChevronLeft, ChevronRight,
  Edit3, X, Calendar, CreditCard, Camera, Trash2, Plus, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/lib/store/orders";
import PaymentModal from "@/components/PaymentModal";

export default function BookingsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersDateFrom, setOrdersDateFrom] = useState("");
  const [ordersDateTo, setOrdersDateTo] = useState("");
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersDetail, setOrdersDetail] = useState<Order | null>(null);
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("");

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setOrdersLoading(true);
    try {
      const params = new URLSearchParams();
      if (ordersDateFrom) params.set("dateFrom", ordersDateFrom);
      if (ordersDateTo) params.set("dateTo", ordersDateTo);
      if (ordersSearch) params.set("search", ordersSearch);
      if (ordersStatusFilter) params.set("status", ordersStatusFilter);
      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      if (!silent) toast.error("데이터 조회 실패");
    } finally {
      setOrdersLoading(false);
    }
  }, [ordersDateFrom, ordersDateTo, ordersSearch, ordersStatusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const stats = useMemo(() => {
    const activeBookings = orders.filter((b) => b.status !== "cancelled");
    const totalAmount = activeBookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    // 정산완료 = completed + prepaid (둘 다 결제 끝난 매출). prepaid 는 수거일 20시 cron 으로 completed 전이.
    const settled = activeBookings.filter((b) => b.status === "completed" || b.status === "prepaid");
    const unsettled = activeBookings.filter((b) => b.status === "payment_requested");
    const inProgress = activeBookings.filter((b) => b.status === "confirmed");
    return {
      totalAmount,
      totalCount: activeBookings.length,
      settledAmount: settled.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
      settledCount: settled.length,
      unsettledAmount: unsettled.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
      unsettledCount: unsettled.length,
      inProgressAmount: inProgress.reduce((sum, b) => sum + (b.totalPrice || 0), 0),
      inProgressCount: inProgress.length,
    };
  }, [orders]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* 헤더 + 통계 */}
      <div style={{
        padding: "20px 32px", borderBottom: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface)",
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0, marginBottom: 16 }}>예약 관리</h1>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { label: "총 금액", value: stats.totalAmount, count: stats.totalCount, color: "var(--app-text-primary)" },
            { label: "정산완료", value: stats.settledAmount, count: stats.settledCount, color: "var(--app-btn-success-text)" },
            { label: "결제요청", value: stats.unsettledAmount, count: stats.unsettledCount, color: "var(--app-btn-danger-text)" },
            { label: "진행예정", value: stats.inProgressAmount, count: stats.inProgressCount, color: "var(--app-accent)" },
          ].map((s) => (
            <div key={s.label} style={{
              padding: "12px 20px", backgroundColor: "var(--app-bg)",
              borderRadius: 10, minWidth: 140,
            }}>
              <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
                {s.label}{s.count !== undefined && <span> ({s.count}건)</span>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>
                {s.value.toLocaleString()}원
              </div>
            </div>
          ))}
        </div>
      </div>

      <OrdersTab
        bookings={orders}
        loading={ordersLoading}
        search={ordersSearch}
        setSearch={(v) => { setOrdersSearch(v); setOrdersPage(0); }}
        dateFrom={ordersDateFrom}
        setDateFrom={(v) => { setOrdersDateFrom(v); setOrdersPage(0); }}
        dateTo={ordersDateTo}
        setDateTo={(v) => { setOrdersDateTo(v); setOrdersPage(0); }}
        statusFilter={ordersStatusFilter}
        setStatusFilter={(v) => { setOrdersStatusFilter(v); setOrdersPage(0); }}
        page={ordersPage}
        setPage={setOrdersPage}
        onRefresh={() => fetchOrders()}
        detail={ordersDetail}
        setDetail={setOrdersDetail}
      />

    </div>
  );
}

// ─── 주문 탭 컴포넌트 ─────────────────────────

const ORDER_STATUS_LABELS: Record<string, string> = {
  confirmed: "일정확정",
  payment_requested: "결제요청",
  prepaid: "선결제완료",
  completed: "완료",
  cancelled: "취소",
};

const ORDER_STATUS_OPTIONS: [string, string][] = [
  ["confirmed", "일정확정"],
  ["payment_requested", "결제요청"],
  ["prepaid", "선결제완료"],
  ["completed", "완료"],
  ["cancelled", "취소"],
];

const ORDER_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "var(--app-tag-blue-bg)", text: "var(--app-accent)" },
  payment_requested: { bg: "var(--app-tag-purple-bg)", text: "var(--app-tag-purple-text)" },
  prepaid: { bg: "#FCE7F3", text: "#BE185D" },
  completed: { bg: "var(--app-tag-green-bg)", text: "var(--app-tag-green-text)" },
  cancelled: { bg: "var(--app-btn-danger-bg)", text: "var(--app-btn-danger-text)" },
};

const PAGE_SIZE = 30;

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  return phone;
}

function OrdersTab({
  bookings, loading, search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo,
  statusFilter, setStatusFilter,
  page, setPage, onRefresh, detail, setDetail,
}: {
  bookings: Order[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  onRefresh: () => void;
  detail: Order | null;
  setDetail: (v: Order | null) => void;
}) {
  const totalPages = Math.ceil(bookings.length / PAGE_SIZE);
  const paginated = bookings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const [paymentTarget, setPaymentTarget] = useState<Order | null>(null);
  const [editOnOpen, setEditOnOpen] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // 일괄 선택/변경
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchStatus, setBatchStatus] = useState("");
  const [batchChanging, setBatchChanging] = useState(false);
  const [batchPaySending, setBatchPaySending] = useState(false);
  const [showBatchPayModal, setShowBatchPayModal] = useState(false);
  const [batchPaySendType, setBatchPaySendType] = useState<"0" | "2">("0");
  const [batchPayResults, setBatchPayResults] = useState<Array<{
    id: string; customerName: string; success: boolean; message: string;
  }> | null>(null);

  // 결제 넛지
  const [showNudgeModal, setShowNudgeModal] = useState(false);
  const [nudgeSending, setNudgeSending] = useState(false);
  const [nudgeResults, setNudgeResults] = useState<Array<{
    id: string; customerName: string; date: string; success: boolean; message: string;
  }> | null>(null);

  // 페이지/필터 변경 시 선택 초기화
  useEffect(() => { setSelectedIds(new Set()); }, [page, bookings]);

  const allPageSelected = paginated.length > 0 && paginated.every((b) => selectedIds.has(b.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((b) => next.delete(b.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((b) => next.add(b.id));
        return next;
      });
    }
  };

  const handleBatchChange = async () => {
    if (!batchStatus || selectedIds.size === 0) return;
    const label = ORDER_STATUS_OPTIONS.find(([k]) => k === batchStatus)?.[1] || batchStatus;
    if (!confirm(`${selectedIds.size}건의 상태를 "${label}"(으)로 변경하시겠습니까?`)) return;
    setBatchChanging(true);
    try {
      const res = await fetch("/api/orders/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: batchStatus }),
      });
      if (res.ok) {
        toast.success(`${selectedIds.size}건 상태 변경 완료`);
        setSelectedIds(new Set());
        setBatchStatus("");
        onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "일괄 변경 실패");
      }
    } catch {
      toast.error("일괄 변경 중 오류");
    } finally {
      setBatchChanging(false);
    }
  };

  const handleBatchPayment = async () => {
    setBatchPaySending(true);
    setBatchPayResults(null);
    try {
      const res = await fetch("/api/orders/batch-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), sendType: batchPaySendType }),
      });
      const data = await res.json();
      if (res.ok) {
        setBatchPayResults(data.results);
        toast.success(`발송 완료: 성공 ${data.successCount}건, 실패 ${data.failCount}건`);
        onRefresh();
      } else {
        toast.error(data.error || "일괄 결제 발송 실패");
      }
    } catch {
      toast.error("일괄 결제 발송 중 오류");
    } finally {
      setBatchPaySending(false);
    }
  };

  const handlePaymentNudge = async () => {
    setNudgeSending(true);
    setNudgeResults(null);
    try {
      const res = await fetch("/api/orders/payment-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setNudgeResults(data.results);
        toast.success(`결제 넛지 완료: 성공 ${data.successCount}건, 실패 ${data.failCount}건`);
      } else {
        toast.error(data.error || "결제 넛지 발송 실패");
      }
    } catch {
      toast.error("결제 넛지 발송 중 오류");
    } finally {
      setNudgeSending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("삭제 완료");
        setDeleteTarget(null);
        onRefresh();
      } else {
        const data = await res.json();
        toast.error(data.detail || data.error || "삭제 실패");
      }
    } catch {
      toast.error("삭제 중 오류");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {/* 필터 바 */}
      <div style={{
        padding: "12px 32px", backgroundColor: "var(--app-surface)",
        borderBottom: "1px solid var(--app-border)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>
          총 <strong style={{ color: "var(--app-text-primary)" }}>{bookings.length}건</strong>
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "7px 12px", fontSize: 13,
              border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
              color: statusFilter ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
              backgroundColor: "var(--app-surface)", cursor: "pointer",
            }}
          >
            <option value="">전체 상태</option>
            {ORDER_STATUS_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Calendar style={{
                width: 14, height: 14, color: "var(--app-text-tertiary)",
                position: "absolute", left: 10, pointerEvents: "none",
              }} />
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                title="시작일"
                style={{
                  width: 150, padding: "7px 12px 7px 30px", fontSize: 13,
                  border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
                  color: dateFrom ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
                  backgroundColor: "var(--app-surface)",
                }}
              />
            </div>
            <span style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>~</span>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                title="종료일"
                style={{
                  width: 130, padding: "7px 12px", fontSize: 13,
                  border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
                  color: dateTo ? "var(--app-text-primary)" : "var(--app-text-tertiary)",
                  backgroundColor: "var(--app-surface)",
                }}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                title="기간 필터 초기화"
                style={{
                  width: 22, height: 22,
                  borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: "var(--app-border)", border: "none", cursor: "pointer", padding: 0,
                }}
              >
                <X style={{ width: 12, height: 12, color: "var(--app-text-secondary)" }} />
              </button>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <Search style={{
              width: 14, height: 14, color: "var(--app-text-tertiary)",
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
            }} />
            <input
              type="text"
              placeholder="검색 (고객명, 연락처, 주소)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: 240, padding: "7px 12px 7px 30px", fontSize: 13,
                border: "1px solid var(--app-border)", borderRadius: 8, outline: "none",
              }}
            />
          </div>
          <button
            onClick={onRefresh}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", fontSize: 13, fontWeight: 500,
              color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface-secondary)",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: 14, height: 14 }} /> 새로고침
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", fontSize: 13, fontWeight: 600,
              color: "var(--app-btn-primary-text)", backgroundColor: "var(--app-accent)",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}
          >
            <Plus style={{ width: 14, height: 14 }} /> 새로등록
          </button>
        </div>
      </div>

      {/* 일괄 액션 바 */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: "10px 32px", backgroundColor: "var(--app-selected-bg)",
          borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-accent)" }}>
            {selectedIds.size}건 선택됨
          </span>
          <select
            value={batchStatus}
            onChange={(e) => setBatchStatus(e.target.value)}
            style={{
              padding: "6px 10px", fontSize: 13,
              border: "1px solid var(--app-border)", borderRadius: 6, outline: "none",
              backgroundColor: "var(--app-surface)", cursor: "pointer",
            }}
          >
            <option value="">상태 선택</option>
            {ORDER_STATUS_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleBatchChange}
            disabled={!batchStatus || batchChanging}
            style={{
              padding: "6px 14px", fontSize: 13, fontWeight: 600,
              color: "var(--app-btn-primary-text)", backgroundColor: batchStatus ? "var(--app-accent)" : "var(--app-border)",
              border: "none", borderRadius: 6, cursor: batchStatus ? "pointer" : "not-allowed",
            }}
          >
            {batchChanging ? "변경 중..." : "일괄 변경"}
          </button>
          <button
            onClick={() => { setBatchPayResults(null); setShowBatchPayModal(true); }}
            style={{
              padding: "6px 14px", fontSize: 13, fontWeight: 600,
              color: "#fff", backgroundColor: "#e67e22",
              border: "none", borderRadius: 6, cursor: "pointer",
            }}
          >
            일괄 결제 발송
          </button>
          <button
            onClick={() => { setNudgeResults(null); setShowNudgeModal(true); }}
            style={{
              padding: "6px 14px", fontSize: 13, fontWeight: 600,
              color: "#fff", backgroundColor: "#e74c3c",
              border: "none", borderRadius: 6, cursor: "pointer",
            }}
          >
            결제 넛지 발송
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBatchStatus(""); }}
            style={{
              padding: "6px 10px", fontSize: 13, color: "var(--app-text-secondary)",
              backgroundColor: "transparent", border: "1px solid var(--app-input-border)",
              borderRadius: 6, cursor: "pointer",
            }}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 테이블 */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 32px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
            <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 15 }}>데이터 로딩 중...</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: "var(--app-bg)", position: "sticky", top: 0 }}>
                <th style={{
                  padding: "10px 8px", width: 36,
                  borderBottom: "1px solid var(--app-border)",
                }}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--app-accent)" }}
                  />
                </th>
                {["주문번호", "날짜", "고객명", "시간", "주소", "연락처", "품목수", "금액", "인원", "상태", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: "10px 8px", textAlign: "left",
                    fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)",
                    borderBottom: "1px solid var(--app-border)", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: "var(--app-text-tertiary)" }}>데이터가 없습니다</td></tr>
              ) : (
                paginated.map((b) => {
                  const hasPaid = b.paymentIds?.some(p => p.tid || p.paidAt);
                  const hasSentPayment = b.paymentIds?.length > 0;
                  return (
                  <tr
                    key={b.id}
                    style={{
                      borderBottom: "1px solid var(--app-border-light)", cursor: "pointer",
                      backgroundColor: selectedIds.has(b.id) ? "var(--app-selected-bg)" : "transparent",
                    }}
                    onClick={() => setDetail(b)}
                    onMouseEnter={(e) => { if (!selectedIds.has(b.id)) e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
                    onMouseLeave={(e) => { if (!selectedIds.has(b.id)) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <td style={{ padding: "10px 8px", width: 36 }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(b.id)}
                        onChange={() => toggleSelect(b.id)}
                        style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--app-accent)" }}
                      />
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 11, fontFamily: "monospace", color: "var(--app-text-tertiary)" }}>{b.orderNumber || "-"}</td>
                    <td style={{ padding: "10px 8px" }}>{b.date || "-"}</td>
                    <td style={{ padding: "10px 8px", fontWeight: 500 }}>{b.customerName}</td>
                    <td style={{ padding: "10px 8px" }}>{b.timeSlot || "-"}</td>
                    <td style={{ padding: "10px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.address}
                    </td>
                    <td style={{ padding: "10px 8px" }}>{formatPhoneDisplay(b.phone)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>{b.items?.length || 0}</td>
                    <td style={{ padding: "10px 8px", fontWeight: 600, color: "var(--app-accent)" }}>
                      {b.totalPrice ? b.totalPrice.toLocaleString() + "원" : "-"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>{b.crewSize}인</td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 8px",
                        fontSize: 11, fontWeight: 600, borderRadius: 10,
                        backgroundColor: ORDER_STATUS_COLORS[b.status]?.bg ?? "var(--app-surface-secondary)",
                        color: ORDER_STATUS_COLORS[b.status]?.text ?? "var(--app-text-secondary)",
                      }}>
                        {ORDER_STATUS_LABELS[b.status] ?? b.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px" }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {b.sessionId && (
                          <button
                            onClick={() => window.open(`/conversations?id=${b.sessionId}`, "_blank")}
                            title="채팅 바로가기"
                            style={{
                              width: 28, height: 28, borderRadius: 6,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              backgroundColor: "var(--app-tag-teal-bg)", border: "none", cursor: "pointer",
                            }}
                          >
                            <MessageSquare style={{ width: 13, height: 13, color: "var(--app-tag-teal-text)" }} />
                          </button>
                        )}
                        {b.photos?.length > 0 && (
                          <button
                            onClick={() => setDetail(b)}
                            title="사진 보기"
                            style={{
                              width: 28, height: 28, borderRadius: 6,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              backgroundColor: "var(--app-tag-purple-bg)", border: "none", cursor: "pointer",
                            }}
                          >
                            <Camera style={{ width: 13, height: 13, color: "var(--app-tag-purple-text)" }} />
                          </button>
                        )}
                        <button
                          onClick={() => setPaymentTarget(b)}
                          title={hasPaid ? "결제완료" : hasSentPayment ? "결제확인" : "결제요청"}
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: "none", cursor: "pointer",
                            backgroundColor: hasPaid
                              ? "var(--app-btn-success-bg)"
                              : hasSentPayment ? "var(--app-tag-purple-bg)" : "var(--app-tag-blue-bg)",
                          }}
                        >
                          <CreditCard style={{
                            width: 13, height: 13,
                            color: hasPaid
                              ? "var(--app-btn-success-text)"
                              : hasSentPayment ? "var(--app-tag-purple-text)" : "var(--app-accent)",
                          }} />
                        </button>
                        <button
                          onClick={() => { setDetail(b); setEditOnOpen(b.id); }}
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
                          onClick={() => setDeleteTarget(b)}
                          title="삭제"
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            backgroundColor: "var(--app-btn-danger-bg)", border: "none", cursor: "pointer",
                          }}
                        >
                          <Trash2 style={{ width: 13, height: 13, color: "var(--app-btn-danger-text)" }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div style={{
          padding: "12px 32px", backgroundColor: "var(--app-surface)",
          borderTop: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        }}>
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            style={{
              width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", backgroundColor: "transparent", cursor: page === 0 ? "default" : "pointer",
              color: page === 0 ? "var(--app-text-placeholder)" : "var(--app-text-secondary)",
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </button>
          {getPageNumbers(page, totalPages).map((p, i) =>
            p < 0 ? (
              <span key={`e${i}`} style={{ color: "var(--app-text-placeholder)", fontSize: 12 }}>…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", fontSize: 13, fontWeight: page === p ? 700 : 400,
                  backgroundColor: page === p ? "var(--app-pagination-bg)" : "transparent",
                  color: page === p ? "var(--app-accent)" : "var(--app-text-secondary)",
                  cursor: "pointer",
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
              width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", backgroundColor: "transparent",
              cursor: page >= totalPages - 1 ? "default" : "pointer",
              color: page >= totalPages - 1 ? "var(--app-text-placeholder)" : "var(--app-text-secondary)",
            }}
          >
            <ChevronRight style={{ width: 16, height: 16 }} />
          </button>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <div
          onClick={() => !deleting && setDeleteTarget(null)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--app-modal-bg)", borderRadius: 16, width: 400,
              padding: "28px 28px 24px", boxShadow: "var(--app-shadow-lg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                backgroundColor: "var(--app-btn-danger-bg)", display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Trash2 style={{ width: 20, height: 20, color: "var(--app-btn-danger-text)" }} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>예약 삭제</div>
                <div style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>이 작업은 되돌릴 수 없습니다</div>
              </div>
            </div>
            <div style={{
              backgroundColor: "var(--app-bg)", borderRadius: 10, padding: "14px 16px",
              marginBottom: 20, fontSize: 13, lineHeight: 1.6, color: "var(--app-text-primary)",
            }}>
              <div><strong>{deleteTarget.customerName}</strong> ({formatPhoneDisplay(deleteTarget.phone)})</div>
              <div>{deleteTarget.date} {deleteTarget.timeSlot} · {deleteTarget.address}</div>
              {deleteTarget.totalPrice > 0 && <div>금액: {deleteTarget.totalPrice.toLocaleString()}원</div>}
            </div>
            <div style={{ fontSize: 14, color: "var(--app-text-primary)", marginBottom: 20, textAlign: "center", fontWeight: 500 }}>
              정말 이 예약을 삭제하시겠습니까?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  flex: 1, height: 44, borderRadius: 10,
                  backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                  border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}
              >취소</button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1, height: 44, borderRadius: 10,
                  backgroundColor: deleting ? "var(--app-border)" : "var(--app-btn-danger-text)", color: "var(--app-btn-primary-text)",
                  border: "none", fontSize: 14, fontWeight: 600,
                  cursor: deleting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                {deleting ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 삭제 중...</> : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 결제 발송 모달 */}
      {showBatchPayModal && selectedIds.size > 0 && (
        <div
          onClick={() => !batchPaySending && setShowBatchPayModal(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--app-modal-bg)", borderRadius: 16, width: 520,
              maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "var(--app-shadow-lg)",
            }}
          >
            {/* 헤더 */}
            <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid var(--app-border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: "#fef3e2", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <CreditCard style={{ width: 20, height: 20, color: "#e67e22" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>일괄 결제 발송</div>
                    <div style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>
                      {selectedIds.size}건 · 총 {bookings.filter(b => selectedIds.has(b.id)).reduce((s, b) => s + (b.totalPrice || 0), 0).toLocaleString()}원
                    </div>
                  </div>
                </div>
                {!batchPaySending && (
                  <button onClick={() => setShowBatchPayModal(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--app-text-tertiary)" }}>
                    <X style={{ width: 18, height: 18 }} />
                  </button>
                )}
              </div>

              {/* 발송 방식 선택 */}
              {!batchPayResults && (
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => setBatchPaySendType("0")}
                    style={{
                      flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600,
                      border: batchPaySendType === "0" ? "2px solid var(--app-accent)" : "1px solid var(--app-border)",
                      backgroundColor: batchPaySendType === "0" ? "var(--app-tag-blue-bg)" : "var(--app-surface)",
                      color: batchPaySendType === "0" ? "var(--app-accent)" : "var(--app-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    알림톡 (카카오)
                  </button>
                  <button
                    onClick={() => setBatchPaySendType("2")}
                    style={{
                      flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600,
                      border: batchPaySendType === "2" ? "2px solid var(--app-accent)" : "1px solid var(--app-border)",
                      backgroundColor: batchPaySendType === "2" ? "var(--app-tag-blue-bg)" : "var(--app-surface)",
                      color: batchPaySendType === "2" ? "var(--app-accent)" : "var(--app-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    SMS
                  </button>
                </div>
              )}
            </div>

            {/* 대상 목록 */}
            <div style={{ flex: 1, overflow: "auto", padding: "12px 28px" }}>
              {batchPayResults ? (
                // 결과 표시
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {batchPayResults.map((r) => (
                    <div key={r.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", borderRadius: 10, fontSize: 13,
                      backgroundColor: r.success ? "var(--app-tag-green-bg)" : "var(--app-btn-danger-bg)",
                    }}>
                      <span style={{ fontWeight: 600, color: "var(--app-text-primary)" }}>{r.customerName}</span>
                      <span style={{
                        fontSize: 12, fontWeight: 500,
                        color: r.success ? "var(--app-tag-green-text)" : "var(--app-btn-danger-text)",
                      }}>
                        {r.success ? "발송 완료" : r.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                // 발송 전 대상 목록
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {bookings.filter(b => selectedIds.has(b.id)).map((b) => (
                    <div key={b.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 14px", borderRadius: 8, fontSize: 13,
                      backgroundColor: "var(--app-surface-secondary)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{b.customerName}</span>
                        <span style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>{b.date}</span>
                        {b.paymentIds?.length > 0 && (
                          <span style={{
                            fontSize: 10, padding: "2px 6px", borderRadius: 4,
                            backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)",
                          }}>재발송</span>
                        )}
                      </div>
                      <span style={{ fontWeight: 600, color: "var(--app-accent)" }}>
                        {(b.totalPrice || 0).toLocaleString()}원
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div style={{ padding: "16px 28px 24px", borderTop: "1px solid var(--app-border)", display: "flex", gap: 8 }}>
              {batchPayResults ? (
                <button
                  onClick={() => { setShowBatchPayModal(false); setSelectedIds(new Set()); setBatchPayResults(null); }}
                  style={{
                    flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                    backgroundColor: "var(--app-accent)", color: "var(--app-btn-primary-text)",
                    border: "none", cursor: "pointer",
                  }}
                >
                  확인
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowBatchPayModal(false)}
                    disabled={batchPaySending}
                    style={{
                      flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 500,
                      backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleBatchPayment}
                    disabled={batchPaySending}
                    style={{
                      flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                      backgroundColor: batchPaySending ? "var(--app-border)" : "#e67e22", color: "#fff",
                      border: "none", cursor: batchPaySending ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {batchPaySending ? (
                      <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 발송 중...</>
                    ) : (
                      `${selectedIds.size}건 발송하기`
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 결제 넛지 모달 */}
      {showNudgeModal && selectedIds.size > 0 && (
        <div
          onClick={() => !nudgeSending && setShowNudgeModal(false)}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--app-surface)", borderRadius: 14,
              width: 500, maxHeight: "80vh", display: "flex", flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            {/* 헤더 */}
            <div style={{ padding: "20px 28px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>결제 넛지 발송</div>
              {!nudgeSending && (
                <button onClick={() => setShowNudgeModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-text-tertiary)" }}>
                  <X style={{ width: 18, height: 18 }} />
                </button>
              )}
            </div>

            {/* 안내 */}
            <div style={{ padding: "0 28px", flex: 1, overflowY: "auto" }}>
              <div style={{
                backgroundColor: "var(--app-bg)", borderRadius: 10, padding: "14px 16px",
                marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: "var(--app-text-primary)",
              }}>
                <p style={{ margin: "0 0 8px", fontWeight: 600 }}>발송 내용:</p>
                <p style={{ margin: 0 }}>1. 결제 안내 이미지 발송</p>
                <p style={{ margin: 0 }}>2. &quot;X월 X일 수거 서비스 이용 감사, 결제 미완료 안내&quot; 텍스트</p>
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--app-text-tertiary)" }}>
                  * 카카오톡 대화창으로 직접 발송됩니다
                </p>
              </div>

              {nudgeResults ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {nudgeResults.map((r) => (
                    <div key={r.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 12px", borderRadius: 8, fontSize: 13,
                      backgroundColor: r.success ? "var(--app-tag-green-bg)" : "var(--app-tag-red-bg)",
                    }}>
                      <span style={{ fontWeight: 500 }}>{r.customerName} ({r.date})</span>
                      <span style={{ color: r.success ? "var(--app-btn-success-text)" : "var(--app-btn-danger-text)" }}>
                        {r.success ? "발송 완료" : r.message}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
                  <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)" }}>
                    발송 대상 ({selectedIds.size}건)
                  </p>
                  {bookings
                    .filter((b) => selectedIds.has(b.id))
                    .map((b) => (
                      <div key={b.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "6px 12px", borderRadius: 6, fontSize: 13,
                        backgroundColor: "var(--app-surface-secondary)",
                      }}>
                        <span>{b.customerName}</span>
                        <span style={{ color: "var(--app-text-tertiary)" }}>
                          {b.date} · {(b.totalPrice || 0).toLocaleString()}원
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div style={{ padding: "16px 28px 24px", borderTop: "1px solid var(--app-border)", display: "flex", gap: 8 }}>
              {nudgeResults ? (
                <button
                  onClick={() => { setShowNudgeModal(false); setNudgeResults(null); }}
                  style={{
                    flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                    backgroundColor: "var(--app-accent)", color: "var(--app-btn-primary-text)",
                    border: "none", cursor: "pointer",
                  }}
                >
                  확인
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowNudgeModal(false)}
                    disabled={nudgeSending}
                    style={{
                      flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 500,
                      backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    취소
                  </button>
                  <button
                    onClick={handlePaymentNudge}
                    disabled={nudgeSending}
                    style={{
                      flex: 1, height: 44, borderRadius: 10, fontSize: 14, fontWeight: 600,
                      backgroundColor: nudgeSending ? "var(--app-border)" : "#e74c3c", color: "#fff",
                      border: "none", cursor: nudgeSending ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    {nudgeSending ? (
                      <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 발송 중...</>
                    ) : (
                      `${selectedIds.size}건 넛지 발송`
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 결제 모달 */}
      {paymentTarget && (
        <PaymentModal
          booking={paymentTarget}
          isOpen={true}
          onClose={() => { setPaymentTarget(null); onRefresh(); }}
          onRefresh={onRefresh}
          editablePrice
        />
      )}

      {/* 상세/수정 모달 */}
      {detail && (
        <OrderDetailModal
          key={detail.id}
          booking={detail}
          onClose={() => { setDetail(null); setEditOnOpen(null); }}
          onRefresh={onRefresh}
          initialEditing={editOnOpen === detail.id}
        />
      )}

      {/* 새로등록 모달 */}
      {showCreate && (
        <OrderCreateModal
          onClose={() => setShowCreate(false)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
}

// ─── 시간 파싱 유틸 ──────────────────────
/** "오후 2:00~오후 4:00" → { ampm, hour, min, endAmpm, endHour, endMin } */
function parseTimeSlot(ts: string) {
  const def = { ampm: "오후", hour: "", min: "00", endAmpm: "오후", endHour: "", endMin: "00" };
  if (!ts) return def;
  const parts = ts.split("~");
  const parseOne = (s: string) => {
    const m = s.trim().match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
    if (m) return { ampm: m[1], hour: m[2], min: m[3] };
    // 24시간제 fallback "14:00"
    const m24 = s.trim().match(/(\d{1,2}):(\d{2})/);
    if (m24) {
      const h = parseInt(m24[1]);
      return { ampm: h >= 12 ? "오후" : "오전", hour: String(h > 12 ? h - 12 : h === 0 ? 12 : h), min: m24[2] };
    }
    return null;
  };
  const start = parseOne(parts[0]);
  const end = parts[1] ? parseOne(parts[1]) : null;
  return {
    ampm: start?.ampm ?? def.ampm,
    hour: start?.hour ?? def.hour,
    min: start?.min ?? def.min,
    endAmpm: end?.ampm ?? start?.ampm ?? def.endAmpm,
    endHour: end?.hour ?? def.endHour,
    endMin: end?.min ?? def.endMin,
  };
}

/** 오전/오후 + 시/분 → timeSlot 문자열 */
function formatTimeSlot(ampm: string, hour: string, min: string, endAmpm: string, endHour: string, endMin: string) {
  if (!hour) return "";
  let s = `${ampm} ${hour}:${min || "00"}`;
  if (endHour) s += `~${endAmpm} ${endHour}:${endMin || "00"}`;
  return s;
}

// ─── 주문 상세/수정 모달 ──────────────────────

const EDIT_INPUT: React.CSSProperties = {
  width: "100%", padding: "6px 10px", fontSize: 13,
  border: "1px solid var(--app-border)", borderRadius: 6, outline: "none",
  backgroundColor: "var(--app-input-bg)", color: "var(--app-text-primary)",
};

function OrderDetailModal({
  booking, onClose, onRefresh, initialEditing = false,
}: {
  booking: Order;
  onClose: () => void;
  onRefresh: () => void;
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  const [saving, setSaving] = useState(false);
  const initTime = parseTimeSlot(booking.timeSlot);
  const [form, setForm] = useState({
    customerName: booking.customerName,
    phone: booking.phone,
    date: booking.date,
    timeAmPm: initTime.ampm,
    timeHour: initTime.hour,
    timeMinute: initTime.min,
    timeEndAmPm: initTime.endAmpm,
    timeEndHour: initTime.endHour,
    timeEndMinute: initTime.endMin,
    crewSize: booking.crewSize,
    address: booking.address,
    floor: booking.floor ?? 1,
    totalPrice: booking.totalPrice,
    hasElevator: booking.hasElevator,
    hasParking: booking.hasParking,
    hasGroundAccess: booking.hasGroundAccess ?? true,
    needLadder: booking.needLadder,
    ladderFee: booking.ladderFee || 0,
    memo: booking.memo,
    status: booking.status,
    items: (booking.items || []).map(i => ({ ...i })),
  });

  // booking prop이 바뀌면 form을 재초기화
  useEffect(() => {
    const t = parseTimeSlot(booking.timeSlot);
    setForm({
      customerName: booking.customerName,
      phone: booking.phone,
      date: booking.date,
      timeAmPm: t.ampm,
      timeHour: t.hour,
      timeMinute: t.min,
      timeEndAmPm: t.endAmpm,
      timeEndHour: t.endHour,
      timeEndMinute: t.endMin,
      crewSize: booking.crewSize,
      address: booking.address,
      floor: booking.floor ?? 1,
      totalPrice: booking.totalPrice,
      hasElevator: booking.hasElevator,
      hasParking: booking.hasParking,
      hasGroundAccess: booking.hasGroundAccess ?? true,
      needLadder: booking.needLadder,
      ladderFee: booking.ladderFee || 0,
      memo: booking.memo,
      status: booking.status,
      items: (booking.items || []).map(i => ({ ...i })),
    });
  }, [booking]);

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const updateItem = (idx: number, field: string, value: unknown) => {
    const newItems = [...form.items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    set("items", newItems);
  };
  const removeItem = (idx: number) => {
    set("items", form.items.filter((_: unknown, i: number) => i !== idx));
  };
  const addItem = () => {
    set("items", [...form.items, { category: "", name: "", displayName: "", price: 0, quantity: 1, volume: 0 }]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 시간 필드를 timeSlot 문자열로 변환
      const newTimeSlot = formatTimeSlot(form.timeAmPm, form.timeHour, form.timeMinute, form.timeEndAmPm, form.timeEndHour, form.timeEndMinute);
      // 변경된 필드만 전송 + 빈 문자열은 null로 변환
      const formForCompare: Record<string, unknown> = { ...form, timeSlot: newTimeSlot };
      // 시간 개별 필드 제거 (서버는 timeSlot만 받음)
      delete formForCompare.timeAmPm;
      delete formForCompare.timeHour;
      delete formForCompare.timeMinute;
      delete formForCompare.timeEndAmPm;
      delete formForCompare.timeEndHour;
      delete formForCompare.timeEndMinute;

      const original: Record<string, unknown> = {
        customerName: booking.customerName, phone: booking.phone,
        date: booking.date, timeSlot: booking.timeSlot,
        crewSize: booking.crewSize, address: booking.address,
        floor: booking.floor ?? 1, totalPrice: booking.totalPrice,
        hasElevator: booking.hasElevator, hasParking: booking.hasParking,
        hasGroundAccess: booking.hasGroundAccess ?? true,
        needLadder: booking.needLadder, ladderFee: booking.ladderFee || 0,
        memo: booking.memo, status: booking.status,
        items: booking.items || [],
      };
      const changes: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(formForCompare)) {
        if (key === "items") {
          if (JSON.stringify(val) !== JSON.stringify(original.items)) {
            changes.items = val;
          }
          continue;
        }
        if (val !== original[key]) {
          changes[key] = val === "" ? null : val;
        }
      }
      if (Object.keys(changes).length === 0) {
        toast.success("변경사항이 없습니다");
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/orders/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (res.ok) {
        toast.success("수정 완료");
        setEditing(false);
        onRefresh();
        onClose();
      } else {
        const data = await res.json();
        console.error("[orders] 수정 실패:", data);
        toast.error(data.detail || data.error || "수정 실패");
      }
    } catch {
      toast.error("수정 중 오류");
    } finally {
      setSaving(false);
    }
  };

  const detail = booking;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16, width: 620, maxHeight: "85vh",
          overflow: "auto", padding: "24px 28px",
          boxShadow: "var(--app-shadow-lg)",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {editing ? "예약 수정" : `${detail.customerName} · #${detail.orderNumber || detail.id.slice(0, 8)}`}
          </h2>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "6px 12px", fontSize: 12, fontWeight: 600,
                backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                border: "none", borderRadius: 8, cursor: "pointer",
              }}>
                <Edit3 style={{ width: 12, height: 12 }} /> 수정
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
            </button>
          </div>
        </div>

        {editing ? (
          /* ────────── 수정 모드 ────────── */
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 상태 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>상태</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                style={{ ...EDIT_INPUT, cursor: "pointer" }}>
                {ORDER_STATUS_OPTIONS.map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* 주문번호 (읽기전용) */}
            {booking.orderNumber && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>주문번호</label>
                <div style={{ ...EDIT_INPUT, backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-tertiary)", fontFamily: "monospace" }}>{booking.orderNumber}</div>
              </div>
            )}

            {/* 고객명 + 연락처 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>고객명</label>
                <input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} style={EDIT_INPUT} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>연락처</label>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} style={EDIT_INPUT} />
              </div>
            </div>

            {/* 날짜 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>날짜</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={EDIT_INPUT} />
            </div>

            {/* 수거시간 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>수거시간</label>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <select value={form.timeAmPm} onChange={(e) => set("timeAmPm", e.target.value)}
                  style={{ ...EDIT_INPUT, width: 72, padding: "7px 4px", cursor: "pointer" }}>
                  <option value="오전">오전</option>
                  <option value="오후">오후</option>
                </select>
                <input type="number" value={form.timeHour} onChange={(e) => set("timeHour", e.target.value)}
                  placeholder="시" min={1} max={12}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                <input type="number" value={form.timeMinute} onChange={(e) => set("timeMinute", e.target.value)}
                  placeholder="분" min={0} max={59}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
                <span style={{ color: "var(--app-text-tertiary)", margin: "0 2px" }}>~</span>
                <select value={form.timeEndAmPm} onChange={(e) => set("timeEndAmPm", e.target.value)}
                  style={{ ...EDIT_INPUT, width: 72, padding: "7px 4px", cursor: "pointer" }}>
                  <option value="오전">오전</option>
                  <option value="오후">오후</option>
                </select>
                <input type="number" value={form.timeEndHour} onChange={(e) => set("timeEndHour", e.target.value)}
                  placeholder="시" min={1} max={12}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                <input type="number" value={form.timeEndMinute} onChange={(e) => set("timeEndMinute", e.target.value)}
                  placeholder="분" min={0} max={59}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 3 }}>
                종료시간은 선택사항입니다
              </div>
            </div>

            {/* 인원 + 층수 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>인원</label>
                <select value={form.crewSize} onChange={(e) => set("crewSize", parseInt(e.target.value))}
                  style={{ ...EDIT_INPUT, cursor: "pointer" }}>
                  {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}인</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>층수</label>
                <input type="number" value={form.floor} onChange={(e) => set("floor", parseInt(e.target.value) || 1)} style={EDIT_INPUT} />
              </div>
            </div>

            {/* 주소 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>주소</label>
              <input value={form.address} onChange={(e) => set("address", e.target.value)} style={EDIT_INPUT} />
            </div>

            {/* 금액 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>금액</label>
              <input type="number" value={form.totalPrice} onChange={(e) => set("totalPrice", parseInt(e.target.value) || 0)} style={EDIT_INPUT} />
            </div>

            {/* 조건 체크박스 */}
            <div style={{ display: "flex", gap: 16 }}>
              {([
                ["hasElevator", "엘리베이터"],
                ["hasParking", "주차 가능"],
                ["hasGroundAccess", "지상출입"],
                ["needLadder", "사다리차"],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer" }}>
                  <input type="checkbox" checked={form[key] as boolean} onChange={(e) => set(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>

            {/* 사다리차 비용 */}
            {form.needLadder && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>사다리 비용</label>
                <input type="number" value={form.ladderFee} onChange={(e) => set("ladderFee", parseInt(e.target.value) || 0)} style={EDIT_INPUT} />
              </div>
            )}

            {/* 품목 */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)" }}>품목 ({form.items.length}개)</label>
                <button onClick={addItem} type="button" style={{
                  fontSize: 11, fontWeight: 600, color: "var(--app-accent)", backgroundColor: "var(--app-tag-blue-bg)",
                  border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                }}>+ 추가</button>
              </div>
              {form.items.map((item: { category: string; name: string; displayName: string; price: number; quantity: number; volume?: number }, idx: number) => (
                <div key={idx} style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr 80px 60px 28px", gap: 6,
                  marginBottom: 6, alignItems: "end",
                }}>
                  <div>
                    {idx === 0 && <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginBottom: 2 }}>카테고리</div>}
                    <input value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)}
                      style={{ ...EDIT_INPUT, fontSize: 12 }} placeholder="카테고리" />
                  </div>
                  <div>
                    {idx === 0 && <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginBottom: 2 }}>품목명</div>}
                    <input value={item.name} onChange={(e) => {
                      const newItems = [...form.items];
                      newItems[idx] = { ...newItems[idx], name: e.target.value, displayName: `${item.category} - ${e.target.value}` };
                      set("items", newItems);
                    }} style={{ ...EDIT_INPUT, fontSize: 12 }} placeholder="품목명" />
                  </div>
                  <div>
                    {idx === 0 && <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginBottom: 2 }}>단가</div>}
                    <input type="number" value={item.price} onChange={(e) => updateItem(idx, "price", parseInt(e.target.value) || 0)}
                      style={{ ...EDIT_INPUT, fontSize: 12 }} />
                  </div>
                  <div>
                    {idx === 0 && <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginBottom: 2 }}>수량</div>}
                    <input type="number" value={item.quantity} min={1} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                      style={{ ...EDIT_INPUT, fontSize: 12 }} />
                  </div>
                  <button onClick={() => removeItem(idx)} type="button" style={{
                    width: 28, height: 28, borderRadius: 6, border: "none", cursor: "pointer",
                    backgroundColor: "var(--app-btn-danger-bg)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <X style={{ width: 12, height: 12, color: "var(--app-btn-danger-text)" }} />
                  </button>
                </div>
              ))}
              {form.items.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", padding: "8px 0" }}>품목이 없습니다</div>
              )}
            </div>

            {/* 메모 */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>메모</label>
              <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)}
                rows={3} style={{ ...EDIT_INPUT, resize: "vertical" }} />
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={() => setEditing(false)} style={{
                flex: 1, height: 40, borderRadius: 10,
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>취소</button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, height: 40, borderRadius: 10,
                backgroundColor: saving ? "var(--app-border)" : "var(--app-accent)", color: "var(--app-btn-primary-text)",
                border: "none", fontSize: 13, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {saving ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 저장 중...</> : "저장"}
              </button>
            </div>
          </div>
        ) : (
          /* ────────── 읽기 모드 ────────── */
          <>
            {/* 상태 + 주문번호 */}
            <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                display: "inline-block", padding: "4px 12px",
                fontSize: 12, fontWeight: 600, borderRadius: 12,
                backgroundColor: ORDER_STATUS_COLORS[detail.status]?.bg ?? "var(--app-surface-secondary)",
                color: ORDER_STATUS_COLORS[detail.status]?.text ?? "var(--app-text-secondary)",
              }}>
                {ORDER_STATUS_LABELS[detail.status] ?? detail.status}
              </span>
              {detail.orderNumber && (
                <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", fontFamily: "monospace" }}>
                  #{detail.orderNumber}
                </span>
              )}
            </div>

            {/* 기본 정보 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 16px", marginBottom: 16 }}>
              <OrderInfoRow label="날짜" value={detail.date || "-"} />
              <OrderInfoRow label="시간" value={detail.timeSlot || "-"} />
              <OrderInfoRow label="인원" value={`${detail.crewSize}인`} />
              <OrderInfoRow label="층수" value={detail.floor != null ? `${detail.floor}층` : "-"} />
              <OrderInfoRow label="연락처" value={formatPhoneDisplay(detail.phone)} full />
              <OrderInfoRow label="주소" value={detail.address} full />
            </div>

            {/* 품목 */}
            {detail.items?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 6 }}>품목 ({detail.items.length}개)</div>
                <div style={{
                  backgroundColor: "var(--app-bg)", borderRadius: 8, padding: "10px 14px",
                  fontSize: 12, lineHeight: 1.6, color: "var(--app-text-primary)",
                }}>
                  {detail.items.map((item, i) => (
                    <div key={i}>{item.displayName || `${item.category} - ${item.name}`} x {item.quantity}</div>
                  ))}
                </div>
              </div>
            )}

            {/* 금액 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
              <div style={{ backgroundColor: "var(--app-info-box-bg)", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>금액</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--app-accent)" }}>{detail.totalPrice?.toLocaleString()}원</div>
              </div>
              <div style={{ backgroundColor: "var(--app-bg)", borderRadius: 8, padding: "10px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>적재부피</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>{detail.totalVolume}m³</div>
              </div>
            </div>

            {/* 조건 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {detail.hasElevator && <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, backgroundColor: "var(--app-tag-green-bg)", color: "var(--app-tag-green-text)" }}>엘리베이터</span>}
              {detail.hasParking && <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)" }}>주차 가능</span>}
              {detail.hasGroundAccess && <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, backgroundColor: "var(--app-tag-teal-bg)", color: "var(--app-tag-teal-text)" }}>지상출입</span>}
              {detail.needLadder && <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 8, backgroundColor: "var(--app-tag-yellow-bg)", color: "var(--app-tag-yellow-text)" }}>사다리차</span>}
            </div>

            {/* 사다리차 */}
            {detail.needLadder && detail.ladderFee > 0 && (
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                backgroundColor: "var(--app-tag-yellow-bg)", borderRadius: 8, fontSize: 13,
              }}>
                사다리차 비용: {detail.ladderFee?.toLocaleString()}원
              </div>
            )}

            {/* 메모 */}
            {detail.memo && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 4 }}>메모</div>
                <div style={{ fontSize: 13, color: "var(--app-text-primary)", lineHeight: 1.5 }}>{detail.memo}</div>
              </div>
            )}

            {/* 사진 */}
            {detail.photos?.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 6 }}>
                  사진 ({detail.photos.length}장)
                </div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                  {detail.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`사진 ${i + 1}`}
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderInfoRow({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: "var(--app-text-primary)" }}>{value}</div>
    </div>
  );
}

// ─── 공통 컴포넌트 ──────────────────────────

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

function ModalField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── 새로등록 모달 ──────────────────────────────

function OrderCreateModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    date: "",
    timeAmPm: "오후" as string,
    timeHour: "",
    timeMinute: "00",
    timeEndAmPm: "오후" as string,
    timeEndHour: "",
    timeEndMinute: "00",
    crewSize: 1,
    address: "",
    floor: 1,
    totalPrice: 0,
    hasElevator: false,
    hasParking: false,
    hasGroundAccess: true,
    needLadder: false,
    ladderFee: 0,
    memo: "",
    status: "confirmed",
    items: [] as { category: string; name: string; displayName: string; price: number; quantity: number; volume: number }[],
  });

  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const addItem = () => {
    set("items", [...form.items, { category: "", name: "", displayName: "", price: 0, quantity: 1, volume: 0 }]);
  };
  const updateItem = (idx: number, field: string, value: unknown) => {
    const newItems = [...form.items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    set("items", newItems);
  };
  const removeItem = (idx: number) => {
    set("items", form.items.filter((_: unknown, i: number) => i !== idx));
  };

  const handleCreate = async () => {
    if (!form.customerName || !form.phone || !form.date) {
      toast.error("고객명, 연락처, 날짜는 필수입니다");
      return;
    }
    setSaving(true);
    try {
      // 시간 포맷팅: "오후 2:00~오후 4:00"
      let formattedTime = "";
      if (form.timeHour) {
        formattedTime = `${form.timeAmPm} ${form.timeHour}:${form.timeMinute || "00"}`;
        if (form.timeEndHour) {
          formattedTime += `~${form.timeEndAmPm} ${form.timeEndHour}:${form.timeEndMinute || "00"}`;
        }
      }
      const payload = {
        ...form,
        timeSlot: formattedTime,
        items: form.items.map((it) => ({ ...it, displayName: it.name })),
      };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("예약이 등록되었습니다");
        onRefresh();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.error || "등록 실패");
      }
    } catch {
      toast.error("등록 중 오류");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16, width: 620, maxHeight: "85vh",
          overflow: "auto", padding: "24px 28px",
          boxShadow: "var(--app-shadow-lg)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>새 예약 등록</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* 상태 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>상태</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              style={{ ...EDIT_INPUT, cursor: "pointer" }}>
              {ORDER_STATUS_OPTIONS.map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* 고객명 + 연락처 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>고객명 *</label>
              <input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} style={EDIT_INPUT} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>연락처 *</label>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} style={EDIT_INPUT} placeholder="010-0000-0000" />
            </div>
          </div>

          {/* 날짜 + 시간 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>날짜 *</label>
              <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} style={EDIT_INPUT} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>시간</label>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <select value={form.timeAmPm} onChange={(e) => set("timeAmPm", e.target.value)}
                  style={{ ...EDIT_INPUT, width: 72, padding: "7px 4px", cursor: "pointer" }}>
                  <option value="오전">오전</option>
                  <option value="오후">오후</option>
                </select>
                <input type="number" value={form.timeHour} onChange={(e) => set("timeHour", e.target.value)}
                  placeholder="시" min={1} max={12}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                <input type="number" value={form.timeMinute} onChange={(e) => set("timeMinute", e.target.value)}
                  placeholder="분" min={0} max={59}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
                <span style={{ color: "var(--app-text-tertiary)", margin: "0 2px" }}>~</span>
                <select value={form.timeEndAmPm} onChange={(e) => set("timeEndAmPm", e.target.value)}
                  style={{ ...EDIT_INPUT, width: 72, padding: "7px 4px", cursor: "pointer" }}>
                  <option value="오전">오전</option>
                  <option value="오후">오후</option>
                </select>
                <input type="number" value={form.timeEndHour} onChange={(e) => set("timeEndHour", e.target.value)}
                  placeholder="시" min={1} max={12}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)" }}>:</span>
                <input type="number" value={form.timeEndMinute} onChange={(e) => set("timeEndMinute", e.target.value)}
                  placeholder="분" min={0} max={59}
                  style={{ ...EDIT_INPUT, width: 48, padding: "7px 4px", textAlign: "center" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 3 }}>
                종료시간은 선택사항입니다
              </div>
            </div>
          </div>

          {/* 인원 + 층수 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>인원</label>
              <select value={form.crewSize} onChange={(e) => set("crewSize", parseInt(e.target.value))}
                style={{ ...EDIT_INPUT, cursor: "pointer" }}>
                {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}인</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>층수</label>
              <input type="number" value={form.floor} onChange={(e) => set("floor", parseInt(e.target.value) || 1)} style={EDIT_INPUT} />
            </div>
          </div>

          {/* 주소 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>주소</label>
            <input value={form.address} onChange={(e) => set("address", e.target.value)} style={EDIT_INPUT} />
          </div>

          {/* 금액 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>금액</label>
            <input type="number" value={form.totalPrice} onChange={(e) => set("totalPrice", parseInt(e.target.value) || 0)} style={EDIT_INPUT} />
          </div>

          {/* 체크박스 */}
          <div style={{ display: "flex", gap: 16 }}>
            {([
              ["hasElevator", "엘리베이터"],
              ["hasParking", "주차 가능"],
              ["hasGroundAccess", "지상출입"],
              ["needLadder", "사다리차"],
            ] as const).map(([key, label]) => (
              <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--app-text-primary)", cursor: "pointer" }}>
                <input type="checkbox" checked={form[key] as boolean} onChange={(e) => set(key, e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: "var(--app-accent)" }} />
                {label}
              </label>
            ))}
          </div>

          {/* 품목 */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)" }}>품목 ({form.items.length}개)</label>
              <button onClick={addItem} style={{
                fontSize: 11, padding: "3px 10px", backgroundColor: "var(--app-surface-secondary)",
                border: "none", borderRadius: 6, cursor: "pointer", color: "var(--app-text-secondary)",
              }}>+ 추가</button>
            </div>
            {form.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {form.items.map((item, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px 50px 30px", gap: 6, alignItems: "center" }}>
                    <input value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)} placeholder="카테고리" style={{ ...EDIT_INPUT, fontSize: 12, padding: "6px 8px" }} />
                    <input value={item.name} onChange={(e) => { updateItem(idx, "name", e.target.value); updateItem(idx, "displayName", e.target.value); }} placeholder="품목명" style={{ ...EDIT_INPUT, fontSize: 12, padding: "6px 8px" }} />
                    <input type="number" value={item.price} onChange={(e) => updateItem(idx, "price", parseInt(e.target.value) || 0)} placeholder="가격" style={{ ...EDIT_INPUT, fontSize: 12, padding: "6px 8px" }} />
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} style={{ ...EDIT_INPUT, fontSize: 12, padding: "6px 8px" }} />
                    <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--app-btn-danger-text)", fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 사다리 비용 */}
          {form.needLadder && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>사다리 비용</label>
              <input type="number" value={form.ladderFee} onChange={(e) => set("ladderFee", parseInt(e.target.value) || 0)} style={EDIT_INPUT} />
            </div>
          )}

          {/* 메모 */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>메모</label>
            <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={3} style={{ ...EDIT_INPUT, resize: "vertical" as const }} />
          </div>

          {/* 저장 버튼 */}
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{
              flex: 1, height: 44, borderRadius: 10,
              backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
              border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>취소</button>
            <button onClick={handleCreate} disabled={saving} style={{
              flex: 1, height: 44, borderRadius: 10,
              backgroundColor: saving ? "var(--app-border)" : "var(--app-accent)", color: "var(--app-btn-primary-text)",
              border: "none", fontSize: 14, fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {saving ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 등록 중...</> : "등록"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

