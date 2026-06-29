"use client";

import React, { useRef, useState } from "react";
import { X, FlaskConical, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const MESSAGE_TYPES = [
  { value: "FW", label: "FW — 와이드 이미지", desc: "이미지 + 텍스트 (최대 76자)" },
  { value: "FI", label: "FI — 이미지형", desc: "이미지 + 텍스트" },
  { value: "FT", label: "FT — 텍스트만", desc: "이미지 없이 텍스트 본문만" },
] as const;

export function CreateCampaignModal({ onClose, onCreated }: Props) {
  const [label, setLabel] = useState("");
  const [groupTag, setGroupTag] = useState("");
  const [messageType, setMessageType] = useState<"FW" | "FI" | "FT">("FW");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) { toast.error("캠페인 라벨을 입력해주세요"); return; }
    if (!file) { toast.error("Excel 파일을 선택해주세요"); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("label", label.trim());
      if (groupTag.trim()) fd.append("group_tag", groupTag.trim());
      fd.append("message_type", messageType);
      if (notes.trim()) fd.append("notes", notes.trim());
      fd.append("excel_file", file);

      const res = await fetch("/api/lab/brand-message/campaigns", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "캠페인 생성 실패");
        return;
      }
      if (data.warnings?.length) {
        data.warnings.forEach((w: string) => toast.error(w));
      }
      toast.success(`캠페인 생성 완료 — ${data.recipient_count.toLocaleString("ko-KR")}명`);
      onCreated(data.campaign_id);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 14px", fontSize: 14,
    border: "1px solid var(--app-border)", borderRadius: 8,
    outline: "none", boxSizing: "border-box",
    backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 13, fontWeight: 600,
    color: "var(--app-text-secondary)", marginBottom: 6,
  };

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
          width: 520, maxHeight: "90vh", overflowY: "auto",
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          padding: "28px 24px", boxShadow: "var(--app-shadow-lg)",
          border: "1px solid var(--app-border)",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FlaskConical style={{ width: 20, height: 20, color: "var(--app-tag-purple-text)" }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--app-text-primary)" }}>
              신규 캠페인 생성
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              backgroundColor: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 캠페인 라벨 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              캠페인 라벨 <span style={{ color: "var(--app-btn-danger-text)" }}>*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 1일차 A 그룹 (쿠폰)"
              style={inputStyle}
              maxLength={100}
              autoFocus
            />
          </div>

          {/* 그룹 태그 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>그룹 태그</label>
            <input
              type="text"
              value={groupTag}
              onChange={(e) => setGroupTag(e.target.value)}
              placeholder="예: 1A — 전환 분석용"
              style={inputStyle}
              maxLength={50}
            />
          </div>

          {/* 메시지 타입 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              메시지 타입 <span style={{ color: "var(--app-btn-danger-text)" }}>*</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MESSAGE_TYPES.map(({ value, label: typeLabel, desc }) => (
                <label
                  key={value}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                    border: messageType === value
                      ? "2px solid var(--app-tag-purple-text)"
                      : "1px solid var(--app-border)",
                    backgroundColor: messageType === value
                      ? "var(--app-tag-purple-bg)"
                      : "var(--app-bg)",
                  }}
                >
                  <input
                    type="radio"
                    name="message_type"
                    value={value}
                    checked={messageType === value}
                    onChange={() => setMessageType(value)}
                    style={{ marginTop: 3 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>
                      {typeLabel}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginTop: 1 }}>
                      {desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Excel 파일 업로드 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Excel 파일 <span style={{ color: "var(--app-btn-danger-text)" }}>*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ display: "none" }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", borderRadius: 10,
                border: file
                  ? "2px solid var(--app-btn-success-text)"
                  : "2px dashed var(--app-border)",
                backgroundColor: file
                  ? "var(--app-btn-success-bg)"
                  : "var(--app-bg)",
                cursor: "pointer",
              }}
            >
              <Upload style={{ width: 18, height: 18, color: file ? "var(--app-btn-success-text)" : "var(--app-text-tertiary)", flexShrink: 0 }} />
              <div>
                {file ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-btn-success-text)" }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 1 }}>
                      {(file.size / 1024).toFixed(1)} KB — 클릭하여 변경
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-secondary)" }}>
                      .xlsx 파일을 선택하세요
                    </div>
                    <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 1 }}>
                      스윗트래커 템플릿 형식 (phone, message, ...)
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 메모 */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>메모 (선택)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="발송 목적, 대상 조건 등 자유 기록"
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* 제출 버튼 */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "10px 20px", fontSize: 14, fontWeight: 500,
                color: "var(--app-text-secondary)", backgroundColor: "var(--app-surface)",
                border: "1px solid var(--app-border)", borderRadius: 10, cursor: "pointer",
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 24px", fontSize: 14, fontWeight: 600,
                color: "white",
                backgroundColor: submitting ? "var(--app-border)" : "var(--app-tag-purple-text)",
                border: "none", borderRadius: 10,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? (
                <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> 생성 중…</>
              ) : (
                "캠페인 생성"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
