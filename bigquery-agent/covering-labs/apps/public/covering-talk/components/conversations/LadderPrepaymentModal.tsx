"use client";

import { useState } from "react";
import { X, Loader2, Send, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import type { Order } from "@/lib/store/orders";
import { nicepayPayUrl } from "@/lib/nicepay/client";

interface Props {
  parentOrder: Order;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export default function LadderPrepaymentModal({ parentOrder, isOpen, onClose, onRefresh }: Props) {
  const [amountInput, setAmountInput] = useState("");
  const [includedInQuote, setIncludedInQuote] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentReqId, setSentReqId] = useState<string | null>(null);
  const [adjustedTotal, setAdjustedTotal] = useState<number | null>(null);

  if (!isOpen) return null;

  const amount = parseInt(amountInput.replace(/[^0-9]/g, ""), 10) || 0;
  const newParentTotal = includedInQuote ? Math.max(0, parentOrder.totalPrice - amount) : parentOrder.totalPrice;

  const handleSend = async () => {
    if (!amount || amount <= 0) {
      toast.error("사다리차 금액을 입력해주세요");
      return;
    }
    if (includedInQuote && parentOrder.totalPrice < amount) {
      toast.error(`원본 견적(${parentOrder.totalPrice.toLocaleString()}원)이 사다리차 금액보다 작습니다`);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${parentOrder.id}/ladder-prepayment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, includedInQuote, sendType: "2" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "발송 실패");
      setSentReqId(data.reqId);
      setAdjustedTotal(data.parentTotalAdjusted);
      toast.success("사다리차 선결제 링크가 발송되었습니다");
      onRefresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!sentReqId) return;
    try {
      await navigator.clipboard.writeText(nicepayPayUrl(sentReqId));
      toast.success("결제 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패");
    }
  };

  const handleClose = () => {
    setAmountInput("");
    setIncludedInQuote(false);
    setSentReqId(null);
    setAdjustedTotal(null);
    onClose();
  };

  return (
    <div onClick={handleClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      backgroundColor: "var(--app-modal-backdrop)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 440, maxHeight: "85vh", overflow: "auto",
        backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
        padding: "28px 24px", boxShadow: "var(--app-shadow-lg)",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>🪜</span>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>사다리차 선결제 요청</h2>
          </div>
          <button onClick={handleClose} style={{
            width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer",
          }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 원본 주문 요약 */}
        <div style={{
          backgroundColor: "var(--app-bg)", borderRadius: 12, padding: "14px 16px", marginBottom: 18,
          fontSize: 13, color: "var(--app-text-secondary)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span>원본 주문</span>
            <span style={{ color: "var(--app-text-primary)", fontWeight: 600 }}>
              #{parentOrder.orderNumber} · {parentOrder.customerName}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>현재 견적</span>
            <span style={{ color: "var(--app-text-primary)", fontWeight: 600 }}>
              {parentOrder.totalPrice.toLocaleString()}원
            </span>
          </div>
        </div>

        {sentReqId ? (
          // ── 발송 완료 화면 ──
          <div>
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              padding: "20px 0", borderRadius: 12, backgroundColor: "var(--app-btn-success-bg)", marginBottom: 16,
            }}>
              <Check style={{ width: 36, height: 36, color: "var(--app-btn-success-text)" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--app-btn-success-text)" }}>
                {amount.toLocaleString()}원 카카오톡 발송 완료
              </div>
              {adjustedTotal != null && includedInQuote && (
                <div style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>
                  원본 견적: {parentOrder.totalPrice.toLocaleString()}원 → {adjustedTotal.toLocaleString()}원 (차감 적용)
                </div>
              )}
            </div>

            <div style={{
              backgroundColor: "var(--app-bg)", borderRadius: 10, padding: "12px 14px", marginBottom: 12,
              fontSize: 12, color: "var(--app-text-secondary)", wordBreak: "break-all", lineHeight: 1.5,
            }}>
              {nicepayPayUrl(sentReqId)}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCopy} style={{
                flex: 1, height: 40, borderRadius: 10, border: "none", cursor: "pointer",
                backgroundColor: "var(--app-tag-purple-text)", color: "white",
                fontSize: 13, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <Copy style={{ width: 14, height: 14 }} /> 결제 링크 복사
              </button>
              <button onClick={handleClose} style={{
                flex: 1, height: 40, borderRadius: 10,
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                닫기
              </button>
            </div>
          </div>
        ) : (
          // ── 입력 화면 ──
          <div>
            {/* 금액 입력 */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 6 }}>
                사다리차 금액
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text" inputMode="numeric" value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)} placeholder="예: 200000" autoFocus
                  style={{
                    width: "100%", height: 44, padding: "0 36px 0 14px", fontSize: 15, fontWeight: 600,
                    border: "1px solid var(--app-input-border)", borderRadius: 10,
                    outline: "none", boxSizing: "border-box", color: "var(--app-text-primary)",
                    backgroundColor: "var(--app-bg)",
                  }}
                />
                <span style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  fontSize: 13, color: "var(--app-text-tertiary)",
                }}>원</span>
              </div>
            </div>

            {/* 포함 토글 */}
            <div style={{ marginBottom: 18 }}>
              <label style={{
                display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
                padding: "12px 14px", borderRadius: 10,
                backgroundColor: includedInQuote ? "var(--app-tag-purple-bg)" : "var(--app-bg)",
                border: includedInQuote ? "1px solid var(--app-tag-purple-text)" : "1px solid var(--app-border)",
              }}>
                <input
                  type="checkbox" checked={includedInQuote}
                  onChange={(e) => setIncludedInQuote(e.target.checked)}
                  style={{ marginTop: 3, accentColor: "var(--app-tag-purple-text)" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 3 }}>
                    기존 견적에 사다리차 비용 포함됨
                  </div>
                  <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", lineHeight: 1.5 }}>
                    체크 시: 본 견적에서 사다리차 금액을 차감 (이중 청구 방지)
                    {amount > 0 && includedInQuote && (
                      <div style={{ marginTop: 6, color: "var(--app-text-secondary)" }}>
                        {parentOrder.totalPrice.toLocaleString()}원 → <strong style={{ color: "var(--app-text-primary)" }}>{newParentTotal.toLocaleString()}원</strong>
                      </div>
                    )}
                  </div>
                </div>
              </label>
            </div>

            <button onClick={handleSend} disabled={sending || !amount} style={{
              width: "100%", height: 44, borderRadius: 10, border: "none",
              backgroundColor: sending || !amount ? "var(--app-border)" : "var(--app-tag-purple-text)",
              color: "white", fontSize: 14, fontWeight: 600,
              cursor: sending || !amount ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {sending
                ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 발송 중...</>
                : <><Send style={{ width: 16, height: 16 }} /> 카카오톡으로 결제 링크 발송</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
