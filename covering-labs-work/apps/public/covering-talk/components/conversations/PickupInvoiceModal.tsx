"use client";

import { useState } from "react";
import { Receipt, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  sessionId: string;
  customerName: string | null;
  phone: string | null;
  onClose: () => void;
  onIssued: () => void;
}

export function PickupInvoiceModal({ sessionId, customerName, phone, onClose, onIssued }: Props) {
  const [email, setEmail] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [representativeName, setRepresentativeName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [itemName, setItemName] = useState("방문수거 서비스");
  const [description, setDescription] = useState("");
  const [issuing, setIssuing] = useState(false);

  const formatBizNumber = (v: string): string => {
    const d = v.replace(/\D/g, "").slice(0, 10);
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  };

  const handleSubmit = async () => {
    if (issuing) return;

    const trimEmail = email.trim();
    const trimBizNum = businessNumber.replace(/\D/g, "");
    const trimBizName = businessName.trim();
    const trimRep = representativeName.trim();
    const amountNum = Number(totalAmount.replace(/[^\d]/g, ""));

    if (!trimEmail || !trimBizNum || !trimBizName || !trimRep || !amountNum) {
      toast.error("이메일·사업자번호·상호·대표자·금액 모두 필수입니다");
      return;
    }
    if (trimBizNum.length !== 10) {
      toast.error("사업자번호는 숫자 10자리여야 합니다");
      return;
    }
    if (amountNum <= 0) {
      toast.error("금액은 양수여야 합니다");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) {
      toast.error("이메일 형식이 올바르지 않습니다");
      return;
    }

    setIssuing(true);
    try {
      const res = await fetch("/api/invoices/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          email: trimEmail,
          businessNumber: trimBizNum,
          businessName: trimBizName,
          representativeName: trimRep,
          totalAmount: amountNum,
          itemName: itemName.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "발행 실패");
      }
      toast.success("세금계산서 발행 완료");
      onIssued();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "발행 실패";
      toast.error(msg);
    } finally {
      setIssuing(false);
    }
  };

  const supplyCost = (() => {
    const n = Number(totalAmount.replace(/[^\d]/g, ""));
    if (!n) return 0;
    return Math.round(n / 11 * 10);
  })();
  const tax = (() => {
    const n = Number(totalAmount.replace(/[^\d]/g, ""));
    if (!n) return 0;
    return n - supplyCost;
  })();

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    backgroundColor: "var(--app-surface)",
    color: "var(--app-text-primary)",
    outline: "none",
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
          width: "100%", maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--app-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Receipt style={{ width: 20, height: 20, color: "var(--app-accent)" }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>
              세금계산서 발행 (단건)
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

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          {(customerName || phone) && (
            <div style={{
              padding: "10px 12px",
              backgroundColor: "var(--app-tag-blue-bg)",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              fontSize: 13, color: "var(--app-text-secondary)",
            }}>
              고객 참조: {customerName ?? "이름 없음"} {phone ? `· ${phone}` : ""}
            </div>
          )}

          <Field label="이메일" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@company.com"
              style={inputStyle}
              disabled={issuing}
            />
          </Field>

          <Field label="사업자등록번호" required>
            <input
              value={formatBizNumber(businessNumber)}
              onChange={(e) => setBusinessNumber(e.target.value)}
              placeholder="000-00-00000"
              style={inputStyle}
              disabled={issuing}
              inputMode="numeric"
            />
          </Field>

          <Field label="상호" required>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="(주)○○"
              style={inputStyle}
              disabled={issuing}
            />
          </Field>

          <Field label="대표자명" required>
            <input
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              placeholder="홍길동"
              style={inputStyle}
              disabled={issuing}
            />
          </Field>

          <Field label="합계 금액 (부가세 포함)" required>
            <input
              value={totalAmount}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, "");
                setTotalAmount(cleaned ? Number(cleaned).toLocaleString() : "");
              }}
              placeholder="100,000"
              style={inputStyle}
              disabled={issuing}
              inputMode="numeric"
            />
          </Field>

          {(supplyCost > 0 || tax > 0) && (
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: "10px 12px",
              backgroundColor: "var(--app-surface-secondary)",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              fontSize: 13, color: "var(--app-text-secondary)",
            }}>
              <span>공급가액 {supplyCost.toLocaleString()}원</span>
              <span>세액 {tax.toLocaleString()}원</span>
            </div>
          )}

          <Field label="품목명">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="방문수거 서비스"
              style={inputStyle}
              disabled={issuing}
            />
          </Field>

          <Field label="비고">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="(선택)"
              rows={2}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              disabled={issuing}
            />
          </Field>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "flex-end", gap: 8,
          padding: "12px 20px",
          borderTop: "1px solid var(--app-border)",
        }}>
          <button
            onClick={onClose}
            disabled={issuing}
            style={{
              padding: "8px 16px",
              fontSize: 14, fontWeight: 600,
              color: "var(--app-text-secondary)",
              backgroundColor: "transparent",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              cursor: issuing ? "default" : "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={issuing}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 18px",
              fontSize: 14, fontWeight: 600,
              color: "white",
              backgroundColor: issuing ? "var(--app-text-tertiary)" : "var(--app-accent)",
              border: "none",
              borderRadius: 6,
              cursor: issuing ? "default" : "pointer",
            }}
          >
            {issuing && <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />}
            {issuing ? "발행 중..." : "발행"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)" }}>
        {label}
        {required && <span style={{ color: "#FF5B5B", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}
