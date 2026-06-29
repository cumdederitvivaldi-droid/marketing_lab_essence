"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Conversation, ConversationStatus } from "@/lib/store/conversations";
import { ConversationCard } from "@/components/conversations/ConversationCard";
import { ChatArea } from "@/components/conversations/ChatArea";
import { CustomerPanel } from "@/components/conversations/CustomerPanel";
import { AssistantBuddy } from "@/components/conversations/AssistantBuddy";
import { Search, Inbox, Loader2, MessageSquare, CalendarCheck, Package, LayoutDashboard, Receipt, ChevronDown } from "lucide-react";
import { getCached, setCache, CACHE_KEYS } from "@/lib/cache/prefetch";
import { toast } from "sonner";
import { useCounselorPresence, type PresenceState } from "@/lib/hooks/useCounselorPresence";
import { useMentionNotifier } from "@/lib/hooks/useMentionNotifier";
import { useConversationUpdates } from "@/lib/hooks/ConversationUpdatesContext";
import { PickupInvoicesView } from "@/components/conversations/PickupInvoicesView";
import { DriverChatDock } from "@/components/conversations/DriverChatDock";

const DashboardPage = dynamic(() => import("@/app/page"), { ssr: false });
const BookingsPage = dynamic(() => import("@/app/bookings/page"), { ssr: false });
const ItemsPage = dynamic(() => import("@/app/items/page"), { ssr: false });

type ViewMode = "chat" | "dashboard" | "bookings" | "items" | "invoices";
const PRIMARY_TABS: { key: ViewMode; label: string; icon: typeof MessageSquare }[] = [
  { key: "chat", label: "상담", icon: MessageSquare },
  { key: "bookings", label: "예약", icon: CalendarCheck },
  { key: "dashboard", label: "대시보드", icon: LayoutDashboard },
];
const MORE_TABS: { key: ViewMode; label: string; icon: typeof MessageSquare }[] = [
  { key: "items", label: "품목", icon: Package },
  { key: "invoices", label: "세금계산서", icon: Receipt },
];
const VIEW_TABS = [...PRIMARY_TABS, ...MORE_TABS]; // 상단 큰 탭에서 사용 (chat이 아닐 때)

function MoreTabsDropdown({ viewMode, onSelect }: { viewMode: ViewMode; onSelect: (k: ViewMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeMore = MORE_TABS.find((t) => t.key === viewMode);
  const isActive = !!activeMore;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const buttonLabel = activeMore?.label ?? "더보기";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={buttonLabel}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          height: 36, padding: "0 10px",
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          color: isActive ? "white" : "var(--app-text-tertiary)",
          backgroundColor: isActive ? "var(--app-accent)" : "transparent",
          borderRadius: 8, border: "none", cursor: "pointer",
          transition: "all 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        {activeMore && <activeMore.icon style={{ width: 14, height: 14, flexShrink: 0 }} />}
        {buttonLabel}
        <ChevronDown style={{
          width: 12, height: 12, flexShrink: 0,
          transition: "transform 0.15s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          minWidth: 160, zIndex: 100,
          backgroundColor: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          padding: 4,
        }}>
          {MORE_TABS.map(({ key, label, icon: Icon }) => {
            const active = viewMode === key;
            return (
              <button
                key={key}
                onClick={() => { onSelect(key); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", height: 34, padding: "0 10px",
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? "var(--app-accent)" : "var(--app-text-primary)",
                  backgroundColor: active ? "var(--app-tag-blue-bg)" : "transparent",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CLOSED_STATUSES: ConversationStatus[] = ["completed", "no_response", "wrong_inbound", "cancelled"];
const HIDDEN_FROM_ALL: ConversationStatus[] = [...CLOSED_STATUSES, "booked"];

const TABS: { label: string; statuses: ConversationStatus[] | "active" }[] = [
  { label: "전체", statuses: "active" },
  { label: "대기중", statuses: ["pending", "needs_check"] },
  { label: "진행중", statuses: ["quote_sent_nudge", "quote_sent_no_nudge", "nudge_sent", "night_pickup", "payment_check"] },
  { label: "예약완료", statuses: ["booked"] },
  { label: "종료", statuses: CLOSED_STATUSES },
];

export default function ConversationsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const cached = getCached<Conversation[]>(CACHE_KEYS.CONVERSATIONS);
  const [conversations, setConversations] = useState<Conversation[]>(cached ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");
  const [isFirstLoad, setIsFirstLoad] = useState(!cached || cached.length === 0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const initialIdApplied = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  // 내부대화 멘션 폴링 — toast 알림 + 세션별 카운터 유지
  const { unreadBySession: mentionUnread, markRead: markMentionRead } = useMentionNotifier((sid) => {
    setViewMode("chat");
    setSelectedId(sid);
  });

  // URL ?id= 파라미터로 세션 바로 열기
  useEffect(() => {
    if (initialIdApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("id");
    if (targetId) {
      initialIdApplied.current = true;
      setSelectedId(targetId);
      setActiveTab(0);
    }
  }, []);

  const buildStatusQuery = useCallback(() => {
    const tab = TABS[activeTab];
    if (Array.isArray(tab.statuses) && tab.statuses.length > 0) {
      return `&statuses=${encodeURIComponent(tab.statuses.join(","))}`;
    }
    return "";
  }, [activeTab]);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?limit=50${buildStatusQuery()}`);
      if (!res.ok) return;
      const data = await res.json();
      const list = data.conversations ?? [];
      setNextCursor(data.nextCursor ?? null);
      // 목록은 메시지 1개만 포함 → 이미 전체 로드된 대화의 메시지는 보존
      setConversations((prev) => {
        const prevMap = new Map(prev.map((c) => [c.sessionId, c]));
        // 기존에 cursor로 추가 로드된 대화는 유지
        const existingExtra = prev.filter(
          (c) => !list.some((n: { sessionId: string }) => n.sessionId === c.sessionId)
        );
        const merged = list.map((newConv: Conversation & { messages?: { id: string; timestamp: number }[] }) => {
          const existing = prevMap.get(newConv.sessionId);
          if (existing && existing.messages?.length > 1) {
            // 새 메시지(1개)가 기존 목록에 없으면 추가하여 미리보기 갱신
            const latestMsg = newConv.messages?.[0];
            if (latestMsg && !existing.messages.some((m) => m.id === latestMsg.id)) {
              return { ...newConv, messages: [...existing.messages, latestMsg] };
            }
            return { ...newConv, messages: existing.messages };
          }
          return newConv;
        });
        return [...merged, ...existingExtra];
      });
      setCache(CACHE_KEYS.CONVERSATIONS, list);
    } finally {
      setIsFirstLoad(false);
    }
  }, [buildStatusQuery]);

  const fetchMoreRef = useRef(false);
  const fetchMore = useCallback(async () => {
    if (!nextCursor || fetchMoreRef.current) return;
    fetchMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/conversations?limit=50&cursor=${encodeURIComponent(nextCursor)}${buildStatusQuery()}`);
      if (!res.ok) return;
      const data = await res.json();
      const more = data.conversations ?? [];
      setNextCursor(data.nextCursor ?? null);
      if (more.length > 0) {
        setConversations((prev) => {
          const existingIds = new Set(prev.map((c) => c.sessionId));
          const newConvs = more.filter((c: { sessionId: string }) => !existingIds.has(c.sessionId));
          return [...prev, ...newConvs];
        });
      }
    } catch {} finally {
      setIsLoadingMore(false);
      // 완료 후 1초 동안 재호출 차단 (스크롤 이벤트 연속 발생 방지)
      setTimeout(() => { fetchMoreRef.current = false; }, 1000);
    }
  }, [nextCursor, buildStatusQuery]);

  const fetchSelected = useCallback(async () => {
    if (!selectedId) return;
    const res = await fetch(`/api/conversations/${selectedId}`);
    if (!res.ok) return;
    const data = await res.json();
    setConversations((prev) =>
      prev.map((c) => {
        if (c.sessionId !== selectedId) return c;
        // 메시지가 비어있는 응답이 오면 기존 메시지 유지 (after() 비동기 저장과 경합 방지)
        if (c.messages?.length > 0 && (!data.messages || data.messages.length === 0)) {
          return { ...c, ...data, messages: c.messages };
        }
        return { ...c, ...data };
      })
    );
  }, [selectedId]);

  // 캐시 데이터가 있으면 즉시 표시되므로, fetch는 백그라운드 갱신용.
  // 탭 변경 시 cursor 리셋 (새 status 필터로 깨끗이 다시 로드)
  useEffect(() => {
    setNextCursor(null);
    fetchList();
  }, [fetchList]);

  // 검색어 변경 시 서버사이드 검색 (300ms debounce)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/conversations?limit=50&search=${encodeURIComponent(search.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setSearchResults(data.conversations ?? []);
      } catch {}
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // 변경된 대화만 개별 fetch하여 머지 (전체 목록 재로드 방지)
  const fetchChangedConversations = useCallback(async (sessionIds: string[]) => {
    const results = await Promise.allSettled(
      sessionIds.map(async (sid) => {
        const res = await fetch(`/api/conversations/${sid}`);
        if (!res.ok) return null;
        return res.json();
      })
    );
    const updated: Conversation[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) updated.push(r.value);
    }
    if (updated.length === 0) return;

    setConversations((prev) => {
      const prevMap = new Map(prev.map((c) => [c.sessionId, c]));
      let hasNew = false;

      for (const conv of updated) {
        if (prevMap.has(conv.sessionId)) {
          const existing = prevMap.get(conv.sessionId)!;
          // 기존 메시지가 풍부하면 보존하되, 새 메시지 추가
          if (existing.messages?.length > 1 && conv.messages?.length <= 1) {
            const latestMsg = conv.messages?.[0];
            if (latestMsg && !existing.messages.some((m: { id: string }) => m.id === latestMsg.id)) {
              prevMap.set(conv.sessionId, { ...conv, messages: [...existing.messages, latestMsg] });
            } else {
              prevMap.set(conv.sessionId, { ...conv, messages: existing.messages });
            }
          } else {
            prevMap.set(conv.sessionId, conv);
          }
        } else {
          prevMap.set(conv.sessionId, conv);
          hasNew = true;
        }
      }

      // 기존 순서 유지하면서 교체 + 새 대화는 맨 앞에 추가
      const merged = prev.map((c) => prevMap.get(c.sessionId) ?? c);
      if (hasNew) {
        const existingIds = new Set(prev.map((c) => c.sessionId));
        const newConvs = updated.filter((c) => !existingIds.has(c.sessionId));
        return [...newConvs, ...merged];
      }
      return merged;
    });
  }, []);

  // 변경사항 감지 → 변경된 대화만 개별 갱신
  // 폴링은 ConversationUpdatesProvider 가 단일 15s 로 수행, 본 페이지는 결과만 구독.
  const conversationUpdate = useConversationUpdates();
  useEffect(() => {
    if (!conversationUpdate) return;
    if (conversationUpdate.sessionIds.length === 0) return;
    fetchChangedConversations(conversationUpdate.sessionIds);
    if (selectedId && conversationUpdate.sessionIds.includes(selectedId)) {
      fetchSelected();
    }
  }, [conversationUpdate, fetchChangedConversations, fetchSelected, selectedId]);

  const markAsRead = useCallback(async (sessionId: string) => {
    // 로컬 상태 즉시 반영
    setConversations((prev) =>
      prev.map((c) =>
        c.sessionId === sessionId ? { ...c, unreadCount: 0, aiDraft: null } : c
      )
    );
    // API 호출
    try {
      await fetch(`/api/conversations/${sessionId}/read`, { method: "POST" });
    } catch {}
  }, []);

  const handleSelectConv = useCallback(async (sessionId: string) => {
    setSelectedId(sessionId);
    markMentionRead(sessionId);
    // 자동 읽음 처리 제거 — 상담사가 실제 답장을 보낼 때만 unread 해제 (누락 방지)
    // 목록에는 마지막 메시지 1개만 있으므로 클릭 시 전체 메시지 로드
    const loadMessages = async (retry = 0): Promise<void> => {
      try {
        const res = await fetch(`/api/conversations/${sessionId}`);
        if (!res.ok) {
          console.warn(`[ChatList] 메시지 로드 실패 (${res.status}), retry=${retry}`);
          if (retry < 2) return loadMessages(retry + 1);
          return;
        }
        const data = await res.json();
        setConversations((prev) => {
          const exists = prev.some((c) => c.sessionId === sessionId);
          if (!exists) {
            // 검색 결과에서 클릭한 대화 → conversations에 추가
            return [...prev, data];
          }
          return prev.map((c) => {
            if (c.sessionId !== sessionId) return c;
            if (c.messages?.length > 0 && (!data.messages || data.messages.length === 0)) {
              return { ...c, ...data, messages: c.messages };
            }
            return { ...c, ...data };
          });
        });
      } catch (err) {
        console.warn(`[ChatList] 메시지 로드 에러, retry=${retry}`, err);
        if (retry < 2) return loadMessages(retry + 1);
      }
    };
    loadMessages();
  }, []);

  const handleExtractToQuote = useCallback(async (content: string): Promise<number> => {
    if (!selectedId) return 0;
    const res = await fetch(`/api/conversations/${selectedId}/extract-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: content }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "품목 추출 실패");
      return 0;
    }
    if (data.addedCount === 0) {
      toast.info(data.message ?? "추출할 품목이 없습니다");
      return 0;
    }
    toast.success(`${data.addedCount}개 품목이 견적에 추가되었습니다`);
    fetchSelected();
    return data.addedCount;
  }, [selectedId, fetchSelected]);

  const selectedConv = conversations.find((c) => c.sessionId === selectedId)
    ?? searchResults?.find((c) => c.sessionId === selectedId)
    ?? null;

  // ─── Realtime Presence (상담사 존재 표시) ────
  const { othersInSession, viewersBySession, setTyping } = useCounselorPresence(selectedId);

  // 안전장치: selectedId가 있는데 selectedConv가 없으면 직접 fetch
  const fetchingRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId || selectedConv || fetchingRef.current === selectedId) return;
    fetchingRef.current = selectedId;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${selectedId}`);
        if (!res.ok) return;
        const data = await res.json();
        setConversations((prev) => {
          if (prev.some((c) => c.sessionId === selectedId)) {
            return prev.map((c) => c.sessionId === selectedId ? { ...c, ...data } : c);
          }
          return [...prev, data];
        });
      } catch {} finally {
        fetchingRef.current = null;
      }
    })();
  }, [selectedId, selectedConv]);

  // 검색 중이면 서버 결과 사용, 아니면 로컬 탭 필터링
  const baseList = searchResults !== null ? searchResults : conversations;
  const filtered = baseList.filter((c) => {
    const tab = TABS[activeTab];
    const matchTab =
      tab.statuses === "active"
        ? !HIDDEN_FROM_ALL.includes(c.status)
        : Array.isArray(tab.statuses)
          ? tab.statuses.includes(c.status)
          : true;
    return matchTab;
  });

  // 결과가 적어서 스크롤이 안 생기면 cursor 가 끝날 때까지 계속 자동 로드
  useEffect(() => {
    if (searchResults !== null || !nextCursor || fetchMoreRef.current) return;
    const el = listRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) {
      fetchMore();
    }
  }, [filtered.length, nextCursor, searchResults, fetchMore]);

  // 예약/품목 뷰일 때는 전체 영역 사용
  if (viewMode !== "chat") {
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: "var(--app-bg)" }}>
        {/* 뷰 전환 탭 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          padding: "0 24px",
          borderBottom: "1px solid var(--app-border)",
          backgroundColor: "var(--app-surface)",
          flexShrink: 0,
        }}>
          {VIEW_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 48, padding: "0 16px",
                fontSize: 14, fontWeight: viewMode === key ? 600 : 400,
                color: viewMode === key ? "var(--app-accent)" : "var(--app-text-tertiary)",
                background: "none", cursor: "pointer",
                border: "none",
                borderBottom: `2px solid ${viewMode === key ? "var(--app-accent)" : "transparent"}`,
              }}
            >
              <Icon style={{ width: 16, height: 16 }} />
              {label}
            </button>
          ))}
        </div>
        {/* 콘텐츠 */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {viewMode === "dashboard" && <DashboardPage />}
          {viewMode === "bookings" && <BookingsPage />}
          {viewMode === "items" && <ItemsPage />}
          {viewMode === "invoices" && <PickupInvoicesView />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex" style={{ backgroundColor: "var(--app-bg)" }}>
      <DriverChatDock />
      {/* 좌측: 상담 목록 */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ width: 320, backgroundColor: "var(--app-surface)", borderRight: "1px solid var(--app-border)" }}
      >
        {/* 헤더 + 뷰 전환 */}
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            marginBottom: 12,
          }}>
            {PRIMARY_TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                title={label}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  height: 36, padding: "0 12px",
                  fontSize: 13, fontWeight: viewMode === key ? 600 : 400,
                  color: viewMode === key ? "white" : "var(--app-text-tertiary)",
                  backgroundColor: viewMode === key ? "var(--app-accent)" : "transparent",
                  borderRadius: 8, border: "none", cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <Icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                {label}
              </button>
            ))}
            <MoreTabsDropdown viewMode={viewMode} onSelect={setViewMode} />
          </div>
          <div style={{ position: "relative" }}>
            <Search
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--app-text-placeholder)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름, 전화번호, 세션ID 검색"
              style={{
                width: "100%", paddingLeft: 36, paddingRight: 12,
                height: 38, fontSize: 14, backgroundColor: "var(--app-surface-secondary)",
                borderRadius: 8, border: "none", outline: "none",
                color: "var(--app-text-primary)",
              }}
            />
          </div>
        </div>

        {/* 상태 필터 탭 */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--app-border)", padding: "0 12px", gap: 0, marginTop: 8 }}>
          {TABS.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                flex: 1, height: 42, fontSize: 14, fontWeight: activeTab === i ? 600 : 400,
                color: activeTab === i ? "var(--app-accent)" : "var(--app-text-tertiary)",
                borderBottom: activeTab === i ? "2px solid #1AA3FF" : "2px solid transparent",
                background: "none", cursor: "pointer",
                borderTop: "none", borderLeft: "none", borderRight: "none",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div
          ref={listRef}
          style={{ flex: 1, overflowY: "auto" }}
          onScroll={(e) => {
            if (searchResults !== null || fetchMoreRef.current) return;
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 100 && nextCursor) {
              fetchMore();
            }
          }}
        >
          {isFirstLoad ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Loader2 style={{ width: 28, height: 28, marginBottom: 8, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
              <p style={{ fontSize: 14, color: "var(--app-text-tertiary)", margin: 0 }}>로딩 중...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Inbox style={{ width: 40, height: 40, marginBottom: 8, color: "var(--app-text-placeholder)" }} />
              <p style={{ fontSize: 14, color: "var(--app-text-tertiary)", margin: 0 }}>상담이 없습니다</p>
            </div>
          ) : (
            <>
              {filtered.map((conv) => (
                <ConversationCard
                  key={conv.sessionId}
                  conv={conv}
                  isSelected={conv.sessionId === selectedId}
                  onClick={() => handleSelectConv(conv.sessionId)}
                  onMarkRead={markAsRead}
                  presenceViewers={viewersBySession[conv.sessionId]}
                  mentionCount={mentionUnread[conv.sessionId] ?? 0}
                />
              ))}
              {isLoadingMore && (
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0", minHeight: 44 }}>
                  <Loader2 style={{ width: 20, height: 20, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
                </div>
              )}
              {!nextCursor && filtered.length > 0 && (
                <p style={{ textAlign: "center", fontSize: 12, color: "var(--app-text-placeholder)", padding: "12px 0", margin: 0 }}>
                  모든 상담을 불러왔습니다
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 중앙: 대화 영역 */}
      {selectedConv ? (
        <ChatArea key={selectedConv.sessionId} conv={selectedConv} onRefresh={fetchSelected} onExtractToQuote={handleExtractToQuote} presenceViewers={othersInSession} onTypingChange={setTyping} />
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--app-bg)" }}>
          <div style={{ textAlign: "center" }}>
            <Inbox style={{ width: 48, height: 48, margin: "0 auto 12px", color: "var(--app-text-placeholder)" }} />
            <p style={{ fontSize: 15, color: "var(--app-text-tertiary)", fontWeight: 500, margin: 0 }}>상담을 선택해주세요</p>
            <p style={{ fontSize: 13, color: "var(--app-text-placeholder)", marginTop: 4, margin: "4px 0 0" }}>왼쪽 목록에서 상담을 클릭하세요</p>
          </div>
        </div>
      )}

      {/* 우측: 고객 정보 */}
      {selectedConv && (
        <CustomerPanel conv={selectedConv} onRefresh={fetchSelected} onDelete={() => { setSelectedId(null); fetchList(); }} />
      )}

      {/* 마우스 따라다니는 어시스턴트 */}
      <AssistantBuddy conv={selectedConv ?? null} />
    </div>
  );
}
