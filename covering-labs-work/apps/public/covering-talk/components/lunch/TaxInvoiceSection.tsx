"use client";

import { useState, useEffect, useRef } from "react";
import { FileText, AlertCircle, Eye, Upload } from "lucide-react";
import { toast } from "sonner";
import type { LunchOrder } from "@/lib/store/lunch-orders";
import type { LunchVendor } from "@/lib/store/lunch-vendors";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export function TaxInvoiceSection({ vendor, order, onVendorUpdate }: {
  vendor: LunchVendor;
  order: LunchOrder;
  onVendorUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const certInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    businessNumber: vendor.businessNumber || "",
    representativeName: vendor.representativeName || "",
    taxEmail: vendor.taxEmail || "",
    taxPhone: vendor.taxPhone || vendor.ownerPhone || "",
  });

  // 벤더 변경 시 폼 리셋
  useEffect(() => {
    setForm({
      businessNumber: vendor.businessNumber || "",
      representativeName: vendor.representativeName || "",
      taxEmail: vendor.taxEmail || "",
      taxPhone: vendor.taxPhone || vendor.ownerPhone || "",
    });
    setEditing(false);
  }, [vendor.id, vendor.businessNumber, vendor.representativeName, vendor.taxEmail, vendor.taxPhone, vendor.ownerPhone]);

  const hasRequiredInfo = !!(vendor.businessNumber && vendor.representativeName && vendor.taxEmail);

  const handleCertUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/lunch/vendors/${vendor.id}/cert`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "업로드 실패");
      toast.success("사업자등록증 업로드 완료");
      onVendorUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.businessNumber || !form.representativeName || !form.taxEmail) {
      toast.error("사업자등록번호, 대표자명, 이메일은 필수입니다");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/lunch/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("저장 실패");
      toast.success("사업자 정보 저장 완료");
      setEditing(false);
      onVendorUpdate();
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 8px", border: "1px solid var(--app-border)",
    borderRadius: 6, fontSize: 12, outline: "none", boxSizing: "border-box",
    backgroundColor: "var(--app-input-bg, var(--app-surface))",
  };

  // order is currently unused but kept on the props for future per-order overrides
  void order;

  return (
    <div style={{ padding: "0 20px", marginBottom: 16 }}>
      <div style={{
        backgroundColor: "var(--app-bg)", borderRadius: 10, padding: 14,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <FileText style={{ width: 13, height: 13, color: "var(--app-text-tertiary)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)" }}>세금계산서 정보</span>
          </div>
          {!editing ? (
            <button onClick={() => setEditing(true)} style={{
              fontSize: 11, fontWeight: 500, color: "var(--app-accent)",
              background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
            }}>
              {hasRequiredInfo ? "수정" : "입력"}
            </button>
          ) : (
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={handleSave} disabled={saving} style={{
                fontSize: 11, fontWeight: 600, color: "#059669",
                background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
              }}>
                {saving ? "..." : "저장"}
              </button>
              <button onClick={() => setEditing(false)} style={{
                fontSize: 11, fontWeight: 500, color: "var(--app-text-tertiary)",
                background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
              }}>
                취소
              </button>
            </div>
          )}
        </div>

        {!editing ? (
          hasRequiredInfo ? (
            <>
              <DetailRow label="사업자번호" value={vendor.businessNumber.replace(/(\d{3})(\d{2})(\d{5})/, "$1-$2-$3")} />
              <DetailRow label="대표자명" value={vendor.representativeName} />
              <DetailRow label="이메일" value={vendor.taxEmail} />
              <DetailRow label="연락처" value={vendor.taxPhone || vendor.ownerPhone || "-"} />
            </>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 0", fontSize: 12, color: "var(--app-text-placeholder)",
            }}>
              <AlertCircle style={{ width: 13, height: 13 }} />
              사업자 정보를 입력해야 세금계산서를 발행할 수 있습니다
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>
                사업자등록번호 <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder="1234567890" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>
                대표자명 <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input value={form.representativeName} onChange={(e) => setForm({ ...form, representativeName: e.target.value })}
                placeholder="홍길동" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>
                세금계산서 수신 이메일 <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input value={form.taxEmail} onChange={(e) => setForm({ ...form, taxEmail: e.target.value })}
                placeholder="tax@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3, display: "block" }}>
                연락처
              </label>
              <input value={form.taxPhone} onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                let formatted = digits;
                if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
                else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
                setForm({ ...form, taxPhone: formatted });
              }}
                placeholder={vendor.ownerPhone || "010-0000-0000"} style={inputStyle} />
              <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", marginTop: 2 }}>비워두면 사장님 연락처 사용</div>
            </div>
          </div>
        )}

        {/* 사업자등록증 업로드/미리보기 — 항상 표시 */}
        <div style={{ borderTop: "1px solid var(--app-border-light)", paddingTop: 8, marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)" }}>사업자등록증</span>
            <div style={{ display: "flex", gap: 4 }}>
              {vendor.businessCertUrl && (
                <button onClick={() => window.open(vendor.businessCertUrl, "_blank")} style={{
                  fontSize: 10, fontWeight: 500, color: "var(--app-accent)",
                  background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
                  display: "flex", alignItems: "center", gap: 2,
                }}>
                  <Eye style={{ width: 11, height: 11 }} /> 보기
                </button>
              )}
              <button onClick={() => certInputRef.current?.click()} disabled={uploading} style={{
                fontSize: 10, fontWeight: 500, color: "var(--app-text-secondary)",
                background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
                display: "flex", alignItems: "center", gap: 2,
              }}>
                <Upload style={{ width: 11, height: 11 }} /> {uploading ? "..." : vendor.businessCertUrl ? "재업로드" : "업로드"}
              </button>
            </div>
          </div>
          {vendor.businessCertUrl ? (
            vendor.businessCertUrl.endsWith(".pdf") ? (
              <div style={{
                padding: "8px 10px", borderRadius: 6, backgroundColor: "var(--app-surface-secondary)",
                fontSize: 11, color: "var(--app-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              }} onClick={() => window.open(vendor.businessCertUrl, "_blank")}>
                <FileText style={{ width: 14, height: 14, flexShrink: 0 }} />
                사업자등록증.pdf
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vendor.businessCertUrl} alt="사업자등록증"
                onClick={() => window.open(vendor.businessCertUrl, "_blank")}
                style={{ width: "100%", borderRadius: 6, cursor: "zoom-in", border: "1px solid var(--app-border)" }} />
            )
          ) : (
            <div style={{
              padding: "12px", borderRadius: 6, border: "1px dashed var(--app-border)",
              textAlign: "center", fontSize: 11, color: "var(--app-text-placeholder)", cursor: "pointer",
            }} onClick={() => certInputRef.current?.click()}>
              {uploading ? "업로드 중..." : "사업자등록증 이미지 또는 PDF를 업로드하세요"}
            </div>
          )}
          <input ref={certInputRef} type="file" accept="image/*,.pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCertUpload(f); e.target.value = ""; }}
            style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}
