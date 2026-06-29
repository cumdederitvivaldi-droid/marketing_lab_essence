"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, FlaskConical, Loader2, Send, Clock, Trash2,
  Users, CheckCircle2, XCircle, AlertCircle, RefreshCw, X, ChevronLeft, ChevronRight,
  Plus, Upload, Pencil, Copy, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthContext";
import type { BrandMessageCampaign, BrandMessageRecipient, CampaignStats, CampaignStatus } from "@/lib/store/brand-message";
import type { BrandMessageButton, BrandMessageCoupon } from "@/lib/sweettracker/types";

const LAB_ALLOWED_USERS = ["김원빈", "강성진"];
const TEST_PHONE_DEFAULT = "01071997626";

const BUTTON_TYPES = [
  { value: "WL", label: "웹링크" },
  { value: "AL", label: "앱링크" },
  { value: "BK", label: "봇키워드" },
  { value: "MD", label: "메시지전달" },
  { value: "BC", label: "상담톡전환" },
  { value: "BT", label: "봇전환" },
];

// ─── 포맷 헬퍼 ────────────────────────────────────────────────────────────────

function formatKst(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toDatetimeLocalKst(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function datetimeLocalToIso(local: string): string {
  // datetime-local → KST ISO
  return new Date(local + ":00+09:00").toISOString();
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles: Record<CampaignStatus, React.CSSProperties> = {
    draft: { backgroundColor: "var(--app-surface)", color: "var(--app-text-secondary)", border: "1px solid var(--app-border)" },
    scheduled: { backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)" },
    sending: { backgroundColor: "rgba(59,130,246,0.12)", color: "#2563EB" },
    completed: { backgroundColor: "var(--app-btn-success-bg)", color: "var(--app-btn-success-text)" },
    failed: { backgroundColor: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)" },
    cancelled: { backgroundColor: "var(--app-surface)", color: "var(--app-text-tertiary)", border: "1px solid var(--app-border)", opacity: 0.7 },
  };
  const labels: Record<CampaignStatus, string> = {
    draft: "초안", scheduled: "예약됨", sending: "발송 중",
    completed: "완료", failed: "실패", cancelled: "취소됨",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 8, ...styles[status] }}>
      {status === "sending" && <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />}
      {labels[status]}
    </span>
  );
}

// ─── 통계 카드 ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      backgroundColor: "var(--app-surface)", borderRadius: 12,
      border: "1px solid var(--app-border)", padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: 28, fontWeight: 800, color }}>{value.toLocaleString("ko-KR")}</span>
    </div>
  );
}

// ─── 카카오톡 메시지 미리보기 ─────────────────────────────────────────────────

function KakaoPreview({ recipient }: { recipient: BrandMessageRecipient | null }) {
  if (!recipient) return null;

  const buttons = Array.isArray(recipient.buttons) ? recipient.buttons as { name: string; type: string; url_mobile?: string }[] : [];
  const coupon = recipient.coupon as { name?: string; desc?: string } | null;

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{
        width: 280, backgroundColor: "#ABC1D1",
        borderRadius: 20, padding: "24px 16px",
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
      }}>
        {/* 프로필 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            backgroundColor: "#4CAF50",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, color: "white",
          }}>
            C
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>커버링스팟</span>
        </div>

        {/* 메시지 버블 */}
        <div style={{
          backgroundColor: "white", borderRadius: "4px 12px 12px 12px",
          overflow: "hidden", width: "100%",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        }}>
          {/* 이미지 */}
          {recipient.image_url && (
            <div style={{ width: "100%", aspectRatio: "3/2", overflow: "hidden", backgroundColor: "#f0f0f0" }}>
              <img
                src={recipient.image_url}
                alt="메시지 이미지"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>
          )}

          {/* 본문 */}
          <div style={{ padding: "12px 14px" }}>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: "#333", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {recipient.message}
            </p>
          </div>

          {/* 버튼 */}
          {buttons.length > 0 && (
            <div style={{ borderTop: "1px solid #eee" }}>
              {buttons.map((btn, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 14px", textAlign: "center", fontSize: 12, fontWeight: 600,
                    color: "#4285F4", borderBottom: i < buttons.length - 1 ? "1px solid #eee" : "none",
                    cursor: "default",
                  }}
                >
                  {btn.name}
                </div>
              ))}
            </div>
          )}

          {/* 쿠폰 */}
          {coupon && (
            <div style={{
              margin: "8px 14px 12px",
              padding: "10px 12px", borderRadius: 8,
              backgroundColor: "#FFF8E7", border: "1px solid #FBBF24",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>{coupon.name}</div>
              {coupon.desc && <div style={{ fontSize: 11, color: "#B45309", marginTop: 2 }}>{coupon.desc}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 메시지 일괄 수정 모달 ────────────────────────────────────────────────────

const editInputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 13,
  border: "1px solid var(--app-input-border, var(--app-border))", borderRadius: 8,
  outline: "none", backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)",
  boxSizing: "border-box",
};

const editMiniBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "4px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600,
  color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
  border: "1px solid var(--app-tag-purple-text)", cursor: "pointer",
};

const editMiniBtnDanger: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 7, flexShrink: 0,
  color: "var(--app-btn-danger-text)", backgroundColor: "var(--app-btn-danger-bg)",
  border: "none", cursor: "pointer",
};

interface EditSample {
  message: string;
  image_url?: string | null;
  image_link?: string | null;
  buttons?: BrandMessageButton[] | null;
  coupon?: BrandMessageCoupon | null;
}

function EditCampaignModal({
  campaign,
  currentSample,
  onClose,
  onSaved,
}: {
  campaign: BrandMessageCampaign;
  currentSample: EditSample | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState(currentSample?.message ?? "");
  const [imageUrl, setImageUrl] = useState(currentSample?.image_url ?? "");
  const [imageLink, setImageLink] = useState(currentSample?.image_link ?? "");
  const [buttons, setButtons] = useState<BrandMessageButton[]>(
    Array.isArray(currentSample?.buttons) ? (currentSample!.buttons as BrandMessageButton[]) : []
  );
  const [couponEnabled, setCouponEnabled] = useState(!!currentSample?.coupon);
  const [coupon, setCoupon] = useState<BrandMessageCoupon>(
    currentSample?.coupon ?? { name: "", desc: "", url_mobile: "" }
  );
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const messageType = campaign.message_type;
  const messageMaxLen = messageType === "FW" ? 76 : 1300;
  const buttonMaxCount = messageType === "FW" ? 2 : (couponEnabled ? 4 : 5);
  const messageOver = message.length > messageMaxLen;

  const handleImageUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast.error("이미지는 5MB 이하만 가능합니다");
    if (!["image/jpeg", "image/png"].includes(file.type)) return toast.error("jpg / png 만 지원");
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("kind", messageType === "FW" ? "wide" : "default");
      const res = await fetch("/api/lab/brand-message/upload-image", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "업로드 실패");
      setImageUrl(data.imageUrl);
      toast.success(`이미지 업로드 완료 — ${data.imageName ?? file.name}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setUploadingImage(false);
    }
  };

  const addButton = () => {
    if (buttons.length >= buttonMaxCount) {
      toast.error(`${messageType} 타입은 버튼 최대 ${buttonMaxCount}개`);
      return;
    }
    setButtons([...buttons, { name: "", type: "WL", url_mobile: "" }]);
  };

  const updateButton = (idx: number, patch: Partial<BrandMessageButton>) => {
    setButtons(buttons.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  };

  const removeButton = (idx: number) => setButtons(buttons.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!message.trim()) return toast.error("메시지 본문을 입력해주세요");
    if (messageOver) return toast.error(`메시지가 ${messageMaxLen}자를 초과합니다`);
    if ((messageType === "FW" || messageType === "FI") && !imageUrl.trim()) {
      return toast.error("이미지 URL을 입력해주세요");
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { message: message.trim() };
      if (imageUrl.trim()) body.image_url = imageUrl.trim();
      if (imageLink.trim()) body.image_link = imageLink.trim();
      if (buttons.length > 0) body.buttons = buttons;
      if (couponEnabled && coupon.name) body.coupon = coupon;
      const res = await fetch(`/api/lab/brand-message/campaigns/${campaign.id}/bulk-update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "일괄 수정 실패");
      toast.success(`${data.updated}건 일괄 수정 완료`);
      // race 방지 — fetchDetail 완료까지 기다린 후 close (재개봉 시 즉시 새 content prefill)
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        backgroundColor: "var(--app-modal-backdrop, rgba(0,0,0,0.5))",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540, maxHeight: "85vh", display: "flex", flexDirection: "column",
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          border: "1px solid var(--app-border)",
          boxShadow: "var(--app-shadow-lg, 0 20px 60px rgba(0,0,0,0.3))",
        }}
      >
        {/* 헤더 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--app-border)", flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" }}>메시지 일괄 수정</h2>
            <div style={{ fontSize: 12, color: "var(--app-tag-purple-text)", marginTop: 3, fontWeight: 600 }}>
              {campaign.label}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 폼 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 메시지 본문 */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--app-text-primary)" }}>
              메시지 본문 ({message.length} / {messageMaxLen}자)
            </label>
            <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>
              {messageType === "FW" ? "FW 와이드: 76자 / 줄바꿈 5개 / 버튼 2개 max" : "FI/FT: 1300자 / 줄바꿈 99개 / 버튼 5개 max"}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              style={{
                ...editInputStyle, resize: "vertical", lineHeight: 1.5,
                color: messageOver ? "var(--app-btn-danger-text)" : "var(--app-text-primary)",
              }}
            />
          </div>

          {/* 이미지 (FW / FI) */}
          {(messageType === "FW" || messageType === "FI") && (
            <>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--app-text-primary)" }}>이미지</label>
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>
                  {messageType === "FW" ? "와이드 — 800x600 권장 / 비율 2:1~1:1 / jpg·png / 5MB 이하" : "일반 — 800x400 권장 / 비율 2:1~3:4 / jpg·png / 5MB 이하"}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="이미지 URL (또는 파일 선택)"
                    style={{ ...editInputStyle, flex: 1 }}
                  />
                  <label style={{
                    display: "flex", alignItems: "center", gap: 4, cursor: uploadingImage ? "wait" : "pointer",
                    padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)",
                    border: "1px solid var(--app-tag-purple-text)", whiteSpace: "nowrap", flexShrink: 0,
                    opacity: uploadingImage ? 0.5 : 1,
                  }}>
                    {uploadingImage
                      ? <><Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> 업로드 중</>
                      : <><Upload style={{ width: 12, height: 12 }} /> 파일 선택</>}
                    <input
                      type="file" accept="image/jpeg,image/png" disabled={uploadingImage}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ""; }}
                      style={{ display: "none" }}
                    />
                  </label>
                </div>
                {imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="upload preview" style={{ marginTop: 6, maxWidth: 140, maxHeight: 90, borderRadius: 6, border: "1px solid var(--app-border)" }} />
                )}
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4, color: "var(--app-text-primary)" }}>이미지 링크 (선택)</label>
                <input
                  type="text"
                  value={imageLink}
                  onChange={(e) => setImageLink(e.target.value)}
                  placeholder="https://covering.app/..."
                  style={editInputStyle}
                />
              </div>
            </>
          )}

          {/* 버튼들 */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>버튼 ({buttons.length} / {buttonMaxCount})</span>
              <button onClick={addButton} disabled={buttons.length >= buttonMaxCount} style={{ ...editMiniBtn, opacity: buttons.length >= buttonMaxCount ? 0.4 : 1 }}>
                <Plus style={{ width: 12, height: 12 }} /> 추가
              </button>
            </div>
            {buttons.length === 0 && <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>버튼 없음</span>}
            {buttons.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <select value={b.type} onChange={(e) => updateButton(i, { type: e.target.value })}
                  style={{ ...editInputStyle, width: 110, padding: "5px 8px" }}>
                  {BUTTON_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
                </select>
                <input
                  type="text" value={b.name} onChange={(e) => updateButton(i, { name: e.target.value })}
                  placeholder="버튼명 (8자)"
                  style={{ ...editInputStyle, width: 120 }}
                />
                <input
                  type="text" value={b.url_mobile ?? ""} onChange={(e) => updateButton(i, { url_mobile: e.target.value })}
                  placeholder={b.type === "WL" ? "Mobile URL" : "(선택)"}
                  style={{ ...editInputStyle, flex: 1 }}
                  disabled={b.type !== "WL" && b.type !== "AL"}
                />
                <button onClick={() => removeButton(i)} style={editMiniBtnDanger} title="삭제">
                  <Trash2 style={{ width: 12, height: 12 }} />
                </button>
              </div>
            ))}
          </div>

          {/* 쿠폰 */}
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8, color: "var(--app-text-primary)" }}>
              <input type="checkbox" checked={couponEnabled} onChange={(e) => setCouponEnabled(e.target.checked)} />
              쿠폰 강조 버튼 추가 (1개)
            </label>
            {couponEnabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input
                  type="text" value={coupon.name ?? ""} onChange={(e) => setCoupon({ ...coupon, name: e.target.value })}
                  placeholder="쿠폰명"
                  style={editInputStyle}
                />
                <input
                  type="text" value={coupon.desc ?? ""} onChange={(e) => setCoupon({ ...coupon, desc: e.target.value })}
                  placeholder={`쿠폰 설명 (${messageType === "FW" ? "18" : "12"}자)`}
                  style={editInputStyle}
                />
                <input
                  type="text" value={coupon.url_mobile ?? ""} onChange={(e) => setCoupon({ ...coupon, url_mobile: e.target.value })}
                  placeholder="쿠폰 Mobile URL"
                  style={editInputStyle}
                />
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div style={{
          display: "flex", gap: 8, padding: "16px 24px 20px",
          borderTop: "1px solid var(--app-border)", flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "12px", fontSize: 14, fontWeight: 600,
              color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface)",
              border: "1px solid var(--app-border)", borderRadius: 10, cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || messageOver}
            style={{
              flex: 2, padding: "12px", fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              color: "white",
              backgroundColor: saving || messageOver ? "var(--app-border)" : "var(--app-tag-purple-text)",
              border: "none", borderRadius: 10,
              cursor: saving || messageOver ? "not-allowed" : "pointer",
            }}
          >
            {saving
              ? <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> 저장 중…</>
              : `${campaign.total_count.toLocaleString("ko-KR")}건 일괄 수정`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 수신자 목록 모달 ─────────────────────────────────────────────────────────

function RecipientsModal({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const [status, setStatus] = useState<"" | "pending" | "sent" | "failed">("");
  const [recipients, setRecipients] = useState<BrandMessageRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const fetch_ = useCallback(async (s: string, o: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(o) });
      if (s) params.set("status", s);
      const res = await fetch(`/api/lab/brand-message/campaigns/${campaignId}/recipients?${params}`);
      const data = await res.json();
      setRecipients(data.recipients ?? []);
    } catch {
      toast.error("수신자 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetch_(status, 0); setOffset(0); }, [status, fetch_]);

  const handlePrev = () => { const o = Math.max(0, offset - LIMIT); setOffset(o); fetch_(status, o); };
  const handleNext = () => { const o = offset + LIMIT; setOffset(o); fetch_(status, o); };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "var(--app-modal-backdrop)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680, maxHeight: "88vh", display: "flex", flexDirection: "column",
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          padding: "24px", boxShadow: "var(--app-shadow-lg)", border: "1px solid var(--app-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" }}>수신자 목록</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "none", backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 필터 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {([["", "전체"], ["pending", "대기"], ["sent", "성공"], ["failed", "실패"]] as const).map(([v, lbl]) => (
            <button
              key={v}
              onClick={() => setStatus(v)}
              style={{
                padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: status === v ? "2px solid var(--app-tag-purple-text)" : "1px solid var(--app-border)",
                backgroundColor: status === v ? "var(--app-tag-purple-bg)" : "var(--app-bg)",
                color: status === v ? "var(--app-tag-purple-text)" : "var(--app-text-secondary)",
                cursor: "pointer",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div style={{ flex: 1, overflowY: "auto", border: "1px solid var(--app-border)", borderRadius: 10 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 8, color: "var(--app-text-tertiary)" }}>
              <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} /> 불러오는 중…
            </div>
          ) : recipients.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 13 }}>해당 수신자가 없습니다</div>
          ) : (
            recipients.map((r, i) => {
              const isSuccess = r.sent_at && (r.result_code === "K000" || r.result_code === "M000");
              const isFailed = r.sent_at && !(r.result_code === "K000" || r.result_code === "M000");
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "10px 16px",
                    borderBottom: i < recipients.length - 1 ? "1px solid var(--app-border)" : "none",
                  }}
                >
                  {isSuccess && <CheckCircle2 style={{ width: 16, height: 16, color: "var(--app-btn-success-text)", flexShrink: 0, marginTop: 1 }} />}
                  {isFailed && <XCircle style={{ width: 16, height: 16, color: "var(--app-btn-danger-text)", flexShrink: 0, marginTop: 1 }} />}
                  {!r.sent_at && <AlertCircle style={{ width: 16, height: 16, color: "var(--app-text-tertiary)", flexShrink: 0, marginTop: 1 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>{r.phone}</div>
                    <div style={{ fontSize: 12, color: "var(--app-text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.message.slice(0, 60)}{r.message.length > 60 ? "…" : ""}
                    </div>
                    {r.result_message && (
                      <div style={{ fontSize: 11, color: isFailed ? "var(--app-btn-danger-text)" : "var(--app-text-tertiary)", marginTop: 2 }}>
                        {r.result_code} — {r.result_message}
                      </div>
                    )}
                  </div>
                  {r.sent_at && (
                    <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", flexShrink: 0 }}>
                      {formatKst(r.sent_at)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 페이징 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
            {offset + 1} – {offset + recipients.length} 번째
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={handlePrev} disabled={offset === 0} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-bg)", cursor: offset === 0 ? "not-allowed" : "pointer", opacity: offset === 0 ? 0.4 : 1 }}>
              <ChevronLeft style={{ width: 14, height: 14, color: "var(--app-text-secondary)" }} />
            </button>
            <button onClick={handleNext} disabled={recipients.length < LIMIT} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--app-border)", backgroundColor: "var(--app-bg)", cursor: recipients.length < LIMIT ? "not-allowed" : "pointer", opacity: recipients.length < LIMIT ? 0.4 : 1 }}>
              <ChevronRight style={{ width: 14, height: 14, color: "var(--app-text-secondary)" }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 즉시 발송 확인 모달 ──────────────────────────────────────────────────────

function SendNowModal({ campaign, onClose, onConfirm, loading }: {
  campaign: BrandMessageCampaign;
  onClose: () => void;
  onConfirm: (batchSize: number) => void;
  loading: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [dispersed, setDispersed] = useState(true);
  const REQUIRED = "발송하겠습니다";
  const canSend = confirmText === REQUIRED && !loading;
  const batchSize = dispersed ? 1000 : 99999;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 2000, backgroundColor: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          padding: "28px 24px", boxShadow: "var(--app-shadow-lg)",
          border: "2px solid var(--app-btn-danger-bg)",
        }}
      >
        {/* 경고 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            backgroundColor: "var(--app-btn-danger-bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertCircle style={{ width: 24, height: 24, color: "var(--app-btn-danger-text)" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "var(--app-btn-danger-text)" }}>
              즉시 발송 최종 확인
            </h2>
            <p style={{ fontSize: 13, color: "var(--app-text-secondary)", margin: "4px 0 0" }}>
              이 작업은 되돌릴 수 없습니다
            </p>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: 8, border: "none", backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 발송 정보 */}
        <div style={{
          backgroundColor: "var(--app-btn-danger-bg)", borderRadius: 12,
          padding: "16px 18px", marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, color: "var(--app-btn-danger-text)", lineHeight: 1.8 }}>
            <div><strong>캠페인:</strong> {campaign.label}</div>
            <div><strong>수신자 수:</strong> <span style={{ fontSize: 18, fontWeight: 800 }}>{campaign.total_count.toLocaleString("ko-KR")}명</span></div>
            <div><strong>메시지 타입:</strong> {campaign.message_type}</div>
            {campaign.group_tag && <div><strong>그룹:</strong> {campaign.group_tag}</div>}
          </div>
        </div>

        {/* 분산 발송 옵션 */}
        <div style={{
          backgroundColor: "var(--app-surface)", borderRadius: 10, padding: "14px 16px", marginBottom: 16,
          border: "1px solid var(--app-border)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 10 }}>분산 발송 옵션</div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 10 }}>
            <input
              type="radio" name="dispersed" checked={dispersed} onChange={() => setDispersed(true)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>1000건씩 분산 (안전, 느림)</div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                첫 1000건 발송 후 1분마다 cron 자동 재개 — timeout 위험 없음
              </div>
            </div>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input
              type="radio" name="dispersed" checked={!dispersed} onChange={() => setDispersed(false)}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>전체 한 번에 (빠름, timeout 위험)</div>
              <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>
                Vercel 300s 한도 내에서 가능한 모든 건 발송 — 5000건 초과 시 timeout 가능
              </div>
            </div>
          </label>
        </div>

        {/* 입력 확인 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 8 }}>
            아래에 정확히 입력하세요: <code style={{ backgroundColor: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace" }}>{REQUIRED}</code>
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={REQUIRED}
            autoFocus
            style={{
              width: "100%", padding: "10px 14px", fontSize: 14,
              border: confirmText === REQUIRED
                ? "2px solid var(--app-btn-success-text)"
                : "2px solid var(--app-btn-danger-bg)",
              borderRadius: 10, outline: "none", boxSizing: "border-box",
              backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)",
            }}
            onKeyDown={(e) => { if (e.key === "Enter" && canSend) onConfirm(batchSize); }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "12px", fontSize: 14, fontWeight: 600,
              color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface)",
              border: "1px solid var(--app-border)", borderRadius: 10, cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={() => onConfirm(batchSize)}
            disabled={!canSend}
            style={{
              flex: 1, padding: "12px", fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              color: "white",
              backgroundColor: canSend ? "#DC2626" : "var(--app-border)",
              border: "none", borderRadius: 10,
              cursor: canSend ? "pointer" : "not-allowed",
            }}
          >
            {loading ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 발송 중…</> : `🚀 ${campaign.total_count.toLocaleString("ko-KR")}명에게 즉시 발송`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 전환 통계 카드 ───────────────────────────────────────────────────────────

interface ConversionStats {
  campaign_id: string;
  label: string;
  started_at: string | null;
  window_end: string | null;
  total_sent: number;
  converted: number;
  conversion_rate: number;
  avg_conversion_hours: number | null;
  converted_orders: { phone: string; sent_at: string | null; converted_at: string; converted_session_id: string | null }[];
}

function ConversionStatsCard({ campaignId }: { campaignId: string }) {
  const [stats, setStats] = useState<ConversionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetch(`/api/lab/brand-message/campaigns/${campaignId}/conversion-stats`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {/* 무시 */})
      .finally(() => setLoading(false));
  }, [campaignId]);

  if (loading) {
    return (
      <div style={{
        backgroundColor: "var(--app-surface)", borderRadius: 12,
        border: "1px solid var(--app-border)", padding: "18px 20px",
        display: "flex", alignItems: "center", gap: 8,
        color: "var(--app-text-tertiary)", fontSize: 13,
      }}>
        <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 전환 데이터 로딩 중...
      </div>
    );
  }

  if (!stats || !("converted" in stats)) return null;

  return (
    <>
      <div style={{
        backgroundColor: "var(--app-surface)", borderRadius: 12,
        border: "1px solid var(--app-border)", padding: "18px 20px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 5 }}>
            <TrendingUp style={{ width: 13, height: 13 }} /> 전환 결과
          </span>
          {stats.converted > 0 && (
            <button
              onClick={() => setShowModal(true)}
              style={{
                fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                border: "1px solid var(--app-tag-purple-text)", cursor: "pointer",
              }}
            >
              최근 전환 보기
            </button>
          )}
        </div>
        <span style={{ fontSize: 28, fontWeight: 800, color: stats.converted > 0 ? "var(--app-btn-success-text)" : "var(--app-text-tertiary)" }}>
          {stats.converted.toLocaleString("ko-KR")}
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>
            전체 발송 대비 {stats.conversion_rate}%
          </span>
          {stats.avg_conversion_hours !== null && (
            <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
              발송 후 평균 {stats.avg_conversion_hours}시간
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 2 }}>
            전환 데이터는 5분마다 자동 갱신 · 캠페인 시작 후 7일 내 방문수거 예약
          </span>
        </div>
      </div>

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            backgroundColor: "var(--app-modal-backdrop, rgba(0,0,0,0.5))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column",
              backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
              border: "1px solid var(--app-border)",
              boxShadow: "var(--app-shadow-lg, 0 20px 60px rgba(0,0,0,0.3))",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px 16px", borderBottom: "1px solid var(--app-border)", flexShrink: 0,
            }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" }}>
                  전환된 고객 (최근 50건)
                </h2>
                <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 3 }}>
                  {stats.label} · 총 {stats.converted}건 전환
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{ width: 32, height: 32, borderRadius: 8, border: "none", backgroundColor: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {stats.converted_orders.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 13, padding: "40px 0" }}>전환 데이터 없음</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "var(--app-text-tertiary)", fontWeight: 600 }}>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--app-border)" }}>전화번호</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--app-border)" }}>발송시각</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--app-border)" }}>전환시각</th>
                      <th style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--app-border)" }}>상담 링크</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.converted_orders.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--app-border)" }}>
                        <td style={{ padding: "8px 8px", color: "var(--app-text-primary)", fontWeight: 600 }}>{row.phone}</td>
                        <td style={{ padding: "8px 8px", color: "var(--app-text-secondary)" }}>{formatKst(row.sent_at)}</td>
                        <td style={{ padding: "8px 8px", color: "var(--app-text-secondary)" }}>{formatKst(row.converted_at)}</td>
                        <td style={{ padding: "8px 8px" }}>
                          {row.converted_session_id ? (
                            <a
                              href={`/conversations/${row.converted_session_id}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "var(--app-tag-purple-text)", fontWeight: 600, textDecoration: "none" }}
                            >
                              보기 →
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 메인 상세 페이지 ─────────────────────────────────────────────────────────

interface DetailData {
  campaign: BrandMessageCampaign;
  stats: CampaignStats;
  recipients: BrandMessageRecipient[];
}

export default function BrandMessageDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<DetailData | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 발송 컨트롤 상태
  const [testPhone, setTestPhone] = useState(TEST_PHONE_DEFAULT);
  const [showTestInput, setShowTestInput] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const [scheduleAt, setScheduleAt] = useState("");
  const [showScheduleInput, setShowScheduleInput] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const [showSendNowModal, setShowSendNowModal] = useState(false);
  const [sendNowLoading, setSendNowLoading] = useState(false);

  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resuming, setResuming] = useState(false);

  const [showRecipientsModal, setShowRecipientsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // 권한 체크
  useEffect(() => {
    if (authLoading) return;
    if (user && !LAB_ALLOWED_USERS.includes(user.name)) {
      router.replace("/conversations");
    }
  }, [user, authLoading, router]);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}`);
      if (!res.ok) {
        if (res.status === 404) { toast.error("캠페인을 찾을 수 없습니다"); router.replace("/lab/brand-message"); }
        return;
      }
      const d = await res.json();
      setData(d);
    } catch {
      // 무시
    } finally {
      setPageLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // sending 상태면 3초 폴링
  useEffect(() => {
    if (data?.campaign.status === "sending") {
      pollRef.current = setInterval(fetchDetail, 3000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [data?.campaign.status, fetchDetail]);

  const handleTestSend = async () => {
    if (!testPhone.trim()) { toast.error("전화번호를 입력해주세요"); return; }
    setTestSending(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone.replace(/-/g, "") }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "테스트 발송 실패"); return; }
      toast.success(`테스트 발송 완료 → ${testPhone} (DB 기록 안 됨)`);
      setShowTestInput(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setTestSending(false);
    }
  };

  const handleSchedule = async () => {
    if (!scheduleAt) { toast.error("예약 시각을 선택해주세요"); return; }
    const targetIso = datetimeLocalToIso(scheduleAt);
    if (new Date(targetIso) <= new Date()) { toast.error("예약 시각은 현재 시각 이후여야 합니다"); return; }
    setScheduling(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: targetIso }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "예약 실패"); return; }
      toast.success(`${formatKst(targetIso)} 으로 예약됨`);
      setShowScheduleInput(false);
      fetchDetail();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setScheduling(false);
    }
  };

  const handleSendNow = async (batchSize: number) => {
    setSendNowLoading(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "SEND_NOW_AGREED", batch_size_per_invocation: batchSize }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "즉시 발송 실패"); return; }
      toast.success(batchSize >= 99999 ? "발송 시작 — 전체 발송 중" : "발송 시작 — 1000건씩 분산 발송 중 (cron 자동 이어짐)");
      setShowSendNowModal(false);
      fetchDetail();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSendNowLoading(false);
    }
  };

  const handleResume = async () => {
    setResuming(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_size_per_invocation: 1000 }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "재개 실패"); return; }
      toast.success("다음 1000건 발송 시작 — 백그라운드 진행 중");
      fetchDetail();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setResuming(false);
    }
  };

  const [resetting, setResetting] = useState(false);
  const handleResetAndResend = async (codes?: string[]) => {
    const label = codes ? `${codes.join(", ")} 코드만` : "모든 실패";
    if (!confirm(`${label} 재발송 — 매칭 row 의 sent_at/result 초기화 + 새 msgid 생성 후 자동 발송 시작.\n계속할까요?`)) return;
    setResetting(true);
    try {
      // 1) reset — JSON 파싱 실패 (timeout 등) 도 graceful handle
      const r1 = await fetch(`/api/lab/brand-message/campaigns/${id}/reset-failed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(codes ? { codes } : {}),
      });
      const t1 = await r1.text();
      let d1: { reset_count?: number; error?: string };
      try { d1 = JSON.parse(t1) as typeof d1; }
      catch { d1 = { error: `서버 응답 형식 오류 (${r1.status}): ${t1.slice(0, 200)}` }; }
      if (!r1.ok) { toast.error(d1.error ?? "reset 실패"); return; }
      toast.success(`${(d1.reset_count ?? 0).toLocaleString("ko-KR")}건 reset 완료. 발송 시작...`);

      // 2) draft 가 됐으니 send-now 로 발송 시작 (atomic lock 보호)
      const r2 = await fetch(`/api/lab/brand-message/campaigns/${id}/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "SEND_NOW_AGREED", batch_size_per_invocation: 1000 }),
      });
      const t2 = await r2.text();
      let d2: { error?: string };
      try { d2 = JSON.parse(t2) as typeof d2; }
      catch { d2 = { error: `서버 응답 형식 오류 (${r2.status}): ${t2.slice(0, 200)}` }; }
      if (!r2.ok) { toast.error(d2.error ?? "재발송 시작 실패"); return; }
      toast.success("재발송 시작 — 1000건씩 분산, 1분마다 cron 자동 재개");
      fetchDetail();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setResetting(false);
    }
  };

  const [cloning, setCloning] = useState(false);
  const handleClonePhones = async () => {
    const newLabel = prompt("새 캠페인 이름 (취소하면 진행 중단):", `${campaign?.label ?? ""} (재시도)`);
    if (!newLabel || !newLabel.trim()) return;
    if (!confirm(`"${newLabel.trim()}" 캠페인을 새로 만듭니다.\n원본의 phone (${campaign?.total_count ?? 0}건) 만 복사하고 메시지/이미지/버튼/쿠폰은 비어있습니다.\n새 캠페인 EditModal 로 채워서 발송하면 됩니다.\n\n계속할까요?`)) return;

    setCloning(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}/clone-phones-only`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "복제 실패"); return; }
      toast.success(`복제 완료 — ${d.phones_copied.toLocaleString("ko-KR")}건. 새 캠페인으로 이동합니다.`);
      router.push(`/lab/brand-message/${d.new_campaign_id}`);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCloning(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("발송을 취소하시겠습니까?")) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}/cancel`, { method: "POST" });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "취소 실패"); return; }
      toast.success("취소 완료");
      fetchDetail();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`"${data?.campaign.label}" 캠페인을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/lab/brand-message/campaigns/${id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error ?? "삭제 실패"); return; }
      toast.success("캠페인 삭제 완료");
      router.replace("/lab/brand-message");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDeleting(false);
    }
  };

  const isAllowed = !!user && LAB_ALLOWED_USERS.includes(user.name);

  if (authLoading || !user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "var(--app-bg)" }}>
        <Loader2 style={{ width: 24, height: 24, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }
  if (!isAllowed) return null;

  if (pageLoading || !data) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", backgroundColor: "var(--app-bg)", flexDirection: "column", gap: 12 }}>
        <Loader2 style={{ width: 28, height: 28, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
        <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>캠페인 불러오는 중…</span>
      </div>
    );
  }

  const { campaign, stats, recipients } = data;
  const firstRecipient = recipients[0] ?? null;

  return (
    <div style={{ height: "100vh", overflowY: "auto", backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 28px 80px" }}>

        {/* 뒤로가기 + 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => router.push("/lab/brand-message")}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "6px 12px", borderRadius: 8, fontSize: 13,
              color: "var(--app-text-secondary)",
              backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
              cursor: "pointer",
            }}
          >
            <ArrowLeft style={{ width: 14, height: 14 }} /> 목록
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
            <FlaskConical style={{ width: 18, height: 18, color: "var(--app-tag-purple-text)", flexShrink: 0 }} />
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {campaign.label}
            </h1>
            <StatusBadge status={campaign.status} />
          </div>
          <button
            onClick={fetchDetail}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 12px", borderRadius: 8, fontSize: 12,
              color: "var(--app-text-secondary)",
              backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
              cursor: "pointer",
            }}
          >
            <RefreshCw style={{ width: 13, height: 13 }} /> 새로고침
          </button>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: "flex", gap: 12, marginBottom: campaign.status !== "draft" ? 12 : 24 }}>
          <StatCard label="전체" value={stats.total} color="var(--app-text-primary)" />
          <StatCard label="발송 성공" value={stats.sent} color="var(--app-btn-success-text)" />
          <StatCard label="실패" value={stats.failed} color={stats.failed > 0 ? "var(--app-btn-danger-text)" : "var(--app-text-tertiary)"} />
          <StatCard label="대기" value={stats.pending} color="var(--app-text-secondary)" />
        </div>

        {/* 전환 결과 카드 — draft 상태가 아닐 때만 표시 */}
        {campaign.status !== "draft" && (
          <div style={{ marginBottom: 24 }}>
            <ConversionStatsCard campaignId={campaign.id} />
          </div>
        )}

        {/* sending: 진행률 */}
        {campaign.status === "sending" && stats.total > 0 && (
          <div style={{
            backgroundColor: "var(--app-surface)", borderRadius: 12, border: "1px solid var(--app-border)",
            padding: "16px 20px", marginBottom: 24,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 발송 진행 중
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--app-text-primary)" }}>
                {Math.round(((stats.sent + stats.failed) / stats.total) * 100)}%
              </span>
            </div>
            <div style={{ height: 10, backgroundColor: "var(--app-bg)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 6,
                backgroundColor: "var(--app-btn-success-text)",
                width: `${Math.round((stats.sent / stats.total) * 100)}%`,
                transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 6 }}>
              {stats.sent.toLocaleString("ko-KR")} 성공 / {stats.failed.toLocaleString("ko-KR")} 실패 / {stats.pending.toLocaleString("ko-KR")} 대기
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

          {/* 좌측: 개요 + 발송 컨트롤 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* 개요 섹션 */}
            <section style={{ backgroundColor: "var(--app-surface)", borderRadius: 14, border: "1px solid var(--app-border)", padding: "20px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px", color: "var(--app-text-primary)" }}>캠페인 개요</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
                {[
                  ["그룹 태그", campaign.group_tag ?? "—"],
                  ["메시지 타입", campaign.message_type],
                  ["엑셀 파일", campaign.excel_filename ?? "—"],
                  ["생성자", campaign.created_by],
                  ["예약 시각", formatKst(campaign.scheduled_at)],
                  ["생성일시", formatKst(campaign.created_at)],
                  ["발송 시작", formatKst(campaign.started_at)],
                  ["완료일시", formatKst(campaign.completed_at)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 13, color: "var(--app-text-primary)", wordBreak: "break-all" }}>{v}</div>
                  </div>
                ))}
                {campaign.notes && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>메모</div>
                    <div style={{ fontSize: 13, color: "var(--app-text-primary)", whiteSpace: "pre-wrap" }}>{campaign.notes}</div>
                  </div>
                )}
              </div>
            </section>

            {/* 수신자 미리보기 */}
            {recipients.length > 0 && (
              <section style={{ backgroundColor: "var(--app-surface)", borderRadius: 14, border: "1px solid var(--app-border)", padding: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" }}>수신자 미리보기</h2>
                  <button
                    onClick={() => setShowRecipientsModal(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5,
                      padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    <Users style={{ width: 13, height: 13 }} /> 전체 보기
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 10, border: "1px solid var(--app-border)", overflow: "hidden" }}>
                  {recipients.slice(0, 5).map((r, i) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                        borderBottom: i < Math.min(recipients.length, 5) - 1 ? "1px solid var(--app-border)" : "none",
                        backgroundColor: i % 2 === 0 ? "var(--app-bg)" : "transparent",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", flexShrink: 0 }}>{r.phone}</span>
                      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.message.slice(0, 50)}{r.message.length > 50 ? "…" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 발송 컨트롤 */}
            <section style={{ backgroundColor: "var(--app-surface)", borderRadius: 14, border: "1px solid var(--app-border)", padding: "20px" }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "var(--app-text-primary)" }}>발송 컨트롤</h2>

              {/* 테스트 발송 — 상태 무관 항상 노출 (DB 기록 X, 캠페인 상태 변경 X) */}
              <div style={{ marginBottom: 12 }}>
                <button
                  onClick={() => setShowTestInput((v) => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                    border: "2px solid var(--app-tag-purple-text)", cursor: "pointer", width: "100%",
                  }}
                >
                  🧪 테스트 발송 (1건, DB 기록 안 됨)
                </button>
                {showTestInput && (
                  <div style={{ marginTop: 10, padding: "14px", backgroundColor: "var(--app-bg)", borderRadius: 10, border: "1px solid var(--app-border)" }}>
                    <p style={{ fontSize: 12, color: "var(--app-text-tertiary)", margin: "0 0 8px", lineHeight: 1.5 }}>
                      이 번호로 첫 번째 수신자 메시지를 1건 발송합니다. DB / 캠페인 상태 모두 변경 없습니다.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="01012345678"
                        style={{
                          flex: 1, padding: "8px 12px", borderRadius: 8,
                          border: "1px solid var(--app-border)", fontSize: 13,
                          outline: "none", backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                        }}
                      />
                      <button
                        onClick={handleTestSend}
                        disabled={testSending}
                        style={{
                          display: "flex", alignItems: "center", gap: 5,
                          padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                          color: "white",
                          backgroundColor: testSending ? "var(--app-border)" : "var(--app-tag-purple-text)",
                          border: "none", cursor: testSending ? "not-allowed" : "pointer",
                        }}
                      >
                        {testSending ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}
                        발송
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── DRAFT ── */}
              {campaign.status === "draft" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* 테스트 발송은 위 공통 영역에서 처리됨 */}

                  {/* 예약 발송 */}
                  <div>
                    <button
                      onClick={() => setShowScheduleInput((v) => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                        color: "var(--app-text-primary)", backgroundColor: "var(--app-surface)",
                        border: "1px solid var(--app-border)", cursor: "pointer", width: "100%",
                      }}
                    >
                      <Clock style={{ width: 15, height: 15 }} /> 예약 발송
                    </button>
                    {showScheduleInput && (
                      <div style={{ marginTop: 10, padding: "14px", backgroundColor: "var(--app-bg)", borderRadius: 10, border: "1px solid var(--app-border)" }}>
                        <p style={{ fontSize: 12, color: "var(--app-text-tertiary)", margin: "0 0 8px" }}>KST 기준 미래 시각 선택</p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="datetime-local"
                            value={scheduleAt}
                            onChange={(e) => setScheduleAt(e.target.value)}
                            min={toDatetimeLocalKst(new Date().toISOString())}
                            step={300}
                            title="cron 이 5분 단위 실행이므로 5분 단위로 선택"
                            style={{
                              flex: 1, padding: "8px 12px", fontSize: 13,
                              border: "1px solid var(--app-border)", borderRadius: 8,
                              outline: "none", backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                            }}
                          />
                          <button
                            onClick={handleSchedule}
                            disabled={scheduling}
                            style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                              color: "white",
                              backgroundColor: scheduling ? "var(--app-border)" : "var(--app-tag-purple-text)",
                              border: "none", cursor: scheduling ? "not-allowed" : "pointer",
                            }}
                          >
                            {scheduling ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Clock style={{ width: 14, height: 14 }} />}
                            예약
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 메시지 일괄 수정 */}
                  <button
                    onClick={() => setShowEditModal(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                      border: "1px solid var(--app-tag-purple-text)", cursor: "pointer", width: "100%",
                    }}
                  >
                    <Pencil style={{ width: 14, height: 14 }} /> ✏️ 메시지 일괄 수정
                  </button>

                  {/* 즉시 발송 */}
                  <button
                    onClick={() => setShowSendNowModal(true)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                      color: "white", backgroundColor: "#DC2626",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    🚀 즉시 발송 ({campaign.total_count.toLocaleString("ko-KR")}명)
                  </button>

                  {/* 삭제 */}
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-btn-danger-text)", backgroundColor: "var(--app-btn-danger-bg)",
                      border: "none", cursor: deleting ? "not-allowed" : "pointer",
                    }}
                  >
                    {deleting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Trash2 style={{ width: 14, height: 14 }} />}
                    캠페인 삭제
                  </button>
                </div>
              )}

              {/* ── SCHEDULED ── */}
              {campaign.status === "scheduled" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{
                    backgroundColor: "var(--app-tag-purple-bg)", borderRadius: 10, padding: "12px 16px",
                    fontSize: 13, color: "var(--app-tag-purple-text)", fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Clock style={{ width: 16, height: 16, flexShrink: 0 }} />
                    예약 시각: <strong>{formatKst(campaign.scheduled_at)}</strong>
                  </div>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-btn-danger-text)", backgroundColor: "var(--app-btn-danger-bg)",
                      border: "none", cursor: cancelling ? "not-allowed" : "pointer",
                    }}
                  >
                    {cancelling ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <XCircle style={{ width: 14, height: 14 }} />}
                    예약 취소
                  </button>
                  <button
                    onClick={() => setShowSendNowModal(true)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 700,
                      color: "white", backgroundColor: "#DC2626",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    🚀 예약 무시하고 지금 발송 ({campaign.total_count.toLocaleString("ko-KR")}명)
                  </button>
                </div>
              )}

              {/* ── SENDING ── */}
              {campaign.status === "sending" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={{ fontSize: 12, color: "var(--app-text-tertiary)", margin: 0 }}>
                    다음 batch 1분 이내 자동 재개 (cron)
                  </p>
                  <button
                    onClick={handleResume}
                    disabled={resuming || stats.pending === 0}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "white",
                      backgroundColor: resuming || stats.pending === 0 ? "var(--app-border)" : "#2563EB",
                      border: "none", cursor: resuming || stats.pending === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    {resuming ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}
                    지금 이어서 발송 (다음 1000건)
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-btn-danger-text)", backgroundColor: "var(--app-btn-danger-bg)",
                      border: "none", cursor: cancelling ? "not-allowed" : "pointer",
                    }}
                  >
                    {cancelling ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <XCircle style={{ width: 14, height: 14 }} />}
                    발송 중단 요청
                  </button>
                </div>
              )}

              {/* ── COMPLETED ── */}
              {campaign.status === "completed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    backgroundColor: "var(--app-btn-success-bg)", borderRadius: 10, padding: "12px 16px",
                    color: "var(--app-btn-success-text)", fontSize: 13, fontWeight: 600,
                  }}>
                    <CheckCircle2 style={{ width: 18, height: 18 }} />
                    발송 완료 — 성공 {stats.sent.toLocaleString("ko-KR")} / 실패 {stats.failed.toLocaleString("ko-KR")}
                  </div>
                  <button
                    onClick={() => setShowRecipientsModal(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    <Users style={{ width: 14, height: 14 }} />
                    전체 수신자 목록 보기
                  </button>
                  {stats.failed > 0 && (
                    <>
                      <button
                        onClick={() => { setShowRecipientsModal(true); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                          color: "var(--app-btn-danger-text)", backgroundColor: "var(--app-btn-danger-bg)",
                          border: "none", cursor: "pointer",
                        }}
                      >
                        <XCircle style={{ width: 14, height: 14 }} />
                        실패 수신자 보기 ({stats.failed.toLocaleString("ko-KR")}건)
                      </button>
                      {/* completed 상태에서도 실패 row 재발송 가능 — sent_at 초기화 + 새 msgid 생성 후 status='draft' 으로 전환 */}
                      <button
                        onClick={() => handleResetAndResend()}
                        disabled={resetting}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                          color: "white",
                          backgroundColor: resetting ? "var(--app-border)" : "#DC2626",
                          border: "none", cursor: resetting ? "not-allowed" : "pointer",
                        }}
                      >
                        {resetting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
                        🔄 실패 {stats.failed.toLocaleString("ko-KR")}건 재발송
                      </button>
                      <button
                        onClick={() => handleResetAndResend(["E109"])}
                        disabled={resetting}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 500,
                          color: "var(--app-text-secondary)",
                          backgroundColor: "var(--app-surface)",
                          border: "1px dashed var(--app-border)",
                          cursor: resetting ? "not-allowed" : "pointer",
                        }}
                      >
                        ✨ Race (E109) 만 재시도
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── FAILED / CANCELLED ── */}
              {(campaign.status === "failed" || campaign.status === "cancelled") && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    backgroundColor: "var(--app-btn-danger-bg)", borderRadius: 10, padding: "12px 16px",
                    color: "var(--app-btn-danger-text)", fontSize: 13, fontWeight: 600,
                  }}>
                    <XCircle style={{ width: 18, height: 18 }} />
                    {campaign.status === "failed" ? "발송 실패" : "발송 취소됨"}
                    {stats.sent > 0 && ` — ${stats.sent.toLocaleString("ko-KR")}건 발송 완료 후 중단`}
                  </div>
                  {/* 재발송 / 재개 버튼 */}
                  {campaign.status === "failed" && (
                    <button
                      onClick={handleResume}
                      disabled={resuming || stats.pending === 0}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                        color: "white",
                        backgroundColor: resuming || stats.pending === 0 ? "var(--app-border)" : "#2563EB",
                        border: "none", cursor: resuming || stats.pending === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      {resuming ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
                      재발송 (남은 {stats.pending.toLocaleString("ko-KR")}건)
                    </button>
                  )}
                  {campaign.status === "cancelled" && (
                    <button
                      onClick={handleResume}
                      disabled={resuming || stats.pending === 0}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                        color: "white",
                        backgroundColor: resuming || stats.pending === 0 ? "var(--app-border)" : "#2563EB",
                        border: "none", cursor: resuming || stats.pending === 0 ? "not-allowed" : "pointer",
                      }}
                    >
                      {resuming ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 14, height: 14 }} />}
                      취소된 캠페인 재개 (남은 {stats.pending.toLocaleString("ko-KR")}건)
                    </button>
                  )}
                  {/* 실패 + 대기 재발송 — sent_at/result_code 초기화 + 새 msgid 생성 후 발송 */}
                  {stats.failed > 0 && (
                    <>
                      <button
                        onClick={() => handleResetAndResend()}
                        disabled={resetting}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                          color: "white",
                          backgroundColor: resetting ? "var(--app-border)" : "#DC2626",
                          border: "none", cursor: resetting ? "not-allowed" : "pointer",
                        }}
                      >
                        {resetting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <RefreshCw style={{ width: 14, height: 14 }} />}
                        🔄 모든 실패 ({stats.failed.toLocaleString("ko-KR")}건) + 대기 ({stats.pending.toLocaleString("ko-KR")}건) 재발송
                      </button>
                      <button
                        onClick={() => handleResetAndResend(["E109"])}
                        disabled={resetting}
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 500,
                          color: "var(--app-text-secondary)",
                          backgroundColor: "var(--app-surface)",
                          border: "1px dashed var(--app-border)",
                          cursor: resetting ? "not-allowed" : "pointer",
                        }}
                      >
                        ✨ Race 실패 (E109) 만 재시도 — 권장 (K101/K119 는 카카오 차단/미가입이라 retry 의미 X)
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowRecipientsModal(true)}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                      border: "none", cursor: "pointer",
                    }}
                  >
                    <Users style={{ width: 14, height: 14 }} />
                    수신자 목록 보기
                  </button>
                  {/* 번호만 복사한 새 캠페인 — 메시지/버튼 새로 작성 시 (msgid 중복 회피) */}
                  <button
                    onClick={handleClonePhones}
                    disabled={cloning}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      color: "var(--app-text-primary)",
                      backgroundColor: "var(--app-surface)",
                      border: "1px solid var(--app-tag-purple-text)",
                      cursor: cloning ? "not-allowed" : "pointer",
                    }}
                  >
                    {cloning ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    📋 번호만 복사해 새 캠페인 (msgid 새로)
                  </button>
                  {campaign.status === "cancelled" && (
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      style={{
                        display: "flex", alignItems: "center", gap: 7,
                        padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                        color: "var(--app-btn-danger-text)", backgroundColor: "var(--app-btn-danger-bg)",
                        border: "none", cursor: deleting ? "not-allowed" : "pointer",
                      }}
                    >
                      {deleting ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Trash2 style={{ width: 14, height: 14 }} />}
                      캠페인 삭제
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* 우측: 카카오톡 미리보기 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <section style={{ backgroundColor: "var(--app-surface)", borderRadius: 14, border: "1px solid var(--app-border)", padding: "20px", position: "sticky", top: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 16px", color: "var(--app-text-primary)" }}>메시지 미리보기</h2>
              {firstRecipient ? (
                <KakaoPreview recipient={firstRecipient} />
              ) : (
                <div style={{ textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 13, padding: "20px 0" }}>
                  수신자 데이터가 없습니다
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--app-text-tertiary)", textAlign: "center", marginTop: 12, marginBottom: 0 }}>
                첫 번째 수신자 기준 미리보기
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* 모달들 */}
      {showSendNowModal && (
        <SendNowModal
          campaign={campaign}
          onClose={() => setShowSendNowModal(false)}
          onConfirm={handleSendNow}
          loading={sendNowLoading}
        />
      )}
      {showRecipientsModal && (
        <RecipientsModal
          campaignId={id}
          onClose={() => setShowRecipientsModal(false)}
        />
      )}
      {showEditModal && (
        <EditCampaignModal
          // recipients[0].message 로 key — 본문 바뀌면 강제 remount → state 재초기화 (stale prefill 방지)
          key={`${firstRecipient?.id ?? "none"}-${firstRecipient?.message?.slice(0, 32) ?? ""}`}
          campaign={campaign}
          currentSample={firstRecipient ? {
            message: firstRecipient.message,
            image_url: firstRecipient.image_url,
            image_link: firstRecipient.image_link,
            buttons: firstRecipient.buttons as BrandMessageButton[] | null,
            coupon: firstRecipient.coupon as BrandMessageCoupon | null,
          } : null}
          onClose={() => setShowEditModal(false)}
          onSaved={fetchDetail}
        />
      )}
    </div>
  );
}
