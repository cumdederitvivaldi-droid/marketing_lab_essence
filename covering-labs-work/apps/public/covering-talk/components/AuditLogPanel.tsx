"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Clock, User, FileEdit, Plus, Trash2, RefreshCw } from "lucide-react";
import type { AuditEntityType } from "@/lib/store/audit-logs";

interface AuditLog {
  id: number;
  createdAt: string;
  entityType: string;
  entityId: string;
  action: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  description: string | null;
  userId: number;
  userName: string;
}

// 한국어 필드명 매핑
const FIELD_LABELS: Record<string, string> = {
  customerName: "고객명",
  customer_name: "고객명",
  phone: "연락처",
  address: "주소",
  addressDetail: "상세주소",
  address_detail: "상세주소",
  date: "수거일",
  timeSlot: "시간대",
  time_slot: "시간대",
  hasElevator: "엘리베이터",
  has_elevator: "엘리베이터",
  hasParking: "주차 가능",
  has_parking: "주차 가능",
  finalPrice: "최종금액",
  final_price: "최종금액",
  totalPrice: "견적금액",
  total_price: "견적금액",
  adminMemo: "관리자메모",
  admin_memo: "관리자메모",
  status: "상태",
  assignee: "담당자",
  category: "카테고리",
  name: "사양",
  item_group: "품목명",
  display_name: "표시명",
  unit_price: "단가",
  width: "가로",
  depth: "세로",
  height: "높이",
  volume: "부피",
  weight: "무게",
  aliases: "별칭",
  content: "내용",
  quote: "견적",
  memo: "메모",
};

const ACTION_CONFIG: Record<string, { icon: typeof FileEdit; label: string; color: string; bg: string }> = {
  create: { icon: Plus, label: "추가", color: "#059669", bg: "#ECFDF5" },
  update: { icon: FileEdit, label: "수정", color: "#D97706", bg: "#FFFBEB" },
  delete: { icon: Trash2, label: "삭제", color: "#DC2626", bg: "#FEF2F2" },
  status_change: { icon: RefreshCw, label: "상태 변경", color: "#7C3AED", bg: "#F5F3FF" },
};

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "-";
  if (typeof val === "boolean") return val ? "O" : "X";
  if (typeof val === "object") {
    try {
      const str = JSON.stringify(val);
      if (str.length > 80) return str.substring(0, 80) + "...";
      return str;
    } catch {
      return String(val);
    }
  }
  const s = String(val);
  if (s.length > 80) return s.substring(0, 80) + "...";
  return s;
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return { date: `${month}/${day}`, time: `${hour}:${min}` };
}

interface AuditLogPanelProps {
  entityType: AuditEntityType;
  entityId: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export default function AuditLogPanel({
  entityType,
  entityId,
  isOpen,
  onClose,
  title,
}: AuditLogPanelProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch(`/api/audit-logs?entity_type=${entityType}&entity_id=${entityId}&limit=50`)
      .then((res) => res.json())
      .then((data) => setLogs(data.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [isOpen, entityType, entityId]);

  if (!isOpen) return null;

  const entityLabel =
    entityType === "booking" ? "예약" :
    entityType === "product" ? "품목" :
    entityType === "macro" ? "템플릿" :
    entityType === "conversation" ? "상담" : entityType;

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
          width: 520, maxHeight: "80vh",
          backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
          boxShadow: "var(--app-shadow-lg)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* 헤더 */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
              {title || `${entityLabel} 수정 이력`}
            </h2>
            <p style={{ fontSize: 12, color: "var(--app-text-tertiary)", margin: "4px 0 0" }}>
              총 {logs.length}건
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "transparent", border: "none", cursor: "pointer",
            }}
          >
            <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
              <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
              <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 14 }}>로딩 중...</span>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--app-text-tertiary)", fontSize: 14 }}>
              수정 이력이 없습니다
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {logs.map((log, idx) => {
                const config = ACTION_CONFIG[log.action] || ACTION_CONFIG.update;
                const Icon = config.icon;
                const dt = formatDateTime(log.createdAt);
                const changeEntries = Object.entries(log.changes);

                return (
                  <div key={log.id} style={{ position: "relative", paddingLeft: 28 }}>
                    {/* 타임라인 세로선 */}
                    {idx < logs.length - 1 && (
                      <div style={{
                        position: "absolute", left: 9, top: 24, bottom: 0,
                        width: 2, backgroundColor: "var(--app-border)",
                      }} />
                    )}

                    {/* 타임라인 아이콘 */}
                    <div style={{
                      position: "absolute", left: 0, top: 2,
                      width: 20, height: 20, borderRadius: "50%",
                      backgroundColor: config.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon style={{ width: 10, height: 10, color: config.color }} />
                    </div>

                    {/* 내용 */}
                    <div style={{ paddingBottom: 20 }}>
                      {/* 메타: 시간 + 사용자 + 액션 */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          fontSize: 11, color: "var(--app-text-tertiary)",
                        }}>
                          <Clock style={{ width: 10, height: 10 }} />
                          {dt.date} {dt.time}
                        </span>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          fontSize: 11, color: "var(--app-text-secondary)", fontWeight: 600,
                        }}>
                          <User style={{ width: 10, height: 10 }} />
                          {log.userName}
                        </span>
                        <span style={{
                          display: "inline-block", padding: "1px 6px",
                          fontSize: 10, fontWeight: 600, borderRadius: 4,
                          backgroundColor: config.bg, color: config.color,
                        }}>
                          {config.label}
                        </span>
                      </div>

                      {/* 설명 */}
                      {log.description && (
                        <div style={{ fontSize: 13, color: "var(--app-text-primary)", marginBottom: 6 }}>
                          {log.description}
                        </div>
                      )}

                      {/* 변경 필드 상세 */}
                      {changeEntries.length > 0 && (
                        <div style={{
                          backgroundColor: "var(--app-surface-secondary)", borderRadius: 8,
                          padding: "8px 12px", fontSize: 12,
                        }}>
                          {changeEntries.map(([field, change]) => (
                            <div
                              key={field}
                              style={{
                                display: "flex", alignItems: "flex-start", gap: 6,
                                padding: "3px 0", color: "var(--app-text-secondary)",
                              }}
                            >
                              <span style={{ fontWeight: 600, color: "var(--app-text-primary)", flexShrink: 0 }}>
                                {FIELD_LABELS[field] || field}:
                              </span>
                              <span style={{ color: "#DC2626", textDecoration: "line-through" }}>
                                {formatValue(change.old)}
                              </span>
                              <span style={{ color: "var(--app-text-tertiary)" }}>&rarr;</span>
                              <span style={{ color: "#059669" }}>
                                {formatValue(change.new)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
