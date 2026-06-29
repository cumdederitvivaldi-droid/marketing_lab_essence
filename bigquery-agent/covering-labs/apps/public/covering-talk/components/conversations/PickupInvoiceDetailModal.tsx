"use client";

import { useEffect, useState } from "react";
import { Receipt, X, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { PickupInvoice } from "@/lib/store/pickup-invoices";

interface Props {
  invoiceId: string;
  onClose: () => void;
  onChanged: () => void;
}

interface BoltaDetail {
  issuanceKey: string;
  issuedAt: string;
  ntsTransactionId: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  issued: "발행 완료",
  failed: "실패",
  cancelled: "취소",
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FFF3E0", text: "#E65100" },
  issued: { bg: "#E8F5E9", text: "#2E7D32" },
  failed: { bg: "#FFEBEE", text: "#C62828" },
  cancelled: { bg: "#ECEFF1", text: "#546E7A" },
};

export function PickupInvoiceDetailModal({ invoiceId, onClose, onChanged }: Props) {
  const [invoice, setInvoice] = useState<PickupInvoice | null>(null);
  const [bolta, setBolta] = useState<BoltaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "조회 실패");
        if (!cancelled) {
          setInvoice(data.invoice);
          setBolta(data.bolta);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "조회 실패");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invoiceId]);

  const handleCancel = async () => {
    if (cancelling) return;
    if (!cancelReason.trim()) {
      toast.error("취소 사유를 입력하세요");
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "취소 실패");
      toast.success("세금계산서 취소 완료 (수정발행)");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "취소 실패");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--app-surface)",
          borderRadius: 12,
          width: "100%", maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--app-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Receipt style={{ width: 20, height: 20, color: "var(--app-accent)" }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>
              세금계산서 상세
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 6,
              border: "none", backgroundColor: "transparent",
              cursor: "pointer", color: "var(--app-text-tertiary)",
            }}
          >
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
            </div>
          ) : !invoice ? (
            <div style={{ padding: 20, color: "var(--app-text-tertiary)" }}>발행 이력을 찾을 수 없습니다</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Row label="상태">
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: 12,
                  fontSize: 12, fontWeight: 600,
                  ...(STATUS_COLOR[invoice.status] ?? { bg: "#ECEFF1", text: "#546E7A" }),
                  backgroundColor: (STATUS_COLOR[invoice.status] ?? STATUS_COLOR.pending).bg,
                  color: (STATUS_COLOR[invoice.status] ?? STATUS_COLOR.pending).text,
                }}>
                  {STATUS_LABEL[invoice.status] ?? invoice.status}
                </span>
              </Row>
              <Row label="상호">{invoice.businessName}</Row>
              <Row label="대표자">{invoice.representativeName}</Row>
              <Row label="사업자번호">{invoice.businessNumber}</Row>
              <Row label="이메일">{invoice.email}</Row>
              <Row label="공급가액">{invoice.supplyCost.toLocaleString()}원</Row>
              <Row label="세액">{invoice.tax.toLocaleString()}원</Row>
              <Row label="합계">{invoice.totalAmount.toLocaleString()}원</Row>
              {invoice.description && <Row label="비고">{invoice.description}</Row>}
              <Row label="발행자">{invoice.createdBy ?? "-"}</Row>
              <Row label="발행 요청">{new Date(invoice.createdAt).toLocaleString("ko-KR")}</Row>
              {invoice.issuedAt && <Row label="발행 완료">{new Date(invoice.issuedAt).toLocaleString("ko-KR")}</Row>}
              {invoice.cancelledAt && <Row label="취소">{new Date(invoice.cancelledAt).toLocaleString("ko-KR")}</Row>}
              {invoice.issuanceKey && <Row label="볼타 키"><code style={{ fontSize: 12 }}>{invoice.issuanceKey}</code></Row>}
              {invoice.ntsTransactionId && <Row label="국세청 승인번호"><code style={{ fontSize: 12 }}>{invoice.ntsTransactionId}</code></Row>}
              {invoice.errorMessage && (
                <Row label="에러/취소사유">
                  <span style={{ color: "#C62828" }}>{invoice.errorMessage}</span>
                </Row>
              )}
              {bolta?.issuedAt && (
                <Row label="볼타 발행시각">{new Date(bolta.issuedAt).toLocaleString("ko-KR")}</Row>
              )}
              {invoice.sessionId && <Row label="세션ID"><code style={{ fontSize: 12 }}>{invoice.sessionId}</code></Row>}
            </div>
          )}

          {invoice && invoice.status === "issued" && !showCancel && (
            <button
              onClick={() => setShowCancel(true)}
              style={{
                marginTop: 16, width: "100%", padding: "10px",
                fontSize: 14, fontWeight: 600,
                color: "#C62828", backgroundColor: "#FFEBEE",
                border: "1px solid #FFCDD2", borderRadius: 6,
                cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <AlertTriangle style={{ width: 14, height: 14 }} />
              세금계산서 취소 (수정발행 · 계약의 해제)
            </button>
          )}

          {showCancel && (
            <div style={{
              marginTop: 16, padding: 14,
              backgroundColor: "#FFEBEE", border: "1px solid #FFCDD2",
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#C62828", marginBottom: 8 }}>
                ⚠️ 취소 시 음수 세금계산서가 자동 발행되어 원본을 상쇄합니다. 되돌릴 수 없습니다.
              </div>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="취소 사유를 입력하세요"
                rows={2}
                disabled={cancelling}
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 13,
                  border: "1px solid #FFCDD2", borderRadius: 6,
                  backgroundColor: "white", outline: "none",
                  resize: "vertical", fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowCancel(false); setCancelReason(""); }}
                  disabled={cancelling}
                  style={{
                    padding: "6px 14px", fontSize: 13, fontWeight: 600,
                    backgroundColor: "transparent", color: "var(--app-text-secondary)",
                    border: "1px solid var(--app-border)", borderRadius: 6,
                    cursor: cancelling ? "default" : "pointer",
                  }}
                >
                  되돌리기
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 16px", fontSize: 13, fontWeight: 600,
                    color: "white",
                    backgroundColor: cancelling ? "#90A4AE" : "#C62828",
                    border: "none", borderRadius: 6,
                    cursor: cancelling ? "default" : "pointer",
                  }}
                >
                  {cancelling && <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />}
                  {cancelling ? "취소 처리 중..." : "취소 확정"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
      <span style={{ width: 110, flexShrink: 0, color: "var(--app-text-tertiary)", fontWeight: 500 }}>{label}</span>
      <span style={{ flex: 1, color: "var(--app-text-primary)", wordBreak: "break-all" }}>{children}</span>
    </div>
  );
}
