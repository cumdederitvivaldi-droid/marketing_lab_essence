"use client";

import { memo } from "react";
import { Conversation, STATUS_LABELS } from "@/lib/store/conversations";
import { formatDistanceToNow } from "@/lib/utils/format";
import type { PresenceState } from "@/lib/hooks/useCounselorPresence";

interface Props {
  conv: Conversation;
  isSelected: boolean;
  onClick: () => void;
  onMarkRead?: (sessionId: string) => void;
  presenceViewers?: PresenceState[];
  /** 내가 멘션된 미확인 내부대화 개수 */
  mentionCount?: number;
}

/** 상태별 좌측 컬러바 + 닷 색상 */
const STATUS_BAR_COLORS: Record<string, string> = {
  pending: "#FF5B5B",
  needs_check: "#FF9F43",
  quote_sent_nudge: "#1AA3FF",
  quote_sent_no_nudge: "#1AA3FF",
  nudge_sent: "#845EF7",
  booked: "#20C997",
  completed: "#ADB5BD",
  no_response: "#ADB5BD",
  wrong_inbound: "#ADB5BD",
  night_pickup: "#845EF7",
  payment_check: "#FF9F43",
  cancelled: "#ADB5BD",
};

export const ConversationCard = memo(function ConversationCard({ conv, isSelected, onClick, onMarkRead, presenceViewers, mentionCount = 0 }: Props) {
  const lastMsg = conv.messages[conv.messages.length - 1];
  const preview = lastMsg?.content?.replace(/\n/g, " ").slice(0, 50) ?? "";
  const barColor = STATUS_BAR_COLORS[conv.status] ?? "#ADB5BD";

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left",
        padding: "14px 20px",
        backgroundColor: isSelected ? "var(--app-selected-bg)" : "transparent",
        cursor: "pointer",
        transition: "background-color 0.15s",
        display: "block", border: "none",
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--app-border-light)",
        borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: barColor,
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {/* 상단: 이름 + 시간 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <div style={{ position: "relative", flexShrink: 0, width: 36, height: 36 }}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              backgroundColor: "var(--app-border)", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 600, color: "var(--app-text-secondary)",
              border: conv.booking ? "2px solid #20C997" : "none",
              boxSizing: "border-box",
            }}>
              {(conv.name ?? conv.userKey).charAt(0).toUpperCase()}
            </div>
            {conv.booking && (
              <span title="예약 있음" style={{
                position: "absolute", right: -1, bottom: -1,
                width: 10, height: 10, borderRadius: "50%",
                backgroundColor: "#20C997",
                border: "2px solid var(--app-surface)",
              }} />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {conv.name ?? conv.userKey}
              </span>
              {conv.unreadCount > 0 && (
                <span
                  role="button"
                  title="읽음 처리"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead?.(conv.sessionId);
                  }}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "white",
                    backgroundColor: "#1AA3FF", borderRadius: 8,
                    padding: "1px 6px", minWidth: 18, textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                </span>
              )}
              {mentionCount > 0 && (
                <span
                  title={`멘션 ${mentionCount}건`}
                  style={{
                    fontSize: 12, fontWeight: 700, color: "white",
                    backgroundColor: "#7B1FA2", borderRadius: 8,
                    padding: "1px 6px", minWidth: 18, textAlign: "center",
                  }}
                >
                  @{mentionCount > 9 ? "9+" : mentionCount}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
          {presenceViewers && presenceViewers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 2 }} title={presenceViewers.map((v) => v.name + (v.typing ? " (입력 중)" : " (보는 중)")).join(", ")}>
              {presenceViewers.slice(0, 3).map((v) => (
                <span key={v.name} style={{
                  width: 18, height: 18, borderRadius: "50%", fontSize: 9, fontWeight: 700,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: v.typing ? "#DBEAFE" : "#D1FAE5",
                  color: v.typing ? "#1D4ED8" : "#15803D",
                  border: "2px solid var(--app-surface)",
                  marginRight: -6,
                }}>
                  {v.name[0]}
                </span>
              ))}
              {presenceViewers.length > 3 && (
                <span style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginLeft: 8 }}>+{presenceViewers.length - 3}</span>
              )}
            </div>
          )}
          <span style={{ fontSize: 12, color: "var(--app-text-placeholder)" }}>
            {formatDistanceToNow(conv.updatedAt)}
          </span>
        </div>
      </div>

      {/* 미리보기 */}
      <p style={{
        fontSize: 15, color: "var(--app-text-secondary)", margin: "0 0 8px 44px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {preview || "메시지 없음"}
      </p>

      {/* 상태 + 담당자 뱃지 */}
      <div style={{ display: "flex", gap: 6, marginLeft: 44, flexWrap: "wrap" }}>
        {/* 전화요청 tag — pending/needs_check 일 때만 상태 라벨 대체. 그 외 상태는 그대로 표시. */}
        {(conv.tags ?? []).includes("전화요청") && (conv.status === "pending" || conv.status === "needs_check") ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 13, fontWeight: 600,
            color: "#E65100", backgroundColor: "#FFF3E0",
            borderRadius: 4, padding: "2px 8px",
          }}>
            ☎️ 전화요청
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 13, fontWeight: 500, color: "var(--app-text-secondary)",
            backgroundColor: "var(--app-surface-secondary)", borderRadius: 4, padding: "2px 8px",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: barColor }} />
            {STATUS_LABELS[conv.status]}
          </span>
        )}
        {conv.assignee && (
          <span style={{
            fontSize: 13, fontWeight: 500, color: "var(--app-tag-purple-text)",
            backgroundColor: "var(--app-tag-purple-bg)", borderRadius: 4, padding: "2px 8px",
          }}>
            {conv.assignee}
          </span>
        )}
      </div>
    </button>
  );
}, (prev, next) => {
  // 변경 감지 최소화: 핵심 데이터만 비교
  return prev.isSelected === next.isSelected
    && prev.conv.sessionId === next.conv.sessionId
    && prev.conv.status === next.conv.status
    && prev.conv.unreadCount === next.conv.unreadCount
    && prev.conv.name === next.conv.name
    && prev.conv.assignee === next.conv.assignee
    && prev.conv.updatedAt === next.conv.updatedAt
    && prev.conv.messages?.length === next.conv.messages?.length
    && (prev.conv.tags ?? []).join("|") === (next.conv.tags ?? []).join("|")
    && (prev.mentionCount ?? 0) === (next.mentionCount ?? 0);
});
