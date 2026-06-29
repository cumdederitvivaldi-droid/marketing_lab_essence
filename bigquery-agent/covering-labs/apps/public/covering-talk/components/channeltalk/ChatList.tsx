"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Inbox, Loader2, CheckSquare, Square, X, Send, XCircle, Clock, ChevronDown } from "lucide-react";

const BULK_MESSAGES = [
  { id: "greeting", label: "첫인사", text: "안녕하세요, 커버링 입니다." },
  { id: "greeting_delay", label: "첫인사 (답변지연)", text: "안녕하세요, 커버링 입니다. 문의 주신 내용 확인 후 안내 드리겠습니다, 시간 소요 양해 부탁드립니다." },
  { id: "inquiry", label: "문의사항", text: "안녕하세요, 커버링 입니다. 문의 내용을 보다 자세하게 작성해 주시면 확인 후 안내드리겠습니다." },
  { id: "farewell", label: "마무리인사", text: "감사합니다! 남은 하루도 평안하고 행복하게 보내시기 바라며, 추가 문의가 있으시다면 언제든지 문의 주시기 바랍니다 :)" },
  { id: "night", label: "밤인사", text: "감사합니다 :) 편안한 밤 되세요 🌙" },
  { id: "no_reply_close", label: "미회신종료안내", text: "*별도의 회신이 없을 경우, 상담이 종료됩니다." },
] as const;
import type { CTChat } from "./types";
import type { PresenceState } from "@/lib/hooks/useCounselorPresence";
import { formatTime, getTagColor } from "./utils";

const STATE_TABS = [
  { label: "진행중", state: "opened" },
  { label: "보류", state: "snoozed" },
  { label: "종료", state: "closed" },
] as const;

interface ChatListProps {
  chats: CTChat[];
  selectedId: string | null;
  activeTab: number;
  search: string;
  loading: boolean;
  filterAssignee: string | null;
  filterTag: string | null;
  onSelectChat: (id: string) => void;
  onChangeTab: (idx: number) => void;
  onChangeSearch: (v: string) => void;
  onClearAssignee: () => void;
  onClearTag: () => void;
  onBulkAction?: (chatIds: string[], action: "message" | "close" | "snooze", message?: string) => Promise<void>;
  viewersByChat?: Record<string, PresenceState[]>;
}

export { STATE_TABS };

export default function ChatList({
  chats, selectedId, activeTab, search, loading,
  filterAssignee, filterTag,
  onSelectChat, onChangeTab, onChangeSearch,
  onClearAssignee, onClearTag, onBulkAction, viewersByChat,
}: ChatListProps) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showMsgDropdown, setShowMsgDropdown] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string>("farewell");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollRef = useRef(0);

  // 채팅 목록 변경 시 스크롤 위치 보존 (채팅 종료 후 refetch 등)
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => { savedScrollRef.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // chats 업데이트 후 스크롤 위치 복원
  useEffect(() => {
    if (!loading && savedScrollRef.current > 0) {
      requestAnimationFrame(() => {
        scrollContainerRef.current?.scrollTo(0, savedScrollRef.current);
      });
    }
  }, [chats, loading]);

  // 필터링
  const filtered = chats.filter((c) => {
    if (filterAssignee === "__none__" && c.assignee) return false;
    if (filterAssignee === "__unread__" && c.lastMessagePersonType !== "user") return false;
    if (filterAssignee && filterAssignee !== "__none__" && filterAssignee !== "__unread__" && c.assignee !== filterAssignee) return false;
    if (filterTag && !c.tags.includes(filterTag)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.userName.toLowerCase().includes(q) ||
        c.userPhone.includes(q) ||
        c.lastMessage.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBulk = async (action: "message" | "close" | "snooze") => {
    if (!onBulkAction || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const msg = action === "message" ? BULK_MESSAGES.find((m) => m.id === selectedMsgId)?.text : undefined;
      await onBulkAction(Array.from(selectedIds), action, msg);
      if (action !== "message") exitSelectMode();
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", flexDirection: "column", backgroundColor: "var(--app-surface)",
    }}>
      {/* 탭 */}
      <div style={{ padding: "12px 12px 0" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {STATE_TABS.map((tab, i) => (
            <button
              key={tab.state}
              onClick={() => { onChangeTab(i); exitSelectMode(); }}
              style={{
                flex: 1, padding: "8px 0", fontSize: 15, fontWeight: activeTab === i ? 600 : 400,
                color: activeTab === i ? "var(--app-accent)" : "var(--app-text-tertiary)",
                backgroundColor: activeTab === i ? "var(--app-selected-bg)" : "transparent",
                border: "none", borderRadius: 8, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 검색 + 선택모드 토글 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              width: 16, height: 16, color: "var(--app-text-placeholder)",
            }} />
            <input
              value={search}
              onChange={(e) => onChangeSearch(e.target.value)}
              placeholder="이름, 전화번호, 태그 검색..."
              style={{
                width: "100%", padding: "10px 12px 10px 34px", fontSize: 15,
                border: "1px solid var(--app-border)", borderRadius: 10,
                outline: "none", boxSizing: "border-box",
                backgroundColor: "var(--app-input-bg)", color: "var(--app-text-primary)",
              }}
            />
          </div>
          {activeTab !== 2 && ( // 종료 탭에서는 일괄 작업 불필요
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title="일괄 선택"
              style={{
                width: 38, height: 38, borderRadius: 10, border: "1px solid var(--app-border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: selectMode ? "var(--app-selected-bg)" : "var(--app-input-bg)",
                color: selectMode ? "var(--app-accent)" : "var(--app-text-tertiary)",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <CheckSquare style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>

        {/* 선택모드 헤더 */}
        {selectMode && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingBottom: 8,
          }}>
            <button
              onClick={toggleAll}
              style={{
                border: "none", background: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 13, color: "var(--app-accent)", fontWeight: 500, padding: 0,
              }}
            >
              {selectedIds.size === filtered.length && filtered.length > 0 ? (
                <CheckSquare style={{ width: 14, height: 14 }} />
              ) : (
                <Square style={{ width: 14, height: 14 }} />
              )}
              전체 선택 ({selectedIds.size}/{filtered.length})
            </button>
            <button
              onClick={exitSelectMode}
              style={{
                border: "none", background: "none", cursor: "pointer",
                color: "var(--app-text-tertiary)", padding: 0,
              }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        )}

        {/* 활성 필터 표시 */}
        {(filterAssignee || filterTag) && (
          <div style={{
            display: "flex", alignItems: "center", gap: 4, paddingBottom: 8,
            flexWrap: "wrap",
          }}>
            {filterAssignee && (
              <span style={{
                fontSize: 13, padding: "2px 8px", borderRadius: 10,
                backgroundColor: "var(--app-selected-bg)", color: "var(--app-accent)",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {filterAssignee === "__none__" ? "담당자 없음" : filterAssignee}
                <button
                  onClick={onClearAssignee}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: "var(--app-accent)", fontSize: 13, lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            )}
            {filterTag && (() => {
              const tc = getTagColor(filterTag);
              return (
                <span style={{
                  fontSize: 13, padding: "2px 8px", borderRadius: 10,
                  backgroundColor: tc.bg, color: tc.color,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {filterTag}
                  <button
                    onClick={onClearTag}
                    style={{ border: "none", background: "none", cursor: "pointer", padding: 0, color: tc.color, fontSize: 13, lineHeight: 1 }}
                  >
                    ×
                  </button>
                </span>
              );
            })()}
          </div>
        )}
      </div>

      {/* 목록 */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Loader2 style={{ width: 24, height: 24, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--app-text-tertiary)" }}>
            <Inbox style={{ width: 32, height: 32, marginBottom: 8, color: "var(--app-text-placeholder)" }} />
            <p style={{ fontSize: 15 }}>대화가 없습니다</p>
          </div>
        ) : (
          [...filtered].sort((a, b) => {
            const aUnread = a.state !== "closed" && (a.unreadCount ?? 0) > 0 ? 1 : 0;
            const bUnread = b.state !== "closed" && (b.unreadCount ?? 0) > 0 ? 1 : 0;
            if (aUnread !== bUnread) return bUnread - aUnread;
            return b.lastMessageAt - a.lastMessageAt;
          }).map((chat) => (
            <ChatListItem
              key={chat.id}
              chat={chat}
              selected={chat.id === selectedId}
              selectMode={selectMode}
              checked={selectedIds.has(chat.id)}
              onClick={() => selectMode ? toggleSelect(chat.id) : onSelectChat(chat.id)}
              viewersByChat={viewersByChat}
            />
          ))
        )}
      </div>

      {/* 일괄 작업 바 */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{
          padding: "10px 12px", borderTop: "1px solid var(--app-border)",
          backgroundColor: "var(--app-surface-secondary)",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
            {selectedIds.size}개 선택됨
          </span>

          {/* 메시지 선택 + 발송 */}
          <div style={{ display: "flex", gap: 4 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <button
                onClick={() => setShowMsgDropdown((v) => !v)}
                disabled={bulkLoading}
                style={{
                  width: "100%", padding: "7px 28px 7px 10px", borderRadius: 6,
                  border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
                  color: "var(--app-text-primary)", fontSize: 12, fontWeight: 500,
                  cursor: "pointer", textAlign: "left",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {BULK_MESSAGES.find((m) => m.id === selectedMsgId)?.label ?? "메시지 선택"}
                <ChevronDown style={{
                  width: 12, height: 12, position: "absolute", right: 8, top: "50%",
                  transform: `translateY(-50%) rotate(${showMsgDropdown ? 180 : 0}deg)`,
                  color: "var(--app-text-tertiary)",
                }} />
              </button>
              {showMsgDropdown && (
                <div style={{
                  position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4,
                  backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
                  borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  padding: 4, zIndex: 50, maxHeight: 240, overflowY: "auto",
                }}>
                  {BULK_MESSAGES.map((msg) => (
                    <button
                      key={msg.id}
                      onClick={() => { setSelectedMsgId(msg.id); setShowMsgDropdown(false); }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start",
                        width: "100%", padding: "6px 8px", borderRadius: 4, border: "none",
                        backgroundColor: selectedMsgId === msg.id ? "var(--app-selected-bg)" : "transparent",
                        cursor: "pointer", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (selectedMsgId !== msg.id) e.currentTarget.style.backgroundColor = "var(--app-bg)"; }}
                      onMouseLeave={(e) => { if (selectedMsgId !== msg.id) e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <span style={{
                        fontSize: 12, fontWeight: selectedMsgId === msg.id ? 600 : 400,
                        color: selectedMsgId === msg.id ? "var(--app-accent)" : "var(--app-text-primary)",
                      }}>
                        {msg.label}
                      </span>
                      <span style={{
                        fontSize: 11, color: "var(--app-text-tertiary)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        width: "100%",
                      }}>
                        {msg.text.slice(0, 40)}{msg.text.length > 40 ? "..." : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => handleBulk("message")}
              disabled={bulkLoading}
              title="선택한 메시지 일괄 발송"
              style={{
                padding: "7px 12px", borderRadius: 6,
                border: "none", backgroundColor: "var(--app-accent)",
                color: "#fff", fontSize: 12, fontWeight: 600,
                cursor: bulkLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: 4,
                opacity: bulkLoading ? 0.6 : 1, flexShrink: 0,
              }}
            >
              {bulkLoading ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 13, height: 13 }} />}
              발송
            </button>
          </div>

          {/* 상담종료 + 보류 */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => handleBulk("close")}
              disabled={bulkLoading}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 6,
                border: "1px solid #EF4444", backgroundColor: "var(--app-surface)",
                color: "#EF4444", fontSize: 12, fontWeight: 600,
                cursor: bulkLoading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                opacity: bulkLoading ? 0.6 : 1,
              }}
            >
              <XCircle style={{ width: 13, height: 13 }} />
              상담종료
            </button>
            {activeTab === 0 && (
              <button
                onClick={() => handleBulk("snooze")}
                disabled={bulkLoading}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 6,
                  border: "1px solid #F59E0B", backgroundColor: "var(--app-surface)",
                  color: "#F59E0B", fontSize: 12, fontWeight: 600,
                  cursor: bulkLoading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  opacity: bulkLoading ? 0.6 : 1,
                }}
              >
                <Clock style={{ width: 13, height: 13 }} />
                보류
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 채팅 목록 아이템 ───

// 이름/전화번호 해시로 고정 아바타 배경색 생성
const AVATAR_COLORS = [
  "#FF6B6B", "#FF8E53", "#FFC107", "#66BB6A", "#42A5F5",
  "#AB47BC", "#EC407A", "#26A69A", "#7E57C2", "#5C6BC0",
  "#EF5350", "#FFA726", "#FFEE58", "#9CCC65", "#29B6F6",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function ChatListItem({ chat, selected, selectMode, checked, onClick, viewersByChat }: {
  chat: CTChat; selected: boolean; selectMode: boolean; checked: boolean; onClick: () => void;
  viewersByChat?: Record<string, PresenceState[]>;
}) {
  const timeStr = formatTime(chat.lastMessageAt);
  const isUserLast = chat.lastMessagePersonType === "user";
  const isClosed = chat.state === "closed";
  const unreadCount = isClosed ? 0 : (chat.unreadCount ?? 0);
  const avatarColor = getAvatarColor(chat.userName || chat.userPhone);
  const initial = (chat.userName || "?").charAt(0).toUpperCase();

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px", cursor: "pointer",
        opacity: isClosed ? 0.5 : 1,
        backgroundColor: selectMode && checked ? "var(--app-selected-bg)" : selected ? "var(--app-selected-bg)" : "transparent",
        borderBottom: "1px solid var(--app-border-light)",
        transition: "background-color 0.1s",
        display: "flex", gap: 12, alignItems: "flex-start",
      }}
      onMouseEnter={(e) => { if (!selected && !(selectMode && checked)) e.currentTarget.style.backgroundColor = "var(--app-bg)"; }}
      onMouseLeave={(e) => { if (!selected && !(selectMode && checked)) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {selectMode && (
        <div style={{ paddingTop: 2, flexShrink: 0 }}>
          {checked ? (
            <CheckSquare style={{ width: 18, height: 18, color: "var(--app-accent)" }} />
          ) : (
            <Square style={{ width: 18, height: 18, color: "var(--app-text-placeholder)" }} />
          )}
        </div>
      )}

      {/* 고객 아바타 */}
      <div style={{ flexShrink: 0, position: "relative", marginTop: 2 }}>
        {chat.userAvatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={chat.userAvatarUrl}
            alt={chat.userName}
            style={{
              width: 44, height: 44, borderRadius: "50%",
              objectFit: "cover", border: "2px solid var(--app-border-light)",
            }}
          />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            backgroundColor: avatarColor, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#fff",
          }}>
            {initial}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
            {isUserLast && !isClosed && (
              <div style={{
                width: 7, height: 7, borderRadius: "50%", backgroundColor: "#FF5B5B", flexShrink: 0,
              }} />
            )}
            <span style={{
              fontSize: 16, fontWeight: isUserLast ? 700 : 600, color: "var(--app-text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {chat.userName}
            </span>
            {chat.assignee && (
              <span style={{ fontSize: 13, color: "var(--app-text-placeholder)", flexShrink: 0 }}>{chat.assignee}</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 6 }}>
            {isClosed && (
              <span style={{
                fontSize: 11, padding: "1px 6px", borderRadius: 6,
                backgroundColor: "#F3F4F6", color: "#9CA3AF", fontWeight: 600,
              }}>
                종료됨
              </span>
            )}
            <span style={{ fontSize: 13, color: isUserLast ? "var(--app-text-secondary)" : "var(--app-text-placeholder)", fontWeight: isUserLast ? 600 : 400 }}>{timeStr}</span>
            {unreadCount > 0 && (
              <span style={{
                minWidth: 20, height: 20, borderRadius: 10,
                backgroundColor: "#FF5B5B", color: "#fff",
                fontSize: 12, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px",
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>

        <p style={{
          fontSize: 15, color: isUserLast ? "var(--app-text-primary)" : "var(--app-text-secondary)",
          fontWeight: isUserLast ? 600 : 400,
          margin: "2px 0 4px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {chat.lastMessage || "(메시지 없음)"}
        </p>

        {chat.tags.length > 0 && (
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {chat.tags.slice(0, 3).map((tag, idx) => {
              const tc = getTagColor(tag);
              return (
                <span
                  key={`${tag}-${idx}`}
                  style={{
                    fontSize: 13, padding: "1px 6px", borderRadius: 8,
                    backgroundColor: tc.bg, color: tc.color,
                  }}
                >
                  {tag}
                </span>
              );
            })}
            {chat.tags.length > 3 && (
              <span style={{ fontSize: 13, color: "var(--app-text-placeholder)" }}>+{chat.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* 상담사 Presence 표시 */}
        {(() => {
          const pv = viewersByChat?.[chat.id];
          if (!pv?.length) return null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}
              title={pv.map((v) => v.name + (v.typing ? " (입력 중)" : " (보는 중)")).join(", ")}
            >
              {pv.slice(0, 3).map((v) => (
                <span key={v.name} style={{
                  fontSize: 10, padding: "1px 5px", borderRadius: 4,
                  backgroundColor: v.typing ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.1)",
                  color: v.typing ? "#D97706" : "#6366F1",
                  fontWeight: 600,
                }}>
                  {v.name}{v.typing ? " 입력중" : ""}
                </span>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
