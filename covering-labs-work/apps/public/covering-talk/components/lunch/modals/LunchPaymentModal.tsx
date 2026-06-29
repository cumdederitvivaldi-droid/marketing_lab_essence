"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CreditCard, X, RefreshCw, Loader2, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import type { LunchOrder } from "@/lib/store/lunch-orders";
import { nicepayPayUrl } from "@/lib/nicepay/client";

export function LunchPaymentModal({
  order, ownerPhone, onClose, onRefresh,
}: {
  order: LunchOrder;
  ownerPhone: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  // 모든 결제 링크의 상태 추적 (reqId → status)
  const [allStatuses, setAllStatuses] = useState<Record<string, {
    payStatus?: string; svcNm?: string; amt?: number;
    tid?: string; sentStatus?: string; sendDt?: string; payDt?: string;
  }>>({});
  const [showSendForm, setShowSendForm] = useState(order.paymentIds.length === 0);
  const [sendMethod, setSendMethod] = useState<"2" | "0">("2");
  const [editPhone, setEditPhone] = useState(ownerPhone);
  const [editAmount, setEditAmount] = useState(order.totalAmount);

  // onRefresh를 ref로 고정 (deps에 포함하지 않기 위함)
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  // 모든 결제 링크 상태 일괄 조회
  const fetchAllStatuses = useCallback(async () => {
    if (order.paymentIds.length === 0) return;
    setChecking(true);
    try {
      const results: typeof allStatuses = {};
      await Promise.all(
        order.paymentIds.map(async (p) => {
          if (!p.reqId) return;
          try {
            const params = new URLSearchParams({ reqId: p.reqId, orderId: order.id });
            const res = await fetch(`/api/lunch/payment?${params}`);
            if (res.ok) {
              const data = await res.json();
              results[p.reqId] = data;
              if (data.payStatus === "결제완료") onRefreshRef.current();
            }
          } catch { /* skip */ }
        })
      );
      setAllStatuses(results);
    } finally { setChecking(false); }
  }, [order.paymentIds, order.id]);

  // 모달 오픈 시 1회만 조회 (paymentIds 참조 변화로 재호출 방지: order.id만 트리거)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAllStatuses(); }, [order.id]);

  const handleSend = async () => {
    const phoneDigits = editPhone.replace(/[^0-9]/g, "");
    if (!editAmount || editAmount <= 0) { toast.error("정산금액이 없습니다"); return; }
    if (!phoneDigits || phoneDigits.length < 10) { toast.error("연락처가 유효하지 않습니다"); return; }

    setSending(true);
    try {
      const res = await fetch("/api/lunch/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sendType: sendMethod,
          rows: [{ id: order.id, vendorName: order.vendorName, ownerPhone: editPhone, totalAmount: editAmount }],
        }),
      });
      const data = await res.json();
      if (data.ok && data.successCount > 0) {
        toast.success("결제 링크 발송 완료");
        setShowSendForm(false);
        onRefresh();
        // 잠시 후 전체 상태 새로고침
        setTimeout(fetchAllStatuses, 1500);
      } else {
        toast.error(data.results?.[0]?.message || "발송 실패");
      }
    } catch { toast.error("발송 중 오류 발생"); }
    finally { setSending(false); }
  };

  const copyPayUrl = async (reqId: string) => {
    try {
      await navigator.clipboard.writeText(nicepayPayUrl(reqId));
      toast.success("결제 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패");
    }
  };

  const payColor = (s?: string) => {
    if (s === "결제완료") return { bg: "var(--app-btn-success-bg)", color: "var(--app-btn-success-text)" };
    if (s === "결제실패" || s === "결제중지") return { bg: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)" };
    return { bg: "var(--app-tag-yellow-bg)", color: "var(--app-tag-yellow-text)" };
  };

  // 결제완료된 링크가 있는지 확인
  const anyPaid = Object.values(allStatuses).some((s) => s.payStatus === "결제완료");

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      backgroundColor: "var(--app-modal-backdrop)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxHeight: "85vh", overflow: "auto",
        backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
        padding: "28px 24px", boxShadow: "var(--app-shadow-lg)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CreditCard style={{ width: 20, height: 20, color: "var(--app-tag-purple-text)" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>결제 관리</h2>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer" }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* Customer info */}
        <div style={{ backgroundColor: "var(--app-bg)", borderRadius: 12, padding: 16, marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 4 }}>지점명</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)" }}>{order.vendorName}</div>
          </div>
          <InfoRow label="정산금액"><span style={{ fontWeight: 600 }}>{order.totalAmount.toLocaleString()}원</span></InfoRow>
        </div>

        {/* 결제 이력 (모든 링크) */}
        {order.paymentIds.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>결제 이력 ({order.paymentIds.length}건)</span>
              <button onClick={fetchAllStatuses} disabled={checking} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6,
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                border: "none", fontSize: 12, cursor: "pointer",
              }}>
                <RefreshCw style={{ width: 12, height: 12, animation: checking ? "spin 1s linear infinite" : "none" }} />
                {checking ? "조회 중" : "전체 새로고침"}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {order.paymentIds.map((p, i) => {
                const st = allStatuses[p.reqId];
                const pc = payColor(st?.payStatus);
                const sentDate = p.sentAt ? new Date(p.sentAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
                return (
                  <div key={p.reqId || i} style={{
                    backgroundColor: "var(--app-bg)", borderRadius: 10, padding: "12px 14px",
                    border: st?.payStatus === "결제완료" ? "2px solid var(--app-btn-success-text)" : "1px solid var(--app-border)",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>#{i + 1} · {sentDate}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {p.reqId && st?.payStatus !== "결제완료" && (
                          <button onClick={() => copyPayUrl(p.reqId)} title="결제 링크 복사" style={{
                            display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", fontSize: 11,
                            borderRadius: 6, backgroundColor: "var(--app-surface-secondary)",
                            color: "var(--app-text-secondary)", border: "none", cursor: "pointer",
                          }}>
                            <Copy style={{ width: 11, height: 11 }} /> 링크
                          </button>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                          backgroundColor: st ? pc.bg : "var(--app-surface-secondary)",
                          color: st ? pc.color : "var(--app-text-tertiary)",
                        }}>
                          {st?.payStatus || (checking ? "조회 중..." : "확인 필요")}
                        </span>
                      </div>
                    </div>
                    {st?.payStatus === "결제완료" && st.payDt && (
                      <div style={{ fontSize: 12, color: "var(--app-btn-success-text)", fontWeight: 500 }}>
                        결제 완료: {st.payDt} {st.svcNm && `(${st.svcNm})`}
                      </div>
                    )}
                    {st?.payStatus === "결제완료" && st.tid && (
                      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>TID: {st.tid}</div>
                    )}
                    {p.paidAt && (
                      <div style={{ fontSize: 12, color: "var(--app-btn-success-text)", fontWeight: 500 }}>
                        결제 확인됨: {new Date(p.paidAt).toLocaleString("ko-KR")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 발송 폼 (신규 or 재발송) */}
        {showSendForm ? (
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 4 }}>연락처</div>
              <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="010-0000-0000"
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid var(--app-input-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--app-text-primary)" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 4 }}>정산금액</div>
              <div style={{ position: "relative" }}>
                <input type="number" value={editAmount || ""} onChange={(e) => setEditAmount(parseInt(e.target.value) || 0)} placeholder="0"
                  style={{ width: "100%", padding: "8px 12px", paddingRight: 30, fontSize: 14, border: "1px solid var(--app-input-border)", borderRadius: 8, outline: "none", boxSizing: "border-box", color: "var(--app-text-primary)" }} />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--app-text-tertiary)" }}>원</span>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 8 }}>발송 방식</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([{ value: "2" as const, label: "카카오톡" }, { value: "0" as const, label: "SMS" }]).map(({ value, label }) => (
                  <button key={value} onClick={() => setSendMethod(value)} style={{
                    flex: 1, height: 42, borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backgroundColor: sendMethod === value ? "var(--app-tag-purple-bg)" : "var(--app-bg)",
                    border: sendMethod === value ? "2px solid var(--app-tag-purple-text)" : "1px solid var(--app-border)",
                    color: sendMethod === value ? "var(--app-tag-purple-text)" : "var(--app-text-secondary)",
                    fontSize: 13, fontWeight: sendMethod === value ? 600 : 400, cursor: "pointer",
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {order.paymentIds.length > 0 && (
                <button onClick={() => setShowSendForm(false)} style={{
                  flex: 1, height: 44, borderRadius: 10, border: "1px solid var(--app-border)",
                  backgroundColor: "var(--app-surface)", color: "var(--app-text-secondary)",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}>취소</button>
              )}
              <button onClick={handleSend} disabled={sending} style={{
                flex: 1, height: 44, borderRadius: 10,
                backgroundColor: sending ? "var(--app-border)" : "var(--app-tag-purple-text)",
                color: "var(--app-btn-primary-text)", border: "none", fontSize: 14, fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                {sending ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 발송 중...</>
                  : <><CreditCard style={{ width: 16, height: 16 }} /> {order.paymentIds.length > 0 ? "재발송" : "결제 요청 발송"}</>}
              </button>
            </div>
          </div>
        ) : (
          /* 재발송 버튼 (결제완료가 아닌 경우만) */
          !anyPaid && (
            <button onClick={() => setShowSendForm(true)} style={{
              width: "100%", height: 44, borderRadius: 10,
              backgroundColor: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)",
              border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Send style={{ width: 16, height: 16 }} />
              결제 재발송 요청
            </button>
          )
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-primary)" }}>{children}</span>
    </div>
  );
}
