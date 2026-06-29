"use client";

import { useState, useEffect } from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";

// ─── Cancel Invoice Modal (수정발행 · 계약의 해제) ──────

export function CancelInvoiceModal({ row, cancelling, onCancel, onClose }: {
  row: { vendorName: string; totalAmount: number; supplyCost: number; tax: number; orderNumber?: string; orderDate?: string; invoice: { issuanceKey?: string; issuedAt?: string } | null };
  cancelling: boolean;
  onCancel: (date: string, reason: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"info" | "confirm">("info");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--app-text-tertiary)", minWidth: 80 };
  const valueStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "var(--app-text-primary)" };
  const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--app-border-light)" };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      backgroundColor: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, backgroundColor: "var(--app-modal-bg, white)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px", backgroundColor: "#FEF2F2",
          borderBottom: "1px solid #FECACA",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle style={{ width: 16, height: 16, color: "#DC2626" }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>
              {step === "info" ? "세금계산서 취소 (계약의 해제)" : "취소 최종 확인"}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 18px", maxHeight: 450, overflow: "auto" }}>
          {step === "info" ? (
            <>
              <div style={{ marginBottom: 12, padding: "10px 12px", backgroundColor: "#FFFBEB", borderRadius: 8, border: "1px solid #FDE68A" }}>
                <div style={{ fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
                  정발행된 세금계산서는 삭제 불가합니다. 대신 <b>동일 금액을 음수(-)</b>로 뒤집은 수정세금계산서(계약의 해제)를 발행하여 원본을 상계처리합니다. 이 작업은 되돌릴 수 없습니다.
                </div>
              </div>

              <div style={{ marginBottom: 12, padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>원본 세금계산서</div>
                <div style={rowStyle}><span style={labelStyle}>거래처</span><span style={valueStyle}>{row.vendorName}</span></div>
                {row.orderNumber && <div style={rowStyle}><span style={labelStyle}>주문</span><span style={valueStyle}>#{row.orderNumber} · {row.orderDate}</span></div>}
                <div style={rowStyle}><span style={labelStyle}>금액</span><span style={valueStyle}>{row.totalAmount.toLocaleString()}원</span></div>
                {row.invoice?.issuedAt && <div style={rowStyle}><span style={labelStyle}>발행일시</span><span style={valueStyle}>{new Date(row.invoice.issuedAt).toLocaleString("ko-KR")}</span></div>}
                <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>발행키</span><span style={{ ...valueStyle, fontFamily: "monospace", fontSize: 11 }}>{row.invoice?.issuanceKey?.slice(0, 30)}...</span></div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>
                  계약 해제일 <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{
                  width: "100%", padding: "8px 10px", fontSize: 13,
                  border: "1px solid var(--app-border)", borderRadius: 6,
                  outline: "none", boxSizing: "border-box",
                }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>
                  취소 사유 <span style={{ fontWeight: 400, color: "var(--app-text-tertiary)" }}>(내부 메모, 선택)</span>
                </label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                  placeholder="예: 품목명 오기입, 이메일 오류 등"
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 13,
                    border: "1px solid var(--app-border)", borderRadius: 6,
                    outline: "none", boxSizing: "border-box", resize: "vertical",
                  }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 14, padding: "12px 14px", backgroundColor: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B", marginBottom: 6 }}>⚠ 최종 확인</div>
                <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.6 }}>
                  <b>{row.vendorName}</b> 세금계산서 ({row.totalAmount.toLocaleString()}원) 를 <b>{date}</b> 자로 계약의 해제 처리합니다. 음수 수정세금계산서가 자동 발행되어 원본이 상계되며, <b>되돌릴 수 없습니다</b>.
                </div>
              </div>

              <div style={{ padding: "10px 12px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8 }}>
                <div style={rowStyle}><span style={labelStyle}>거래처</span><span style={valueStyle}>{row.vendorName}</span></div>
                <div style={rowStyle}><span style={labelStyle}>상계 금액</span><span style={{ ...valueStyle, color: "#DC2626" }}>-{row.totalAmount.toLocaleString()}원</span></div>
                <div style={rowStyle}><span style={labelStyle}>계약 해제일</span><span style={valueStyle}>{date}</span></div>
                <div style={{ ...rowStyle, borderBottom: "none" }}><span style={labelStyle}>사유</span><span style={valueStyle}>{reason || "-"}</span></div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--app-border)", display: "flex", justifyContent: "space-between", gap: 8 }}>
          <button
            onClick={step === "info" ? onClose : () => setStep("info")}
            disabled={cancelling}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 500, borderRadius: 8,
              backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
              border: "none", cursor: cancelling ? "not-allowed" : "pointer",
            }}>
            {step === "info" ? "닫기" : "이전"}
          </button>
          {step === "info" ? (
            <button
              onClick={() => setStep("confirm")}
              disabled={!date}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                backgroundColor: date ? "#DC2626" : "var(--app-border)",
                color: "white", border: "none", cursor: date ? "pointer" : "not-allowed",
              }}>
              다음 → 확인
            </button>
          ) : (
            <button
              onClick={() => onCancel(date, reason)}
              disabled={cancelling}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                backgroundColor: cancelling ? "var(--app-border)" : "#DC2626",
                color: "white", border: "none", cursor: cancelling ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}>
              {cancelling ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <AlertCircle style={{ width: 14, height: 14 }} />}
              {cancelling ? "처리 중..." : "취소 발행"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
