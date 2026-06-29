"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlaskConical, Send, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthContext";
import type { BrandMessageType, BrandMessageButton, BrandMessageCoupon } from "@/lib/sweettracker/types";

const LAB_ALLOWED_USERS = new Set(["김원빈", "강성진"]);

const BUTTON_TYPES = [
  { value: "WL", label: "웹링크" },
  { value: "AL", label: "앱링크" },
  { value: "BK", label: "봇키워드" },
  { value: "MD", label: "메시지전달" },
  { value: "BC", label: "상담톡전환" },
  { value: "BT", label: "봇전환" },
];

export default function BrandMessageTestPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // 권한 가드
  useEffect(() => {
    if (authLoading) return;
    if (user && !LAB_ALLOWED_USERS.has(user.name)) router.replace("/conversations");
  }, [user, authLoading, router]);

  const [phone, setPhone] = useState("01071997626");
  const [messageType, setMessageType] = useState<BrandMessageType>("FW");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageLink, setImageLink] = useState("");
  const [buttons, setButtons] = useState<BrandMessageButton[]>([]);
  const [couponEnabled, setCouponEnabled] = useState(false);
  const [coupon, setCoupon] = useState<BrandMessageCoupon>({ name: "", desc: "", url_mobile: "" });
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

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

  const messageMaxLen = messageType === "FW" ? 76 : 1300;
  const buttonMaxCount = messageType === "FW" ? 2 : (couponEnabled ? 4 : 5);
  const messageOver = message.length > messageMaxLen;

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

  const handleSend = async () => {
    if (!phone.trim()) return toast.error("수신 번호를 입력해주세요");
    if (!message.trim()) return toast.error("메시지 본문을 입력해주세요");
    if (messageOver) return toast.error(`메시지가 ${messageMaxLen}자를 초과합니다`);
    if ((messageType === "FW" || messageType === "FI") && !imageUrl.trim()) {
      return toast.error("이미지 URL을 입력해주세요");
    }

    setSending(true);
    setLastResult(null);
    try {
      const body: Record<string, unknown> = {
        phone: phone.trim(),
        message_type: messageType,
        message: message.trim(),
      };
      if (imageUrl.trim()) body.image_url = imageUrl.trim();
      if (imageLink.trim()) body.image_link = imageLink.trim();
      if (buttons.length > 0) body.buttons = buttons;
      if (couponEnabled && coupon.name) body.coupon = coupon;

      const res = await fetch("/api/lab/brand-message/test-send-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "발송 실패");
        setLastResult({ ok: false, text: data.error || "발송 실패" });
        return;
      }
      const result = data.result;
      // 진짜 성공 판정은 success (= API 응답의 result === "Y") 사용
      if (result?.success) {
        toast.success("테스트 발송 완료 — 카카오톡 확인");
        setLastResult({ ok: true, text: `code=${result.result_code} kind=${result.kind ?? ""} ${result.result_message ?? ""}` });
      } else {
        const code = result?.result_code ?? "UNKNOWN";
        const msg = result?.result_message ?? "응답 없음";
        const origin = result?.origin_error ? ` (kakao: ${result.origin_error})` : "";
        toast.error(`발송 실패: ${code} ${msg}${origin}`);
        setLastResult({ ok: false, text: `code=${code} ${msg}${origin}` });
      }
    } catch (err) {
      toast.error(String(err));
      setLastResult({ ok: false, text: String(err) });
    } finally {
      setSending(false);
    }
  };

  if (authLoading || !user || !LAB_ALLOWED_USERS.has(user.name)) {
    return null;
  }

  return (
    <div style={{ height: "100vh", overflowY: "auto", backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 28px 80px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <button
              onClick={() => router.push("/lab/brand-message")}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", marginBottom: 8, fontSize: 12, color: "var(--app-text-tertiary)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              <ArrowLeft style={{ width: 12, height: 12 }} /> 캠페인 목록
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <FlaskConical style={{ width: 18, height: 18, color: "var(--app-tag-purple-text)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                커버링 실험실
              </span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>다이렉트 테스트 발송</h1>
            <p style={{ fontSize: 12, color: "var(--app-text-secondary)", marginTop: 4, marginBottom: 0 }}>
              캠페인 / Excel 없이 한 번에 1건 발송 — DB 기록 안 됨, 카카오톡 미리보기 확인용
            </p>
          </div>
        </div>

        {/* 본 폼 — 좌: 입력 / 우: 미리보기 */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
          {/* ── Input panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 20, backgroundColor: "var(--app-surface)", borderRadius: 12, border: "1px solid var(--app-border)" }}>

            <Field label="수신 번호" hint="본인 또는 테스트 가능한 번호 (하이픈 OK)">
              <input
                type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                style={inputStyle}
              />
            </Field>

            <Field label="메시지 타입">
              <div style={{ display: "flex", gap: 6 }}>
                {(["FW", "FI", "FT"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setMessageType(t)}
                    style={{
                      padding: "6px 12px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                      border: "1px solid",
                      backgroundColor: messageType === t ? "var(--app-tag-purple-bg)" : "transparent",
                      color: messageType === t ? "var(--app-tag-purple-text)" : "var(--app-text-secondary)",
                      borderColor: messageType === t ? "var(--app-tag-purple-text)" : "var(--app-border)",
                      cursor: "pointer",
                    }}
                  >
                    {t} {t === "FW" ? "와이드" : t === "FI" ? "이미지" : "텍스트"}
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`메시지 본문 (${message.length} / ${messageMaxLen}자)`}
              hint={messageType === "FW" ? "FW 와이드: 76자 / 줄바꿈 5개 / 버튼 2개 max" : "FI/FT: 1300자 / 줄바꿈 99개 / 버튼 5개 (쿠폰 시 4개) max"}>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder={messageType === "FW" ? "쿠폰 받기 (76자 이내)" : "본문..."}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, color: messageOver ? "var(--app-btn-danger-text)" : "var(--app-text-primary)" }}
              />
            </Field>

            {(messageType === "FW" || messageType === "FI") && (
              <>
                <Field
                  label="이미지"
                  hint={messageType === "FW"
                    ? "와이드 — 800x600 권장 / 비율 2:1~1:1 / jpg·png / 5MB 이하"
                    : "일반 — 800x400 권장 / 비율 2:1~3:4 / jpg·png / 5MB 이하"}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="이미지 업로드하면 자동 채워짐 (또는 직접 URL paste)"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <label style={{
                      display: "flex", alignItems: "center", gap: 4, cursor: uploadingImage ? "wait" : "pointer",
                      padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)",
                      border: "1px solid var(--app-tag-purple-text)", whiteSpace: "nowrap",
                      opacity: uploadingImage ? 0.5 : 1,
                    }}>
                      {uploadingImage
                        ? <><Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> 업로드 중</>
                        : <><Upload style={{ width: 12, height: 12 }} /> 파일 선택</>}
                      <input
                        type="file" accept="image/jpeg,image/png" disabled={uploadingImage}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f);
                          e.target.value = "";
                        }}
                        style={{ display: "none" }}
                      />
                    </label>
                  </div>
                  {imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="upload preview" style={{ marginTop: 6, maxWidth: 160, maxHeight: 100, borderRadius: 6, border: "1px solid var(--app-border)" }} />
                  )}
                </Field>
                <Field label="이미지 링크 (선택)" hint="이미지 클릭 시 이동할 URL">
                  <input
                    type="text" value={imageLink} onChange={(e) => setImageLink(e.target.value)}
                    placeholder="https://covering.app/..."
                    style={inputStyle}
                  />
                </Field>
              </>
            )}

            {/* 버튼들 */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>버튼 ({buttons.length} / {buttonMaxCount})</span>
                <button onClick={addButton} disabled={buttons.length >= buttonMaxCount}
                  style={{ ...miniBtn, opacity: buttons.length >= buttonMaxCount ? 0.4 : 1 }}>
                  <Plus style={{ width: 12, height: 12 }} /> 추가
                </button>
              </div>
              {buttons.length === 0 && <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>버튼 없음</span>}
              {buttons.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                  <select value={b.type} onChange={(e) => updateButton(i, { type: e.target.value })}
                    style={{ ...inputStyle, width: 110, padding: "5px 8px" }}>
                    {BUTTON_TYPES.map((bt) => <option key={bt.value} value={bt.value}>{bt.label}</option>)}
                  </select>
                  <input
                    type="text" value={b.name} onChange={(e) => updateButton(i, { name: e.target.value })}
                    placeholder="버튼명 (8자)"
                    style={{ ...inputStyle, width: 130 }}
                  />
                  <input
                    type="text" value={b.url_mobile ?? ""} onChange={(e) => updateButton(i, { url_mobile: e.target.value })}
                    placeholder={b.type === "WL" ? "Mobile URL" : "(선택)"}
                    style={{ ...inputStyle, flex: 1 }}
                    disabled={b.type !== "WL" && b.type !== "AL"}
                  />
                  <button onClick={() => removeButton(i)} style={miniBtnDanger} title="삭제">
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
            </div>

            {/* 쿠폰 */}
            <div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>
                <input type="checkbox" checked={couponEnabled} onChange={(e) => setCouponEnabled(e.target.checked)} />
                쿠폰 강조 버튼 추가 (1개)
              </label>
              {couponEnabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input
                    type="text" value={coupon.name ?? ""} onChange={(e) => setCoupon({ ...coupon, name: e.target.value })}
                    placeholder='쿠폰명 — "10000원 할인 쿠폰" / "30% 할인 쿠폰" / "배송비 할인 쿠폰" / "{7자} 무료 쿠폰" / "{7자} UP 쿠폰"'
                    style={inputStyle}
                  />
                  <input
                    type="text" value={coupon.desc ?? ""} onChange={(e) => setCoupon({ ...coupon, desc: e.target.value })}
                    placeholder={`쿠폰 설명 (${messageType === "FW" ? "18" : "12"}자, 줄바꿈 X)`}
                    style={inputStyle}
                  />
                  <input
                    type="text" value={coupon.url_mobile ?? ""} onChange={(e) => setCoupon({ ...coupon, url_mobile: e.target.value })}
                    placeholder="쿠폰 Mobile URL"
                    style={inputStyle}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleSend} disabled={sending || messageOver}
              style={{
                marginTop: 4, width: "100%", height: 44, borderRadius: 10, border: "none",
                backgroundColor: sending ? "var(--app-border)" : "var(--app-tag-purple-text)",
                color: "white", fontSize: 14, fontWeight: 600,
                cursor: sending || messageOver ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {sending
                ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 발송 중...</>
                : <><Send style={{ width: 16, height: 16 }} /> 카카오톡으로 1건 테스트 발송</>}
            </button>

            {lastResult && (
              <div style={{
                padding: "10px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.5,
                backgroundColor: lastResult.ok ? "var(--app-btn-success-bg)" : "var(--app-btn-danger-bg)",
                color: lastResult.ok ? "var(--app-btn-success-text)" : "var(--app-btn-danger-text)",
              }}>
                {lastResult.ok ? "✓ " : "✗ "}{lastResult.text}
              </div>
            )}
          </div>

          {/* ── Preview panel ── */}
          <div style={{ position: "sticky", top: 16, alignSelf: "start" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 8 }}>
              카카오톡 미리보기
            </div>
            <Preview type={messageType} message={message} imageUrl={imageUrl} buttons={buttons} couponEnabled={couponEnabled} coupon={coupon} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function Preview({
  type, message, imageUrl, buttons, couponEnabled, coupon,
}: {
  type: BrandMessageType; message: string; imageUrl: string;
  buttons: BrandMessageButton[]; couponEnabled: boolean; coupon: BrandMessageCoupon;
}) {
  return (
    <div style={{
      padding: 12, borderRadius: 12, backgroundColor: "#A4B7C4",
      maxWidth: 320,
    }}>
      <div style={{ fontSize: 11, color: "white", marginBottom: 6, fontWeight: 600 }}>
        (광고) 커버링스팟
      </div>
      <div style={{ backgroundColor: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        {(type === "FW" || type === "FI") && imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="preview" style={{ width: "100%", display: "block", maxHeight: type === "FW" ? 160 : 320, objectFit: "cover" }} />
        )}
        <div style={{ padding: "12px 14px" }}>
          <pre style={{
            margin: 0, fontSize: 12, color: "#1F2937",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontFamily: "inherit", lineHeight: 1.5,
          }}>{message || "(메시지 없음)"}</pre>
        </div>
        {buttons.map((b, i) => (
          <div key={i} style={{
            padding: "10px 14px",
            borderTop: "1px solid #F3F4F6",
            fontSize: 13, fontWeight: 500, color: "#374151",
            textAlign: "center",
          }}>
            {b.name || "(버튼명)"}
          </div>
        ))}
        {couponEnabled && coupon.name && (
          <div style={{
            padding: "12px 14px",
            backgroundColor: "#FEF3C7", color: "#92400E",
            borderTop: "1px solid #F3F4F6",
            fontSize: 13, fontWeight: 700, textAlign: "center",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>{coupon.name}</span>
            {coupon.desc && <span style={{ fontSize: 11, fontWeight: 400 }}>{coupon.desc}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 13,
  border: "1px solid var(--app-input-border)", borderRadius: 8,
  outline: "none", boxSizing: "border-box",
  backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)",
};

const miniBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 4,
  padding: "4px 8px", fontSize: 11, fontWeight: 600,
  borderRadius: 6, border: "1px solid var(--app-border)",
  backgroundColor: "var(--app-surface-secondary)",
  color: "var(--app-text-secondary)",
  cursor: "pointer",
};

const miniBtnDanger: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 28, height: 28, padding: 0,
  borderRadius: 6, border: "none",
  backgroundColor: "var(--app-btn-danger-bg)",
  color: "var(--app-btn-danger-text)",
  cursor: "pointer",
};
