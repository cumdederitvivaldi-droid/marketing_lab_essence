"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, CreditCard, RefreshCw, CheckCircle, Loader2, MessageSquare, Send, Copy } from "lucide-react";
import { toast } from "sonner";
import { Order } from "@/lib/store/orders";
import { nicepayPayUrl } from "@/lib/nicepay/client";

interface PaymentModalProps {
  booking: Order;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  editablePrice?: boolean; // 금액 수정 가능 여부
}

interface PaymentHistoryEntry {
  reqId: string;
  payStatus: string;
  svcNm?: string;
  amt?: number;
  tid?: string;
  sendDt?: string;
  payDt?: string;
  sentAt?: string;
}

interface PaymentStatus {
  payStatus?: string;
  svcNm?: string;
  amt?: number;
  tid?: string;
  sentStatus?: string;
  sendDt?: string;
  payDt?: string;
  totalSent?: number;
  history?: PaymentHistoryEntry[];
}

type SendMethod = "2" | "0";

export default function PaymentModal({ booking, isOpen, onClose, onRefresh, editablePrice }: PaymentModalProps) {
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [hasSent, setHasSent] = useState(booking.paymentIds?.length > 0);
  const [sendMethod, setSendMethod] = useState<SendMethod>("2");

  // 금액 수정
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(String(booking.totalPrice || 0));
  const [currentPrice, setCurrentPrice] = useState(booking.totalPrice || 0);

  // 독촉 메시지
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");

  const amount = currentPrice;

  const latestReqId = booking.paymentIds?.[booking.paymentIds.length - 1]?.reqId;
  useEffect(() => {
    if (isOpen && booking.customerName && amount) {
      const linkLine = latestReqId ? `\n결제 링크: ${nicepayPayUrl(latestReqId)}\n` : "";
      setReminderMessage(
        `안녕하세요 ${booking.customerName}고객님,\n지난번 수거 서비스는 만족스러우셨나요?\n\n서비스 이용 내역을 확인하던 중 아직 결제가 완료되지 않은 것으로 확인되어 안내 드립니다.\n[ 결제 금액: ${(amount ?? 0).toLocaleString("ko-KR")}원 ]${linkLine}\n혹시 결제 방법이나 금액 관련 문의가 있으시다면 말씀해주세요.\n\n감사합니다.`
      );
    }
  }, [isOpen, booking.customerName, amount, latestReqId]);

  const copyPayUrl = async (reqId: string) => {
    try {
      await navigator.clipboard.writeText(nicepayPayUrl(reqId));
      toast.success("결제 링크가 복사되었습니다");
    } catch {
      toast.error("복사 실패");
    }
  };

  // onRefresh를 ref로 고정 (useCallback deps에서 제거하기 위함)
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const fetchStatus = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/orders/${booking.id}/payment`);
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        if (data.payStatus === "결제완료") onRefreshRef.current();
      } else {
        toast.error(data.error || "조회 실패");
      }
    } catch {
      toast.error("조회 오류");
    } finally {
      setChecking(false);
    }
  }, [booking.id]);

  useEffect(() => {
    if (isOpen && hasSent) {
      fetchStatus();
    }
  }, [isOpen, hasSent, fetchStatus]);

  const handleSend = async (resend = false) => {
    if (!amount || amount <= 0) {
      toast.error("결제 금액이 설정되지 않았습니다. 수정에서 최종금액을 먼저 입력해주세요.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/orders/${booking.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendType: sendMethod, resend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "결제 요청 실패");
      toast.success(sendMethod === "0" ? "결제 링크가 SMS로 발송되었습니다" : "결제 링크가 카카오톡으로 발송되었습니다");
      setHasSent(true);
      onRefresh();
      setTimeout(() => fetchStatus(), 1000);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSending(false);
    }
  };

  const handlePriceSave = async () => {
    const newPrice = parseInt(priceInput.replace(/[^0-9]/g, ""), 10);
    if (isNaN(newPrice) || newPrice <= 0) { toast.error("유효한 금액을 입력해주세요"); return; }
    try {
      const res = await fetch(`/api/orders/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalPrice: newPrice }),
      });
      if (res.ok) { setCurrentPrice(newPrice); setEditingPrice(false); toast.success("금액 수정 완료"); onRefresh(); }
      else toast.error("금액 수정 실패");
    } catch { toast.error("수정 중 오류"); }
  };

  const [markingComplete, setMarkingComplete] = useState(false);
  const handleMarkComplete = async () => {
    if (markingComplete) return;
    if (!confirm("수거가 완료된 것으로 처리하시겠습니까? 상태가 '완료'로 바뀝니다.")) return;
    setMarkingComplete(true);
    try {
      const res = await fetch(`/api/orders/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) throw new Error("상태 변경 실패");
      toast.success("수거 완료 처리되었습니다");
      onRefresh();
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setMarkingComplete(false);
    }
  };

  const handleSendReminder = async () => {
    if (!booking.sessionId) {
      toast.error("연결된 상담 세션이 없습니다");
      return;
    }
    if (!reminderMessage.trim()) {
      toast.error("메시지를 입력해주세요");
      return;
    }
    setSendingReminder(true);
    try {
      const res = await fetch(`/api/conversations/${booking.sessionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reminderMessage.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "발송 실패");
      }
      toast.success("결제 안내 메시지가 발송되었습니다");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSendingReminder(false);
    }
  };

  if (!isOpen) return null;

  const payStatusColor = (s?: string) => {
    if (s === "결제완료") return { bg: "var(--app-btn-success-bg)", color: "var(--app-btn-success-text)", label: "결제완료" };
    if (s === "결제실패") return { bg: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)", label: "결제실패" };
    if (s === "결제중지") return { bg: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)", label: "결제중단" };
    return { bg: "var(--app-tag-yellow-bg)", color: "var(--app-tag-yellow-text)", label: s || "미완료" };
  };

  const isPaid = status?.payStatus === "결제완료";
  const history = status?.history ?? [];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "var(--app-modal-backdrop)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460, maxHeight: "85vh", overflow: "auto",
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          padding: "28px 24px", boxShadow: "var(--app-shadow-lg)",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CreditCard style={{ width: 20, height: 20, color: "var(--app-tag-purple-text)" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>결제 관리</h2>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer" }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 고객 정보 */}
        <div style={{
          backgroundColor: "var(--app-bg)", borderRadius: 12, padding: "16px",
          marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 4 }}>고객명</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)" }}>{booking.customerName}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 4 }}>결제 금액</div>
            {editablePrice && editingPrice ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="text" value={priceInput} onChange={(e) => setPriceInput(e.target.value)}
                  style={{ width: 100, padding: "4px 8px", fontSize: 14, fontWeight: 600, border: "1px solid var(--app-border)", borderRadius: 6, textAlign: "right" }}
                  autoFocus onKeyDown={(e) => e.key === "Enter" && handlePriceSave()} />
                <button onClick={handlePriceSave} style={{ padding: "4px 8px", fontSize: 11, fontWeight: 600, backgroundColor: "var(--app-tag-purple-text)", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>저장</button>
                <button onClick={() => { setEditingPrice(false); setPriceInput(String(currentPrice)); }} style={{ padding: "4px 8px", fontSize: 11, backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)", border: "none", borderRadius: 6, cursor: "pointer" }}>취소</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)" }}>
                  {(amount ?? 0).toLocaleString("ko-KR")}원
                </span>
                {editablePrice && (
                  <button onClick={() => setEditingPrice(true)} style={{ padding: "2px 6px", fontSize: 10, fontWeight: 500, backgroundColor: "var(--app-border)", color: "var(--app-text-secondary)", border: "none", borderRadius: 4, cursor: "pointer" }}>수정</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 결제 미발송 상태 ── */}
        {!hasSent && (
          <div>
            <SendMethodPicker sendMethod={sendMethod} setSendMethod={setSendMethod} />
            <div style={{
              backgroundColor: "var(--app-tag-yellow-bg)", borderRadius: 10, padding: "14px 16px",
              marginBottom: 16, fontSize: 13, color: "var(--app-tag-yellow-text)", lineHeight: 1.5,
            }}>
              {sendMethod === "2" ? "카카오톡으로 결제 링크를 발송합니다." : "SMS로 결제 링크를 발송합니다."}
              <br />발송 후 고객이 링크를 통해 결제를 진행합니다.
            </div>
            <button onClick={() => handleSend(false)} disabled={sending} style={sendBtnStyle(sending)}>
              {sending ? <><Loader2 style={spinnerStyle} /> 발송 중...</> : <><CreditCard style={{ width: 16, height: 16 }} /> 결제 요청 발송</>}
            </button>
          </div>
        )}

        {/* ── 결제 발송 완료 → 이력 표시 ── */}
        {hasSent && (
          <div>
            {checking && !status ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", color: "var(--app-text-tertiary)", gap: 8, fontSize: 14 }}>
                <Loader2 style={spinnerStyle} /> 결제 상태 조회 중...
              </div>
            ) : status ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* 대표 상태 */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 0", gap: 8 }}>
                  {isPaid && <CheckCircle style={{ width: 28, height: 28, color: "var(--app-btn-success-text)" }} />}
                  <span style={{ fontSize: 20, fontWeight: 700, color: payStatusColor(status.payStatus).color }}>
                    {payStatusColor(status.payStatus).label}
                  </span>
                </div>

                {/* 결제 이력 리스트 */}
                {history.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>
                      결제 이력 ({history.length}건)
                    </div>
                    {history.map((h, i) => {
                      const sc = payStatusColor(h.payStatus);
                      const isLatest = i === history.length - 1;
                      return (
                        <div key={h.reqId} style={{
                          backgroundColor: isLatest ? "var(--app-bg)" : "var(--app-surface-secondary)",
                          borderRadius: 10, padding: "12px 14px",
                          border: isLatest ? "1px solid var(--app-border)" : "none",
                          opacity: isLatest ? 1 : 0.7,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
                              {i + 1}차 발송
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {h.reqId && h.payStatus !== "결제완료" && (
                                <button onClick={() => copyPayUrl(h.reqId)} title="결제 링크 복사" style={{
                                  display: "flex", alignItems: "center", gap: 3, padding: "2px 6px", fontSize: 11,
                                  borderRadius: 6, backgroundColor: "var(--app-surface-secondary)",
                                  color: "var(--app-text-secondary)", border: "none", cursor: "pointer",
                                }}>
                                  <Copy style={{ width: 11, height: 11 }} /> 링크
                                </button>
                              )}
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: "2px 8px",
                                borderRadius: 6, backgroundColor: sc.bg, color: sc.color,
                              }}>
                                {sc.label}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 13 }}>
                            {h.sentAt && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--app-text-secondary)" }}>발송</span>
                                <span style={{ color: "var(--app-text-primary)" }}>{formatDateTime(h.sentAt)}</span>
                              </div>
                            )}
                            {h.sendDt && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--app-text-secondary)" }}>발송</span>
                                <span style={{ color: "var(--app-text-primary)" }}>{h.sendDt}</span>
                              </div>
                            )}
                            {h.payDt && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--app-text-secondary)" }}>결제</span>
                                <span style={{ color: "var(--app-text-primary)" }}>{h.payDt}</span>
                              </div>
                            )}
                            {h.svcNm && (
                              <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--app-text-secondary)" }}>수단</span>
                                <span style={{ color: "var(--app-text-primary)" }}>{h.svcNm}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 새로고침 + 재발송 */}
                {!isPaid && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={fetchStatus} disabled={checking} style={{
                      width: "100%", height: 40, borderRadius: 10,
                      backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                      border: "none", fontSize: 13, fontWeight: 500, cursor: checking ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                      <RefreshCw style={{ width: 14, height: 14, animation: checking ? "spin 1s linear infinite" : "none" }} />
                      {checking ? "조회 중..." : "결제 상태 새로고침"}
                    </button>

                    {/* 재발송 */}
                    <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 12, marginTop: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 8 }}>재발송 방식</div>
                      <SendMethodPicker sendMethod={sendMethod} setSendMethod={setSendMethod} />
                      <button onClick={() => handleSend(true)} disabled={sending} style={{
                        ...sendBtnStyle(sending), backgroundColor: sending ? "var(--app-border)" : "var(--app-tag-orange-text)",
                      }}>
                        {sending ? <><Loader2 style={spinnerStyle} /> 발송 중...</> : <><CreditCard style={{ width: 16, height: 16 }} /> 결제 재발송</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* ── 선결제완료 → 수거완료 처리 ── */}
        {booking.status === "prepaid" && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--app-border)" }}>
            <button onClick={handleMarkComplete} disabled={markingComplete} style={{
              width: "100%", height: 40, borderRadius: 10,
              backgroundColor: markingComplete ? "var(--app-border)" : "var(--app-btn-success-text)",
              color: "white", border: "none", fontSize: 13, fontWeight: 600,
              cursor: markingComplete ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {markingComplete ? <><Loader2 style={spinnerStyle} /> 처리 중...</> : <><CheckCircle style={{ width: 16, height: 16 }} /> 수거 완료 처리</>}
            </button>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--app-text-tertiary)", textAlign: "center" }}>
              선결제완료 상태입니다. 수거가 끝났으면 위 버튼으로 완료 처리해주세요.
            </div>
          </div>
        )}

        {/* ── 결제 안내 메시지 ── */}
        {booking.sessionId && !isPaid && (
          <div style={{ marginTop: 20, borderTop: "1px solid var(--app-border)", paddingTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <MessageSquare style={{ width: 15, height: 15, color: "var(--app-accent)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>결제 안내 메시지 발송</span>
            </div>
            <textarea
              value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} rows={7}
              style={{
                width: "100%", fontSize: 13, color: "var(--app-text-primary)",
                backgroundColor: "var(--app-bg)", borderRadius: 8,
                padding: "10px 12px", border: "1px solid var(--app-border)",
                outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box",
              }}
            />
            <button onClick={handleSendReminder} disabled={sendingReminder} style={{
              marginTop: 8, width: "100%", height: 40, borderRadius: 10,
              backgroundColor: sendingReminder ? "var(--app-border)" : "var(--app-accent)",
              color: "white", border: "none", fontSize: 13, fontWeight: 600,
              cursor: sendingReminder ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              {sendingReminder ? <><Loader2 style={spinnerStyle} /> 발송 중...</> : <><Send style={{ width: 14, height: 14 }} /> 상담 채팅으로 메시지 발송</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components & helpers ──────────────────

function SendMethodPicker({ sendMethod, setSendMethod }: { sendMethod: SendMethod; setSendMethod: (m: SendMethod) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {([
        { value: "2" as SendMethod, label: "카카오톡", emoji: "💬" },
        { value: "0" as SendMethod, label: "SMS", emoji: "📱" },
      ]).map(({ value, label, emoji }) => (
        <button key={value} onClick={() => setSendMethod(value)} style={{
          flex: 1, height: 42, borderRadius: 10,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          backgroundColor: sendMethod === value ? "var(--app-tag-purple-bg)" : "var(--app-bg)",
          border: sendMethod === value ? "2px solid #7B1FA2" : "1px solid var(--app-border)",
          color: sendMethod === value ? "var(--app-tag-purple-text)" : "var(--app-text-secondary)",
          fontSize: 13, fontWeight: sendMethod === value ? 600 : 400, cursor: "pointer",
        }}>
          <span>{emoji}</span> {label}
        </button>
      ))}
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

const spinnerStyle: React.CSSProperties = { width: 16, height: 16, animation: "spin 1s linear infinite" };

function sendBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%", height: 44, borderRadius: 10,
    backgroundColor: disabled ? "var(--app-border)" : "var(--app-tag-purple-text)",
    color: "white", border: "none", fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
  };
}
