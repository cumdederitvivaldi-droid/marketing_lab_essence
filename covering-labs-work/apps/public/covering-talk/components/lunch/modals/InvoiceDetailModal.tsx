"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, X, Loader2 } from "lucide-react";
import type { LunchVendor } from "@/lib/store/lunch-vendors";

// ─── Invoice Detail Modal (조회/발행확인) ──────

export function InvoiceDetailModal({ mode, detail, row, issuing, onIssue, onClose }: {
  mode: "view" | "confirm";
  detail?: { issuanceKey: string; ntsTransactionId: string; issuedAt: string; invoice: { date: string; purpose: string; supplier: { organizationName: string; representativeName: string; identificationNumber: string }; supplied: { organizationName: string; representativeName: string; identificationNumber: string }; items: { name: string; supplyCost: number; tax: number }[] } };
  row?: { vendorId: string; vendorName: string; vendor: LunchVendor | null; settlementType: string; orderCount: number; totalAmount: number; supplyCost: number; tax: number; orderNumber?: string; orderDate?: string };
  issuing: boolean;
  onIssue: (itemName: string) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ x: -1, y: -1 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [itemName, setItemName] = useState<string>(() => {
    if (!row) return "도시락용기 수거 서비스";
    return row.settlementType === "tax_invoice"
      ? "도시락용기 수거 서비스"
      : `도시락용기 수거 서비스 (${row.orderDate?.slice(0, 7) || ""})`;
  });

  useEffect(() => {
    if (pos.x === -1) setPos({ x: Math.max(50, (window.innerWidth - 480) / 2), y: Math.max(50, (window.innerHeight - 400) / 2) });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pos.x, onClose]);

  const onDragStart = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => { if (!dragRef.current) return; setPos({ x: dragRef.current.origX + ev.clientX - dragRef.current.startX, y: dragRef.current.origY + ev.clientY - dragRef.current.startY }); };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--app-text-tertiary)", minWidth: 80 };
  const valueStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "var(--app-text-primary)" };
  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--app-border-light)" };

  return (
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 9999, width: 480,
      backgroundColor: "var(--app-modal-bg, white)", borderRadius: 12,
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
    }}>
      {/* Header */}
      <div onMouseDown={onDragStart} style={{
        padding: "14px 18px", cursor: "move",
        backgroundColor: mode === "view" ? "#EFF6FF" : "#FDF4FF",
        borderBottom: "1px solid var(--app-border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: mode === "view" ? "#2563EB" : "#9333EA" }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>
            {mode === "view" ? "세금계산서 조회" : "세금계산서 발행 확인"}
          </span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 18px", maxHeight: 450, overflow: "auto" }}>
        {mode === "view" && detail ? (
          <>
            <div style={{ marginBottom: 14, padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>발행 정보</div>
              <div style={rowStyle}><span style={labelStyle}>국세청 승인번호</span><span style={{ ...valueStyle, fontFamily: "monospace", fontSize: 12 }}>{detail.ntsTransactionId}</span></div>
              <div style={rowStyle}><span style={labelStyle}>발행키</span><span style={{ ...valueStyle, fontFamily: "monospace", fontSize: 11 }}>{detail.issuanceKey.slice(0, 30)}...</span></div>
              <div style={rowStyle}><span style={labelStyle}>발행일시</span><span style={valueStyle}>{new Date(detail.issuedAt).toLocaleString("ko-KR")}</span></div>
              <div style={rowStyle}><span style={labelStyle}>작성일자</span><span style={valueStyle}>{detail.invoice.date}</span></div>
              <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>영수/청구</span><span style={valueStyle}>{detail.invoice.purpose === "RECEIPT" ? "영수" : "청구"}</span></div>
            </div>

            <div style={{ marginBottom: 14, padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>공급자</div>
              <div style={rowStyle}><span style={labelStyle}>상호</span><span style={valueStyle}>{detail.invoice.supplier.organizationName}</span></div>
              <div style={rowStyle}><span style={labelStyle}>대표자</span><span style={valueStyle}>{detail.invoice.supplier.representativeName}</span></div>
              <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>사업자번호</span><span style={valueStyle}>{detail.invoice.supplier.identificationNumber}</span></div>
            </div>

            <div style={{ marginBottom: 14, padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>공급받는자</div>
              <div style={rowStyle}><span style={labelStyle}>상호</span><span style={valueStyle}>{detail.invoice.supplied.organizationName}</span></div>
              <div style={rowStyle}><span style={labelStyle}>대표자</span><span style={valueStyle}>{detail.invoice.supplied.representativeName}</span></div>
              <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>사업자번호</span><span style={valueStyle}>{detail.invoice.supplied.identificationNumber}</span></div>
            </div>

            <div style={{ padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>품목</div>
              {detail.invoice.items.map((item, i) => (
                <div key={i} style={{ ...rowStyle, borderBottom: i < detail.invoice.items.length - 1 ? "1px solid var(--app-border-light)" : "none" }}>
                  <span style={valueStyle}>{item.name}</span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>{(item.supplyCost + (item.tax || 0)).toLocaleString()}원</div>
                    <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>공급가액 {item.supplyCost.toLocaleString()} + 세액 {(item.tax || 0).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : mode === "confirm" && row ? (
          <>
            <div style={{ marginBottom: 14, padding: "10px 12px", backgroundColor: "#FDF4FF", borderRadius: 8, border: "1px solid #E9D5FF" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#9333EA", marginBottom: 4 }}>발행 대상</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>{row.vendorName}</div>
              {row.orderNumber && <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 2 }}>#{row.orderNumber} · {row.orderDate}</div>}
              <div style={{ fontSize: 12, color: "var(--app-text-secondary)", marginTop: 4 }}>
                {row.settlementType === "tax_invoice" ? "단건 발행" : `월말 합산 (${row.orderCount}건)`}
              </div>
            </div>

            <div style={{ marginBottom: 14, padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>공급받는자 정보</div>
              <div style={rowStyle}><span style={labelStyle}>상호</span><span style={valueStyle}>{row.vendor?.name || row.vendorName}</span></div>
              <div style={rowStyle}><span style={labelStyle}>사업자번호</span><span style={valueStyle}>{row.vendor?.businessNumber?.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3") || "-"}</span></div>
              <div style={rowStyle}><span style={labelStyle}>대표자</span><span style={valueStyle}>{row.vendor?.representativeName || "-"}</span></div>
              <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>이메일</span><span style={valueStyle}>{row.vendor?.taxEmail || "-"}</span></div>
            </div>

            <div style={{ marginBottom: 14, padding: "10px 12px", backgroundColor: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#92400E", display: "block", marginBottom: 6 }}>
                품목명 <span style={{ fontWeight: 400 }}>(세금계산서에 표기됩니다 — 실제 서비스 내용으로 수정 필수)</span>
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="예: 폐기물 방문수거 서비스"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 13,
                  border: "1px solid var(--app-border)", borderRadius: 6,
                  outline: "none", boxSizing: "border-box",
                  backgroundColor: "white",
                }}
              />
            </div>

            <div style={{ padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>금액</div>
              <div style={rowStyle}><span style={labelStyle}>공급가액</span><span style={valueStyle}>{row.supplyCost.toLocaleString()}원</span></div>
              <div style={rowStyle}><span style={labelStyle}>세액</span><span style={valueStyle}>{row.tax.toLocaleString()}원</span></div>
              <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>합계</span><span style={{ fontSize: 16, fontWeight: 700, color: "var(--app-accent)" }}>{row.totalAmount.toLocaleString()}원</span></div>
            </div>
          </>
        ) : null}
      </div>

      {/* Footer */}
      {mode === "confirm" && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--app-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 500, borderRadius: 8,
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
            border: "none", cursor: "pointer",
          }}>취소</button>
          <button onClick={() => onIssue(itemName)} disabled={issuing || !itemName.trim()} style={{
            padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8,
            backgroundColor: (issuing || !itemName.trim()) ? "var(--app-border)" : "var(--app-tag-purple-text)",
            color: "white", border: "none", cursor: (issuing || !itemName.trim()) ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {issuing ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <FileText style={{ width: 14, height: 14 }} />}
            {issuing ? "발행 중..." : "발행"}
          </button>
        </div>
      )}
    </div>
  );
}
