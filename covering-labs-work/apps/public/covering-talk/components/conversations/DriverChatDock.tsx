"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Truck, X, Send, Plus, Trash2, Loader2, Settings, Paperclip, ChevronLeft, ChevronRight } from "lucide-react";
import type { ChatMessage } from "@/lib/store/conversations";

interface DriverChat {
  id: number;
  sessionId: string;
  driverName: string;
  active: boolean;
  createdAt: string;
}

interface DriverConv {
  sessionId: string;
  messages: ChatMessage[];
  userKey: string | null;
  senderKey: string | null;
}

const POLL_INTERVAL_MS = 15000;
const LAST_SEEN_LS_KEY = "driverChat_lastSeen_v1";

function loadLastSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAST_SEEN_LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveLastSeen(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LAST_SEEN_LS_KEY, JSON.stringify(map)); } catch {}
}

export function DriverChatDock() {
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<DriverChat[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [conv, setConv] = useState<DriverConv | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [addName, setAddName] = useState("");
  const [addSession, setAddSession] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const lastSeenMap = useRef<Record<string, number>>(loadLastSeen());

  const markSeen = useCallback((sessionId: string) => {
    lastSeenMap.current[sessionId] = Date.now();
    saveLastSeen(lastSeenMap.current);
  }, []);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number } | null>(null);

  const fetchDrivers = useCallback(async () => {
    const res = await fetch("/api/driver-chats", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const list: DriverChat[] = data.drivers ?? [];
    setDrivers(list);
    // 첫 로드: localStorage 에 없는 driver 는 "지금까지 본 적 없음" 이 아니라
    // "기존 메시지는 모두 읽음 처리" 로 시작 — 새로 들어온 메시지만 unread 로 카운트.
    let dirty = false;
    for (const d of list) {
      if (lastSeenMap.current[d.sessionId] === undefined) {
        lastSeenMap.current[d.sessionId] = Date.now();
        dirty = true;
      }
    }
    if (dirty) saveLastSeen(lastSeenMap.current);
    if (!selectedSession && list.length > 0) setSelectedSession(list[0].sessionId);
  }, [selectedSession]);

  const fetchConv = useCallback(async (sid: string) => {
    const res = await fetch(`/api/conversations/${sid}`, { cache: "no-store" });
    if (!res.ok) {
      setConv({ sessionId: sid, messages: [], userKey: null, senderKey: null });
      return;
    }
    const data = await res.json();
    setConv({
      sessionId: sid,
      messages: data.messages ?? [],
      userKey: data.userKey ?? null,
      senderKey: data.senderKey ?? null,
    });
  }, []);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  useEffect(() => {
    if (!selectedSession) { setConv(null); return; }
    fetchConv(selectedSession);
    markSeen(selectedSession);
    setUnreadMap((m) => ({ ...m, [selectedSession]: 0 }));
  }, [selectedSession, fetchConv, markSeen]);

  // 폴링 — 모든 driver 의 unread, 열려있는 세션은 메시지까지 갱신
  useEffect(() => {
    if (drivers.length === 0) return;
    const tick = async () => {
      for (const d of drivers) {
        try {
          const res = await fetch(`/api/conversations/${d.sessionId}`, { cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          const msgs: ChatMessage[] = data.messages ?? [];
          const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user");
          if (!lastUserMsg) {
            if (open && selectedSession === d.sessionId && msgs.length !== conv?.messages.length) {
              setConv({ sessionId: d.sessionId, messages: msgs, userKey: data.userKey, senderKey: data.senderKey });
            }
            continue;
          }
          const seen = lastSeenMap.current[d.sessionId] ?? 0;
          if (lastUserMsg.timestamp > seen) {
            if (open && selectedSession === d.sessionId) {
              markSeen(d.sessionId);
              setUnreadMap((m) => ({ ...m, [d.sessionId]: 0 }));
              setConv({ sessionId: d.sessionId, messages: msgs, userKey: data.userKey, senderKey: data.senderKey });
            } else {
              const count = msgs.filter((m) => m.role === "user" && m.timestamp > seen).length;
              setUnreadMap((m) => ({ ...m, [d.sessionId]: count }));
            }
          } else if (open && selectedSession === d.sessionId && msgs.length !== conv?.messages.length) {
            setConv({ sessionId: d.sessionId, messages: msgs, userKey: data.userKey, senderKey: data.senderKey });
          }
        } catch {}
      }
    };
    const iv = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [drivers, open, selectedSession, conv?.messages.length]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conv?.messages.length]);

  const totalUnread = Object.values(unreadMap).reduce((a, b) => a + b, 0);

  const handleSend = async () => {
    if (!selectedSession || !draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedSession}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`전송 실패: ${err.error ?? res.status}`);
        return;
      }
      setDraft("");
      await fetchConv(selectedSession);
    } finally {
      setSending(false);
    }
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!selectedSession || !files || files.length === 0 || uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/conversations/${selectedSession}/send-image`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(`이미지 전송 실패: ${err.error ?? res.status}`);
          break;
        }
      }
      await fetchConv(selectedSession);
    } finally {
      setUploading(false);
    }
  };

  // 라이트박스 키보드 네비게이션
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft") setLightbox((l) => l ? { ...l, idx: Math.max(0, l.idx - 1) } : null);
      if (e.key === "ArrowRight") setLightbox((l) => l ? { ...l, idx: Math.min(l.urls.length - 1, l.idx + 1) } : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const handleAdd = async () => {
    if (!addSession.trim() || !addName.trim()) return;
    const res = await fetch("/api/driver-chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: addSession.trim(), driverName: addName.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`추가 실패: ${err.error ?? res.status}`);
      return;
    }
    setAddName(""); setAddSession("");
    await fetchDrivers();
  };

  const handleRemove = async (sessionId: string) => {
    if (!confirm("이 기사님을 도크에서 제거할까요? (대화 기록은 유지)")) return;
    const res = await fetch(`/api/driver-chats?session_id=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    if (!res.ok) { alert("제거 실패"); return; }
    if (selectedSession === sessionId) setSelectedSession(null);
    await fetchDrivers();
  };

  return (
    <>
      {/* 토글 버튼 — 우상단 viewport 고정. 압축형(아이콘 only)로 헤더 영역 침범 최소화 */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={`기사님 채팅 (${drivers.length}명${totalUnread ? ` · 안읽음 ${totalUnread}` : ""})`}
        style={{
          position: "fixed", top: 8, right: 8,
          zIndex: 10002,
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 32, height: 32,
          color: open ? "white" : "var(--app-text-secondary)",
          backgroundColor: open ? "var(--app-accent)" : "var(--app-surface)",
          borderRadius: "50%",
          border: `1px solid ${open ? "var(--app-accent)" : "var(--app-border)"}`,
          cursor: "pointer",
          transition: "all 0.15s",
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        }}
      >
        <Truck style={{ width: 14, height: 14 }} />
        {totalUnread > 0 && (
          <span style={{
            position: "absolute", top: -3, right: -3,
            background: "#ef4444", color: "white",
            borderRadius: 10, padding: "1px 5px",
            fontSize: 10, fontWeight: 700, lineHeight: 1.4,
            minWidth: 16, textAlign: "center",
            border: "2px solid var(--app-surface)",
          }}>
            {totalUnread}
          </span>
        )}
      </button>

      {/* 우측 풀높이 사이드 도크 — backdrop 없음, ChatArea 침범 X, 모달보다 위 */}
      {open && (
        <div style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: 380, maxWidth: "92vw",
          background: "var(--app-surface)",
          borderLeft: "1px solid var(--app-border)",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
          zIndex: 10001,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* 헤더 */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderBottom: "1px solid var(--app-border)",
            background: "var(--app-surface-secondary, #f8fafc)",
            flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Truck style={{ width: 16, height: 16, color: "var(--app-accent)" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>기사님 채팅</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <button
                onClick={() => setShowSettings((v) => !v)}
                title="기사 추가/삭제"
                style={{
                  background: showSettings ? "var(--app-bg-subtle, #e2e8f0)" : "none",
                  border: "none", cursor: "pointer", padding: 6,
                  color: "var(--app-text-tertiary)", borderRadius: 6,
                }}
              >
                <Settings style={{ width: 15, height: 15 }} />
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 6,
                  color: "var(--app-text-tertiary)", borderRadius: 6,
                }}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
          </div>

          {/* 기사 탭 row */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 10px",
            borderBottom: "1px solid var(--app-border)",
            overflowX: "auto", flexShrink: 0,
          }}>
            {drivers.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", padding: "4px 6px" }}>
                등록된 기사님이 없습니다 — 톱니 버튼으로 추가
              </div>
            )}
            {drivers.map((d) => {
              const unread = unreadMap[d.sessionId] ?? 0;
              const active = selectedSession === d.sessionId;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedSession(d.sessionId)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", flexShrink: 0,
                    fontSize: 12, fontWeight: active ? 600 : 500,
                    color: active ? "white" : "var(--app-text-secondary)",
                    background: active ? "var(--app-accent)" : "var(--app-surface-secondary, #f1f5f9)",
                    border: "none", borderRadius: 16, cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {d.driverName}
                  {unread > 0 && (
                    <span style={{
                      background: active ? "rgba(255,255,255,0.3)" : "#ef4444",
                      color: "white",
                      borderRadius: 8, padding: "0 5px",
                      fontSize: 10, fontWeight: 700,
                      minWidth: 14, textAlign: "center", lineHeight: 1.6,
                    }}>
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 설정 패널 (추가/삭제) */}
          {showSettings && (
            <div style={{
              padding: "10px 12px", flexShrink: 0,
              background: "var(--app-bg-subtle, #f8fafc)",
              borderBottom: "1px solid var(--app-border)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {drivers.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "4px 6px", fontSize: 12,
                    }}
                  >
                    <span><b>{d.driverName}</b> · <span style={{ color: "var(--app-text-tertiary)" }}>{d.sessionId}</span></span>
                    <button
                      onClick={() => handleRemove(d.sessionId)}
                      title="제거"
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#ef4444" }}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="이름"
                  style={{
                    flex: 1, padding: "5px 8px", fontSize: 12,
                    border: "1px solid var(--app-border)", borderRadius: 6,
                    outline: "none", background: "var(--app-surface)",
                  }}
                />
                <input
                  value={addSession}
                  onChange={(e) => setAddSession(e.target.value)}
                  placeholder="세션 ID"
                  style={{
                    flex: 1, padding: "5px 8px", fontSize: 12,
                    border: "1px solid var(--app-border)", borderRadius: 6,
                    outline: "none", background: "var(--app-surface)",
                  }}
                />
                <button
                  onClick={handleAdd}
                  style={{
                    padding: "0 10px", fontSize: 12, fontWeight: 600,
                    background: "var(--app-accent)", color: "white",
                    border: "none", borderRadius: 6, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                >
                  <Plus style={{ width: 12, height: 12 }} /> 추가
                </button>
              </div>
            </div>
          )}

          {/* 라이트박스 (도크 내부 z 위에 떠있음) — 단축키 ←→ Esc */}
          {/* (실제 마운트는 외부 fragment 끝부분, 여기는 placeholder 주석) */}

          {/* 채팅 영역 */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {!selectedSession && (
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--app-text-tertiary)", fontSize: 13,
              }}>
                기사님을 선택해 주세요
              </div>
            )}
            {selectedSession && !conv && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
              </div>
            )}
            {selectedSession && conv && (
              <>
                <div
                  onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onDrop={(e) => {
                    e.preventDefault(); setDragActive(false);
                    if (e.dataTransfer.files?.length) handleUploadFiles(e.dataTransfer.files);
                  }}
                  style={{
                    flex: 1, overflowY: "auto", padding: 12, background: "var(--app-bg)",
                    position: "relative",
                    outline: dragActive ? "3px dashed var(--app-accent)" : "none",
                    outlineOffset: -3,
                  }}
                >
                  {dragActive && (
                    <div style={{
                      position: "absolute", inset: 0, zIndex: 5,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(99,102,241,0.06)",
                      pointerEvents: "none",
                      fontSize: 13, fontWeight: 600, color: "var(--app-accent)",
                    }}>
                      여기에 이미지를 놓아주세요
                    </div>
                  )}
                  {conv.messages.length === 0 && (
                    <div style={{ textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 12, padding: 24 }}>
                      아직 메시지 없음
                    </div>
                  )}
                  {renderGroupedMessages(
                    conv.messages.filter((m) => m.role === "user" || m.role === "assistant"),
                    (urls, idx) => setLightbox({ urls, idx }),
                  )}
                  <div ref={messageEndRef} />
                </div>
                <div style={{
                  borderTop: "1px solid var(--app-border)", padding: 8,
                  display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-end",
                }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files?.length) handleUploadFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="이미지 첨부"
                    style={{
                      padding: 8, background: "var(--app-surface-secondary, #f1f5f9)",
                      border: "1px solid var(--app-border)", borderRadius: 6,
                      cursor: uploading ? "wait" : "pointer",
                      color: "var(--app-text-secondary)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {uploading ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Paperclip style={{ width: 14, height: 14 }} />}
                  </button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    placeholder="메시지 (Shift+Enter 줄바꿈, 이미지는 끌어다 놓기)"
                    rows={2}
                    style={{
                      flex: 1, padding: "6px 8px", fontSize: 12,
                      border: "1px solid var(--app-border)", borderRadius: 6,
                      outline: "none", resize: "none",
                      background: "var(--app-surface)",
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    style={{
                      padding: "0 12px", height: 38,
                      background: "var(--app-accent)", color: "white",
                      border: "none", borderRadius: 6, cursor: "pointer",
                      opacity: sending || !draft.trim() ? 0.5 : 1,
                      display: "flex", alignItems: "center", gap: 3,
                      fontSize: 12, fontWeight: 600, flexShrink: 0,
                    }}
                  >
                    {sending ? <Loader2 style={{ width: 13, height: 13, animation: "spin 1s linear infinite" }} /> : <Send style={{ width: 13, height: 13 }} />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          idx={lightbox.idx}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox((l) => l ? { ...l, idx: Math.max(0, l.idx - 1) } : null)}
          onNext={() => setLightbox((l) => l ? { ...l, idx: Math.min(l.urls.length - 1, l.idx + 1) } : null)}
        />
      )}
    </>
  );
}

// 연속된 같은 role 의 이미지 메시지들을 묶어 가로 grid 로 렌더 — ChatArea 동일 패턴
function renderGroupedMessages(
  msgs: ChatMessage[],
  onOpenLightbox: (urls: string[], idx: number) => void,
): React.ReactNode {
  const elements: React.ReactNode[] = [];
  const skipSet = new Set<string>();
  msgs.forEach((msg, idx) => {
    if (skipSet.has(msg.id)) return;
    if (msg.messageType === "image" && msg.imageUrl) {
      const group: ChatMessage[] = [msg];
      for (let j = idx + 1; j < msgs.length; j++) {
        const next = msgs[j];
        if (next.messageType === "image" && next.imageUrl && next.role === msg.role) {
          group.push(next);
          skipSet.add(next.id);
        } else break;
      }
      const urls = group.map((g) => g.imageUrl!).filter(Boolean);
      elements.push(
        <ImageGroup
          key={msg.id}
          messages={group}
          onOpen={(i) => onOpenLightbox(urls, i)}
        />,
      );
      return;
    }
    elements.push(<TextRow key={msg.id} message={msg} />);
  });
  return elements;
}

function ImageGroup({ messages, onOpen }: { messages: ChatMessage[]; onOpen: (idx: number) => void }) {
  const isUser = messages[0].role === "user";
  const cols = messages.length === 1 ? "1fr" : messages.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr";
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isUser ? "flex-start" : "flex-end",
      marginBottom: 8,
    }}>
      <div style={{
        display: "grid", gridTemplateColumns: cols, gap: 4,
        maxWidth: "92%",
        borderRadius: 10, overflow: "hidden",
        border: "1px solid var(--app-border)",
      }}>
        {messages.map((m, i) => (
          <div
            key={m.id}
            onClick={() => onOpen(i)}
            style={{ cursor: "zoom-in", aspectRatio: messages.length === 1 ? "auto" : "1 / 1", overflow: "hidden", background: "#fff" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.imageUrl}
              alt={m.content || "이미지"}
              style={{
                width: "100%",
                height: messages.length === 1 ? "auto" : "100%",
                maxHeight: messages.length === 1 ? 280 : undefined,
                objectFit: messages.length === 1 ? "contain" : "cover",
                display: "block",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 2, padding: "0 4px" }}>
        {new Date(messages[messages.length - 1].timestamp).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        {messages.length > 1 && ` · ${messages.length}장`}
      </div>
    </div>
  );
}

function TextRow({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isUser ? "flex-start" : "flex-end",
      marginBottom: 6,
    }}>
      <div style={{
        maxWidth: "82%",
        padding: "6px 10px", borderRadius: 10,
        background: isUser ? "var(--app-surface)" : "var(--app-accent)",
        color: isUser ? "var(--app-text-primary)" : "white",
        fontSize: 12, lineHeight: 1.45,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        border: isUser ? "1px solid var(--app-border)" : "none",
      }}>
        {message.content}
      </div>
      <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 1, padding: "0 4px" }}>
        {new Date(message.timestamp).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        {message.sentBy && !isUser && ` · ${message.sentBy}`}
      </div>
    </div>
  );
}

function Lightbox({ urls, idx, onClose, onPrev, onNext }: {
  urls: string[]; idx: number; onClose: () => void; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10005,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="닫기"
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)",
          color: "white", borderRadius: 999, padding: 8, cursor: "pointer",
        }}
      >
        <X style={{ width: 18, height: 18 }} />
      </button>
      {idx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          style={{
            position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)",
            color: "white", borderRadius: 999, padding: 10, cursor: "pointer",
          }}
        >
          <ChevronLeft style={{ width: 22, height: 22 }} />
        </button>
      )}
      {idx < urls.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.2)",
            color: "white", borderRadius: 999, padding: 10, cursor: "pointer",
          }}
        >
          <ChevronRight style={{ width: 22, height: 22 }} />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[idx]}
        alt={`이미지 ${idx + 1}/${urls.length}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain" }}
      />
      <div style={{
        position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.6)", color: "white",
        padding: "4px 12px", borderRadius: 999, fontSize: 12,
      }}>
        {idx + 1} / {urls.length}
      </div>
    </div>
  );
}
