"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Loader2, ChevronLeft, ChevronRight, Send,
  FileText, Check, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { LunchOrder } from "@/lib/store/lunch-orders";
import type { LunchVendor } from "@/lib/store/lunch-vendors";
import { InvoiceDetailModal } from "@/components/lunch/modals/InvoiceDetailModal";
import { CancelInvoiceModal } from "@/components/lunch/modals/CancelInvoiceModal";

// ─── Local helpers (Th, HoverTooltip 인라인 복제) ──────

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

// ─── Invoice List View (세금계산서 탭) ──────────

export function LunchInvoicesView({ vendors, orders, onRefresh }: {
  vendors: LunchVendor[];
  orders: LunchOrder[];
  onRefresh: () => void;
}) {
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [invoices, setInvoices] = useState<{
    id?: string; vendorId: string; vendorName: string; period: string;
    supplyCost: number; tax: number; totalAmount: number; orderCount: number;
    status: string; issuanceKey?: string; issuedAt?: string;
  }[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<"all" | "tax_invoice" | "monthly_invoice">("all");

  // 선택 월 기준: 세금계산서/월말정산 주문 수집
  const taxOrders = useMemo(() =>
    orders.filter((o) =>
      o.date.startsWith(selectedPeriod)
      && o.status !== "cancelled"
      && (o.settlementType === "tax_invoice" || o.settlementType === "monthly_invoice")
    ),
    [orders, selectedPeriod]
  );

  // DB에서 발행 이력 조회
  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const res = await fetch(`/api/lunch/invoices?period=${selectedPeriod}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch { /* ignore */ }
    setLoadingInvoices(false);
  }, [selectedPeriod]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // 오늘 날짜 (YYYY-MM-DD, 로컬 타임존)
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // rows 생성: 세금계산서=주문 1건씩 / 월말정산=벤더별 합산
  type InvoiceRow = {
    key: string;
    vendorId: string; vendorName: string; vendor: LunchVendor | null;
    settlementType: string; orderCount: number; totalAmount: number;
    supplyCost: number; tax: number; invoice: typeof invoices[0] | null;
    hasRequiredInfo: boolean;
    isFuture: boolean;
    futureDates: string[];
    disableReason: string | null;
    orderNumber?: string; orderDate?: string; orderId?: string;
  };

  const allRows = useMemo(() => {
    const result: InvoiceRow[] = [];

    // 같은 (vendorId, period)에 여러 invoice 레코드가 있을 때 활성 레코드 선택
    // 우선순위: issued > pending > failed > cancelled
    const STATUS_RANK: Record<string, number> = { issued: 4, pending: 3, failed: 2, cancelled: 1 };
    const pickActiveInvoice = (vendorId: string, period: string) => {
      const candidates = invoices.filter((inv) => inv.vendorId === vendorId && inv.period === period);
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0));
      return candidates[0];
    };

    const buildDisableReason = (hasInfo: boolean, isFuture: boolean, futureDates: string[]): string | null => {
      const parts: string[] = [];
      if (!hasInfo) parts.push("사업자 정보 미입력 (사업자번호/대표자명/세금계산서 이메일 필요)");
      if (isFuture) {
        if (futureDates.length === 1) {
          parts.push(`미래 날짜 주문 (수거일 ${futureDates[0]}) - 수거 완료 후 발행 가능`);
        } else {
          parts.push(`미래 날짜 주문 ${futureDates.length}건 포함 (${futureDates.slice(0, 3).join(", ")}${futureDates.length > 3 ? " 외" : ""}) - 수거 완료 후 발행 가능`);
        }
      }
      return parts.length > 0 ? parts.join(" / ") : null;
    };

    // 세금계산서 (단건)
    for (const o of taxOrders.filter((o) => o.settlementType === "tax_invoice")) {
      const v = vendors.find((tv) => tv.id === o.vendorId || tv.name === o.vendorName) || null;
      const amt = o.totalAmount;
      const sc = Math.round(amt / 11 * 10);
      const hasInfo = !!(v?.businessNumber && v?.representativeName && v?.taxEmail);
      const isFuture = o.date > today;
      const futureDates = isFuture ? [o.date] : [];
      result.push({
        key: `single-${o.id}`, vendorId: v?.id || o.vendorId || o.vendorName,
        vendorName: v?.name || o.vendorName, vendor: v, settlementType: "tax_invoice",
        orderCount: 1, totalAmount: amt, supplyCost: sc, tax: amt - sc,
        invoice: pickActiveInvoice(v?.id || o.vendorId || o.vendorName, o.date),
        hasRequiredInfo: hasInfo,
        isFuture,
        futureDates,
        disableReason: buildDisableReason(hasInfo, isFuture, futureDates),
        orderNumber: o.orderNumber, orderDate: o.date, orderId: o.id,
      });
    }

    // 월말정산 (합산)
    const mMap = new Map<string, { vendor: LunchVendor | null; orders: LunchOrder[]; total: number }>();
    for (const o of taxOrders.filter((o) => o.settlementType === "monthly_invoice")) {
      const v = vendors.find((tv) => tv.id === o.vendorId || tv.name === o.vendorName) || null;
      const mk = v?.id || o.vendorId || o.vendorName;
      if (!mMap.has(mk)) mMap.set(mk, { vendor: v, orders: [], total: 0 });
      const e = mMap.get(mk)!; e.orders.push(o); e.total += o.totalAmount;
    }
    for (const [key, s] of mMap) {
      const v = s.vendor;
      const inv = pickActiveInvoice(key, selectedPeriod);
      const amt = s.total; const sc = Math.round(amt / 11 * 10);
      const hasInfo = !!(v?.businessNumber && v?.representativeName && v?.taxEmail);
      const futureDates = s.orders.filter((o) => o.date > today).map((o) => o.date).sort();
      const isFuture = futureDates.length > 0;
      result.push({
        key: `monthly-${key}`, vendorId: v?.id || key,
        vendorName: v?.name || s.orders[0]?.vendorName || key, vendor: v,
        settlementType: "monthly_invoice", orderCount: s.orders.length,
        totalAmount: amt, supplyCost: sc, tax: amt - sc,
        invoice: inv || null, hasRequiredInfo: hasInfo,
        isFuture,
        futureDates,
        disableReason: buildDisableReason(hasInfo, isFuture, futureDates),
      });
    }

    return result.sort((a, b) => b.totalAmount - a.totalAmount);
  }, [taxOrders, invoices, vendors, selectedPeriod, today]);

  // 필터 적용
  const rows = useMemo(() =>
    typeFilter === "all" ? allRows : allRows.filter((r) => r.settlementType === typeFilter),
    [allRows, typeFilter]
  );

  // 합계
  const totalSupply = rows.reduce((s, r) => s + r.supplyCost, 0);
  const totalTax = rows.reduce((s, r) => s + r.tax, 0);
  const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);

  // 체크박스
  const allChecked = rows.length > 0 && rows.every((r) => selectedKeys.has(r.key));
  const toggleAll = () => {
    if (allChecked) { setSelectedKeys(new Set()); }
    else { setSelectedKeys(new Set(rows.map((r) => r.key))); }
  };
  const toggleRow = (key: string) => {
    const next = new Set(selectedKeys);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedKeys(next);
  };

  const handleIssue = async (rowKey: string, itemNameOverride?: string) => {
    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;
    if (!row.hasRequiredInfo) { toast.error("사업자 정보를 먼저 입력해주세요"); return; }
    if (row.isFuture) { toast.error("미래 날짜 주문은 수거 완료 후 발행 가능합니다"); return; }
    if (row.invoice?.status === "issued") { toast.error("이미 발행된 세금계산서입니다"); return; }
    setIssuing(rowKey);
    try {
      const body: Record<string, string | undefined> = { vendorId: row.vendorId, period: selectedPeriod };
      if (row.settlementType === "tax_invoice" && row.orderId) { body.orderId = row.orderId; body.invoiceType = "single"; }
      if (itemNameOverride && itemNameOverride.trim()) body.itemName = itemNameOverride.trim();
      const res = await fetch("/api/lunch/invoices/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const text = await res.text();
      let data: { error?: string } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON (Vercel HTML 오류페이지 등) */ }
      if (!res.ok) {
        throw new Error(data.error || (text ? `발행 실패 [${res.status}]: ${text.slice(0, 200)}` : `발행 실패 [${res.status}]: 빈 응답`));
      }
      toast.success(`${row.vendorName} 세금계산서 발행 완료`);
      setInvoiceModal(null);
      fetchInvoices(); onRefresh();
    } catch (err) { toast.error(err instanceof Error ? err.message : "발행 실패"); }
    finally { setIssuing(null); }
  };

  // 선택 일괄 발행
  const handleBulkIssue = async () => {
    const targets = rows.filter((r) => selectedKeys.has(r.key) && r.invoice?.status !== "issued" && r.hasRequiredInfo && !r.isFuture);
    if (targets.length === 0) { toast.error("발행 가능한 항목이 없습니다"); return; }
    for (const r of targets) { await handleIssue(r.key); }
    setSelectedKeys(new Set());
  };

  // 조회/발행 모달 상태
  const [invoiceModal, setInvoiceModal] = useState<{
    mode: "view" | "confirm";
    row?: typeof allRows[0];
    detail?: { issuanceKey: string; ntsTransactionId: string; issuedAt: string; invoice: { date: string; purpose: string; supplier: { organizationName: string; representativeName: string; identificationNumber: string }; supplied: { organizationName: string; representativeName: string; identificationNumber: string }; items: { name: string; supplyCost: number; tax: number }[] } };
  } | null>(null);

  // 취소(수정발행) 모달 상태
  const [cancelModal, setCancelModal] = useState<{ row: typeof allRows[0] } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelInvoice = async (issuanceKey: string, date: string, reason: string) => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/lunch/invoices/${issuanceKey}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, reason }),
      });
      const text = await res.text();
      let data: { error?: string; amendIssuanceKey?: string; restoredOrderCount?: number } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
      if (!res.ok) throw new Error(data.error || (text ? `취소 실패 [${res.status}]: ${text.slice(0, 200)}` : `취소 실패 [${res.status}]`));
      toast.success(`세금계산서 취소 완료 (상계 수정발행키: ${data.amendIssuanceKey?.slice(0, 16)}...)`);
      setCancelModal(null);
      fetchInvoices();
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setCancelling(false);
    }
  };

  const handleViewInvoice = async (issuanceKey: string) => {
    try {
      const res = await fetch(`/api/lunch/invoices/${issuanceKey}`);
      const text = await res.text();
      if (!text) throw new Error("서버 응답이 비어있습니다");
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data.error || `조회 실패 (${res.status})`);
      setInvoiceModal({ mode: "view", detail: data });
    } catch (err) { toast.error(err instanceof Error ? err.message : "조회 실패"); }
  };

  const handleIssueConfirm = (rowKey: string) => {
    const row = rows.find((r) => r.key === rowKey);
    if (!row) return;
    if (!row.hasRequiredInfo) { toast.error("사업자 정보를 먼저 입력해주세요"); return; }
    if (row.isFuture) { toast.error("미래 날짜 주문은 수거 완료 후 발행 가능합니다"); return; }
    if (row.invoice?.status === "issued") { toast.error("이미 발행된 세금계산서입니다"); return; }
    setInvoiceModal({ mode: "confirm", row });
  };

  const adjustMonth = (delta: number) => {
    const [y, m] = selectedPeriod.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelectedKeys(new Set());
  };

  const singleCount = allRows.filter((r) => r.settlementType === "tax_invoice").length;
  const monthlyCount = allRows.filter((r) => r.settlementType === "monthly_invoice").length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 32px", borderBottom: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>세금계산서 관리</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => adjustMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <ChevronLeft style={{ width: 18, height: 18, color: "var(--app-text-secondary)" }} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--app-text-primary)", minWidth: 100, textAlign: "center" }}>
              {selectedPeriod.replace("-", "년 ")}월
            </span>
            <button onClick={() => adjustMonth(1)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <ChevronRight style={{ width: 18, height: 18, color: "var(--app-text-secondary)" }} />
            </button>
          </div>
        </div>

        {/* Filter tabs + 선택 액션 */}
        {/* 합계 */}
        <div style={{
          display: "flex", gap: 20, padding: "10px 0", marginBottom: 10,
          fontSize: 13, color: "var(--app-text-secondary)",
        }}>
          <span>{rows.length}건</span>
          <span>공급가액 <b style={{ color: "var(--app-text-primary)" }}>{totalSupply.toLocaleString()}원</b></span>
          <span>세액 <b style={{ color: "var(--app-text-primary)" }}>{totalTax.toLocaleString()}원</b></span>
          <span>합계 <b style={{ color: "var(--app-accent)", fontSize: 14 }}>{totalAmount.toLocaleString()}원</b></span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {([
              { key: "all" as const, label: `전체 ${allRows.length}건` },
              { key: "tax_invoice" as const, label: `세금계산서 ${singleCount}건` },
              { key: "monthly_invoice" as const, label: `월말정산 ${monthlyCount}건` },
            ]).map(({ key, label }) => (
              <button key={key} onClick={() => { setTypeFilter(key); setSelectedKeys(new Set()); }}
                style={{
                  padding: "6px 14px", fontSize: 13, fontWeight: typeFilter === key ? 600 : 400, borderRadius: 8,
                  backgroundColor: typeFilter === key ? "var(--app-accent)" : "var(--app-surface-secondary)",
                  color: typeFilter === key ? "white" : "var(--app-text-secondary)",
                  border: "none", cursor: "pointer",
                }}>
                {label}
              </button>
            ))}
          </div>
          {selectedKeys.size > 0 && (
            <button onClick={handleBulkIssue} style={{
              padding: "6px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8,
              backgroundColor: "var(--app-tag-purple-text)", color: "white",
              border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
            }}>
              <Send style={{ width: 13, height: 13 }} />
              선택 {selectedKeys.size}건 일괄 발행
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 32px 32px" }}>
        {loadingInvoices ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--app-text-placeholder)" }}>
            <FileText style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.5 }} />
            <p style={{ margin: 0 }}>해당 조건의 주문이 없습니다</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--app-border)" }}>
                <th style={{ padding: "10px 4px", textAlign: "center" }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: "pointer" }} />
                </th>
                <Th>지점명</Th>
                <Th>정산방식</Th>
                <Th>주문번호</Th>
                <Th>건수</Th>
                <Th style={{ textAlign: "right" }}>공급가액</Th>
                <Th style={{ textAlign: "right" }}>세액</Th>
                <Th style={{ textAlign: "right" }}>합계</Th>
                <Th style={{ textAlign: "center" }}>사업자</Th>
                <Th>발행 상태</Th>
                <Th style={{ textAlign: "center" }}>액션</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isIssued = r.invoice?.status === "issued";
                const isFailed = r.invoice?.status === "failed";
                const isTax = r.settlementType === "tax_invoice";
                return (
                  <tr key={r.key} style={{ borderBottom: "1px solid var(--app-border-light)" }}>
                    <td style={{ padding: "10px 4px", textAlign: "center" }}>
                      <input type="checkbox" checked={selectedKeys.has(r.key)} onChange={() => toggleRow(r.key)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "10px 8px", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vendorName}</td>
                    <td style={{ padding: "10px 4px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        backgroundColor: isTax ? "#EFF6FF" : "#FDF4FF",
                        color: isTax ? "#2563EB" : "#9333EA",
                        border: `1px solid ${isTax ? "#BFDBFE" : "#E9D5FF"}`,
                      }}>
                        {isTax ? "세금계산서" : "월말정산"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px", fontSize: 12, fontFamily: "monospace", color: "var(--app-text-secondary)" }}>
                      {r.orderNumber ? (
                        <div>
                          <div>#{r.orderNumber}</div>
                          <div style={{ fontSize: 11, color: "var(--app-text-placeholder)" }}>{r.orderDate}</div>
                        </div>
                      ) : <span style={{ color: "var(--app-text-placeholder)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 4px", fontSize: 12, textAlign: "center" }}>{isTax ? "단건" : `${r.orderCount}건`}</td>
                    <td style={{ padding: "10px 8px", fontSize: 13, textAlign: "right" }}>{r.supplyCost.toLocaleString()}</td>
                    <td style={{ padding: "10px 8px", fontSize: 13, textAlign: "right" }}>{r.tax.toLocaleString()}</td>
                    <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 600, textAlign: "right" }}>{r.totalAmount.toLocaleString()}</td>
                    <td style={{ padding: "10px 4px", textAlign: "center" }}>
                      {r.disableReason ? (
                        <HoverTooltip text={r.disableReason}>
                          <AlertCircle style={{ width: 14, height: 14, color: "#D97706" }} />
                        </HoverTooltip>
                      ) : (
                        <Check style={{ width: 14, height: 14, color: "#059669" }} />
                      )}
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      {isIssued ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 8, backgroundColor: "#ECFDF5", color: "#059669" }}>발행완료</span>
                      ) : isFailed ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 8, backgroundColor: "#FFEBEE", color: "#C62828" }}>실패</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--app-text-placeholder)" }}>미발행</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 4px", textAlign: "center" }}>
                      {isIssued && r.invoice?.issuanceKey ? (
                        <div style={{ display: "inline-flex", gap: 4 }}>
                          <button onClick={() => handleViewInvoice(r.invoice!.issuanceKey!)} style={{
                            fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 6,
                            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                            border: "1px solid var(--app-border)", cursor: "pointer",
                          }}>조회</button>
                          <button onClick={() => setCancelModal({ row: r })} style={{
                            fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 6,
                            backgroundColor: "#FEF2F2", color: "#DC2626",
                            border: "1px solid #FECACA", cursor: "pointer",
                          }}>취소</button>
                        </div>
                      ) : (() => {
                        const canIssue = r.hasRequiredInfo && !r.isFuture;
                        const btn = (
                          <button onClick={() => handleIssueConfirm(r.key)}
                            disabled={issuing === r.key || !canIssue}
                            style={{
                              fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 6,
                              backgroundColor: canIssue ? "var(--app-tag-purple-text)" : "var(--app-border)",
                              color: canIssue ? "white" : "var(--app-text-placeholder)",
                              border: "none", cursor: canIssue ? "pointer" : "not-allowed",
                            }}>
                            {issuing === r.key ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : "발행"}
                          </button>
                        );
                        return !canIssue && r.disableReason
                          ? <HoverTooltip text={r.disableReason}>{btn}</HoverTooltip>
                          : btn;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 세금계산서 조회/발행확인 모달 */}
      {invoiceModal && (
        <InvoiceDetailModal
          mode={invoiceModal.mode}
          detail={invoiceModal.detail}
          row={invoiceModal.row}
          issuing={!!issuing}
          onIssue={(itemName) => { if (invoiceModal.row) handleIssue(invoiceModal.row.key, itemName); }}
          onClose={() => setInvoiceModal(null)}
        />
      )}

      {/* 세금계산서 취소(수정발행·계약의 해제) 모달 */}
      {cancelModal && (
        <CancelInvoiceModal
          row={cancelModal.row}
          cancelling={cancelling}
          onCancel={(date, reason) => {
            const key = cancelModal.row.invoice?.issuanceKey;
            if (!key) { toast.error("발행키가 없습니다"); return; }
            handleCancelInvoice(key, date, reason);
          }}
          onClose={() => setCancelModal(null)}
        />
      )}
    </div>
  );
}
