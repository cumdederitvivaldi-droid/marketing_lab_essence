"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCounselorPresence } from "@/lib/hooks/useCounselorPresence";
import { FilterSidebar, ChatList, MessagePanel, ToolPanel, STATE_TABS } from "@/components/channeltalk";
import type { CTChat, CTMessage, BackofficeSummary, AiDraft } from "@/components/channeltalk";

// 차량등록 감지 패턴 — "주차등록"은 미수거 맥락에서도 쓰여 오탐 발생하므로 제외
const VEHICLE_PATTERN = /차량?\s*번호|차번호?|차량\s*등록|배차\s*번호?|몇\s*번\s*차|무슨\s*차|수거\s*차량?|방문\s*차량?|차량?\s*알려|차량?\s*확인|차\s*몇\s*번|번호판|차량\s*조회|차\s*뭐\s*타|어떤\s*차|기사.*(성함|연락처|번호)|차량\s*번호\s*요청|주차\s*번호|주차\s*안내/;

// ─── 리사이즈 가능한 패널 너비 (localStorage 키) ───
const STORAGE_KEY = "ct-panel-widths";
const DEFAULT_WIDTHS = { sidebar: 220, chatList: 340, toolPanel: 380 };
const MIN_WIDTHS = { sidebar: 160, chatList: 260, toolPanel: 280 };
const MAX_WIDTHS = { sidebar: 360, chatList: 520, toolPanel: 560 };

function loadWidths() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sidebar: Math.max(MIN_WIDTHS.sidebar, Math.min(MAX_WIDTHS.sidebar, parsed.sidebar ?? DEFAULT_WIDTHS.sidebar)),
        chatList: Math.max(MIN_WIDTHS.chatList, Math.min(MAX_WIDTHS.chatList, parsed.chatList ?? DEFAULT_WIDTHS.chatList)),
        toolPanel: Math.max(MIN_WIDTHS.toolPanel, Math.min(MAX_WIDTHS.toolPanel, parsed.toolPanel ?? DEFAULT_WIDTHS.toolPanel)),
      };
    }
  } catch {}
  return { ...DEFAULT_WIDTHS };
}

function Resizer({ onDragStart, onDrag, onDragEnd }: {
  onDragStart?: () => void;
  onDrag: (delta: number) => void;
  onDragEnd?: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    onDragStart?.();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) => onDrag(ev.clientX - startX);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDragging(false);
      onDragEnd?.();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [onDrag, onDragStart, onDragEnd]);

  const active = hovering || dragging;

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        width: 5, flexShrink: 0, cursor: "col-resize",
        backgroundColor: "transparent", position: "relative", zIndex: 10,
      }}
    >
      <div style={{
        position: "absolute", top: 0, bottom: 0, left: 1, width: active ? 3 : 1,
        backgroundColor: active ? "var(--app-accent, #3b82f6)" : "var(--app-border)",
        transition: "width 0.15s, background-color 0.15s",
        borderRadius: active ? 2 : 0,
      }} />
    </div>
  );
}

// 상담사 이름 → 배정 이름 매핑 (테디는 라이언으로 배정)
// 로그인 이름 → 채널톡 배정 매니저 매핑
// 김원빈(테디): 답변은 테디로 하되, 배정은 라이언으로
// 나머지: 자기 채널톡 닉네임으로 배정
const ASSIGN_NAME_MAP: Record<string, string> = {
  "김원빈": "라이언",
  "박소리": "골드쉽",
  "김진유": "메리다",
  "신인섭": "토미",
  "문환희": "조이",
};

// 채널톡 매니저 표시명 → 로그인 계정명 (알림 수신자 매칭용)
// ASSIGN_NAME_MAP은 배정용이라 매니저명과 다를 수 있으므로 별도 정의
const NICKNAME_TO_LOGIN: Record<string, string> = {
  "라이언": "김원빈",   // 라이언 = 김원빈 (배정명)
  "테디": "김원빈",     // 테디 = 김원빈 (채널톡 닉네임)
  "골드쉽": "박소리",
  "메리다": "김진유",
  "토미": "신인섭",
  "조이": "문환희",
};

export default function ChannelTalkPage() {
  const { user } = useAuth();
  const [chats, setChats] = useState<CTChat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 상담사 실시간 Presence (채널톡)
  const { othersInSession, viewersBySession, setTyping } = useCounselorPresence(selectedId, "presence:channeltalk");
  const [messages, setMessages] = useState<CTMessage[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);

  // 매니저 목록 캐시 (이름→ID)
  const managersRef = useRef<Map<string, string> | null>(null);

  // 전송한 메시지의 원본 rich text 보존 (채널톡 API가 <b> 태그를 제거할 수 있으므로)
  // key: plainText(태그 제거), value: 원본 텍스트(태그 포함)
  const sentRichTextsRef = useRef<Map<string, string>>(new Map());

  // 매니저 아바타 맵 (이름 → avatarUrl)
  const [managerAvatars, setManagerAvatars] = useState<Record<string, string>>({});

  // 필터 상태
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  // ─── 패널 리사이즈 ───
  const [panelWidths, setPanelWidths] = useState(DEFAULT_WIDTHS);
  const dragBase = useRef({ ...DEFAULT_WIDTHS });

  useEffect(() => {
    const loaded = loadWidths();
    setPanelWidths(loaded);
    dragBase.current = { ...loaded };
  }, []);

  const snapDragBase = useCallback(() => {
    setPanelWidths(prev => { dragBase.current = { ...prev }; return prev; });
  }, []);

  const persistWidths = useCallback(() => {
    setPanelWidths(prev => { localStorage.setItem(STORAGE_KEY, JSON.stringify(prev)); return prev; });
  }, []);

  const handleSidebarDrag = useCallback((delta: number) => {
    const w = Math.max(MIN_WIDTHS.sidebar, Math.min(MAX_WIDTHS.sidebar, dragBase.current.sidebar + delta));
    setPanelWidths(prev => ({ ...prev, sidebar: w }));
  }, []);

  const handleChatListDrag = useCallback((delta: number) => {
    const w = Math.max(MIN_WIDTHS.chatList, Math.min(MAX_WIDTHS.chatList, dragBase.current.chatList + delta));
    setPanelWidths(prev => ({ ...prev, chatList: w }));
  }, []);

  const handleToolPanelDrag = useCallback((delta: number) => {
    const w = Math.max(MIN_WIDTHS.toolPanel, Math.min(MAX_WIDTHS.toolPanel, dragBase.current.toolPanel - delta));
    setPanelWidths(prev => ({ ...prev, toolPanel: w }));
  }, []);

  // 오른쪽 도구 패널
  const [toolPanelOpen, setToolPanelOpen] = useState(true);
  const [backofficeSummary, setBackofficeSummary] = useState<BackofficeSummary | null>(null);

  // ─── AI 답변 사전 생성 (안 읽은 채팅용) ───
  // 키: "chatId:lastMessageAt" → 새 메시지 도착 시 자동으로 재생성
  const aiDraftCacheRef = useRef<Map<string, AiDraft>>(new Map());
  const aiDraftPendingRef = useRef<Set<string>>(new Set());
  const [aiDraftVersion, setAiDraftVersion] = useState(0); // re-render trigger
  // 백오피스 circuit breaker — 연속 3회 실패 시 5분 동안 호출 우회 (504 폭주 방지)
  const backofficeBreakerRef = useRef({ failCount: 0, breakUntil: 0 });

  // 자동 상담종료 on/off
  const [autoClose, setAutoClose] = useState(false);

  // 자동배차 on/off
  const [autoVehicle, setAutoVehicle] = useState(true);

  // 차량등록 자동 처리 — chatId:lastMessageAt으로 추적 (새 메시지 시 재체크)
  const vehicleProcessedRef = useRef<Set<string>>(new Set());

  // ─── 자동배차 설정 로드/저장 ───

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings?.channeltalk_auto_close !== undefined) {
          setAutoClose(d.settings.channeltalk_auto_close === "true" || d.settings.channeltalk_auto_close === true);
        }
        if (d.settings?.channeltalk_auto_vehicle !== undefined) {
          setAutoVehicle(d.settings.channeltalk_auto_vehicle === "true" || d.settings.channeltalk_auto_vehicle === true);
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleAutoClose = useCallback((v: boolean) => {
    setAutoClose(v);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "channeltalk_auto_close", value: String(v) }),
    }).catch(() => {});
  }, []);

  const handleToggleAutoVehicle = useCallback((v: boolean) => {
    setAutoVehicle(v);
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "channeltalk_auto_vehicle", value: String(v) }),
    }).catch(() => {});
  }, []);

  // ─── 채팅 목록 조회 ───

  const fetchChats = useCallback(async () => {
    try {
      const state = STATE_TABS[activeTab].state;
      const res = await fetch(`/api/channeltalk/chats?state=${state}`);
      if (!res.ok) throw new Error("목록 조회 실패");
      const data = await res.json();
      setChats(data.chats ?? []);
      // 매니저 아바타 맵 갱신
      if (data.managers) {
        const avatars: Record<string, string> = {};
        for (const m of data.managers) {
          if (m.avatarUrl) avatars[m.name] = m.avatarUrl;
        }
        setManagerAvatars(avatars);
      }
    } catch {
      toast.error("채널톡 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // 탭 전환 시 초기 로딩
  const initialChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    // URL에서 chatId 파라미터 확인 (알림 클릭 등)
    if (typeof window !== "undefined" && !initialChatIdRef.current) {
      const params = new URLSearchParams(window.location.search);
      const chatId = params.get("chatId");
      if (chatId) initialChatIdRef.current = chatId;
    }
    setLoading(true);
    setSelectedId(null);
    setMessages([]);
    fetchChats().then(() => {
      // 초기 chatId가 있으면 자동 선택
      if (initialChatIdRef.current) {
        setSelectedId(initialChatIdRef.current);
        initialChatIdRef.current = null;
        // URL에서 chatId 제거 (깔끔하게)
        window.history.replaceState({}, "", "/channeltalk");
      }
    });
  }, [fetchChats]);

  // 채팅 목록 백그라운드 폴링 (10초, 깜빡임 없음)
  useEffect(() => {
    const timer = setInterval(() => {
      const state = STATE_TABS[activeTab].state;
      fetch(`/api/channeltalk/chats?state=${state}`)
        .then((r) => r.json())
        .then((d) => {
          setChats(d.chats ?? []);
          if (d.managers) {
            const avatars: Record<string, string> = {};
            for (const m of d.managers) { if (m.avatarUrl) avatars[m.name] = m.avatarUrl; }
            setManagerAvatars(avatars);
          }
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [activeTab]);

  // ─── 차량등록 자동 감지 & 처리 (리스트 단, 전체 메시지 확인) ───

  // 다른 문의 카테고리 워크플로우 (이것을 선택한 고객은 차량등록이 아님)
  const NON_VEHICLE_WF = /출입|미수거|수거.*문제|결제|구독|배송|봉투|쿠폰|앱|오류|탈퇴|환불|취소|주문.*변경|해지/;

  const checkAndProcessVehicle = useCallback(async (chat: CTChat) => {
    try {
      // 1. 전체 메시지 조회
      const res = await fetch(`/api/channeltalk/chats/${chat.id}/messages`);
      if (!res.ok) return;
      const data = await res.json();
      const msgs: CTMessage[] = data.messages ?? [];

      // 2. 실제 매니저(상담사)가 답변했으면 스킵
      const COUNSELORS = ["메리다", "조이", "테디", "라이언"];
      const hasRealManagerReply = msgs.some(
        (m) => m.role === "manager" && m.senderName && COUNSELORS.includes(m.senderName)
      );
      if (hasRealManagerReply) return;

      // 3. 워크플로우에서 다른 카테고리를 선택했으면 스킵 (출입실패, 미수거 등)
      const wfButtons = msgs.filter((m) => m.isWorkflowButton);
      if (wfButtons.some((m) => NON_VEHICLE_WF.test(m.content || ""))) return;

      // 4. 차량등록 의도 확인: 워크플로우 버튼, 태그, 또는 고객 텍스트 메시지
      const hasVehicleWf = wfButtons.some((m) => VEHICLE_PATTERN.test(m.content || ""));
      const hasVehicleTag = chat.tags.includes("차량등록");
      const userTextMsgs = msgs.filter((m) => m.role === "user" && !m.isWorkflowButton);
      // 텍스트에서 차량 키워드가 있되, 같은 메시지에 불만/다른 문의 맥락이 없어야 함
      // 단, "차량번호 알수있을까요?" 같은 명확한 차량 요청이 있으면 불만 맥락 무시
      const COMPLAINT_CONTEXT = /했는데|했거든|했지만|했음에도|했어도|안[ ]?[돼되]|못[ ]?[했해]|왜|문제|실패|누락|안 ?와|안 ?옴|미수거|출입/;
      // 명확한 차량번호 요청 표현 — 이게 있으면 불만 맥락이 있어도 차량등록 의도
      const VEHICLE_REQUEST = /차량?\s*번호.*(?:알|알려|확인|부탁|줘|주세요|가능|필요)|(?:알|알려|확인).*차량?\s*번호|방문\s*차량.*(?:등록|필요|알)|기사.*(?:성함|연락처|번호).*(?:알|확인|부탁|줘|주세요)/;
      const hasVehicleText = userTextMsgs.some((m) => {
        const txt = m.content || "";
        if (!VEHICLE_PATTERN.test(txt)) return false;
        // 명확한 차량 요청이 있으면 → 불만 맥락 무시하고 차량등록 의도로 판단
        if (VEHICLE_REQUEST.test(txt)) return true;
        // 차량 키워드 + 불만 맥락이 같은 메시지에 있으면 → 차량등록 의도 아님
        if (COMPLAINT_CONTEXT.test(txt)) return false;
        return true;
      });

      if (!hasVehicleWf && !hasVehicleTag && !hasVehicleText) return;

      // 5. 확정 — 자동 처리
      const autoRes = await fetch(`/api/channeltalk/chats/${chat.id}/vehicle-auto`, { method: "POST" });
      const autoData = await autoRes.json();
      if (autoData.success) {
        console.log(`[CT] 차량등록 자동 처리: ${chat.userName || chat.id}`);
        setChats((prev) => prev.map((c) =>
          c.id === chat.id ? { ...c, tags: [...c.tags, "차량등록"] } : c
        ));
      } else if (typeof autoData.error === "string" && autoData.error.includes("운영 시간이 아닙니다")) {
        // 운영시간 외 — expected 동작, 로그 안 남김
      } else {
        console.error("[vehicle-auto] failed:", autoData.error);
      }
    } catch (err) {
      console.error("[vehicle-auto] check error:", err);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 0 || !autoVehicle) return; // opened 탭 + 자동배차 ON일 때만
    for (const chat of chats) {
      // chatId + lastMessageAt으로 추적 → 새 메시지가 오면 다시 체크
      const key = `${chat.id}:${chat.lastMessageAt}`;
      if (vehicleProcessedRef.current.has(key)) continue;
      vehicleProcessedRef.current.add(key);
      // 이미 누군가에게 배정됨 → 스킵
      if (chat.assignee) continue;
      if (chat.lastMessagePersonType === "manager") continue;
      // 미배정 + 매니저 미답변 → 전체 메시지 확인 (차량등록 여부 판단)
      checkAndProcessVehicle(chat);
    }
  }, [chats, activeTab, autoVehicle, checkAndProcessVehicle]);

  // ─── AI 답변 사전 생성 (안 읽은 채팅: 마지막 메시지가 고객인 경우) ───

  // 캐시 키: chatId:lastMessageAt → 새 메시지가 오면 자동 재생성
  const draftCacheKey = (chatId: string, lastMessageAt: number) => `${chatId}:${lastMessageAt}`;

  const generateAiDraft = useCallback(async (chat: CTChat) => {
    const cacheKey = draftCacheKey(chat.id, chat.lastMessageAt);
    if (aiDraftCacheRef.current.has(cacheKey)) return;
    if (aiDraftPendingRef.current.has(chat.id)) return;
    aiDraftPendingRef.current.add(chat.id);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000); // 25초 타임아웃

    try {
      // 1. 메시지 조회
      const msgRes = await fetch(`/api/channeltalk/chats/${chat.id}/messages`, { signal: ctrl.signal });
      if (!msgRes.ok) return;
      const msgData = await msgRes.json();
      const msgs: CTMessage[] = msgData.messages ?? [];
      if (msgs.length === 0) return;

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.role !== "user") return;

      // 차량등록 워크플로우만 있으면 스킵
      const userMsgs = msgs.filter((m) => m.role === "user");
      const hasVehicleWf = userMsgs.some(
        (m) => m.isWorkflowButton && VEHICLE_PATTERN.test(m.content || "")
      );
      const lastUserText = [...msgs].reverse().find(
        (m) => m.role === "user" && !m.isWorkflowButton && m.content?.trim()
      );
      if (!lastUserText && hasVehicleWf) return;

      const BOT_CONFIRM = /^(네|넵|네네|ㅇㅇ|확인)[\s.!]*$/;
      const lastText = (lastUserText?.content || "").trim();
      const isOnlyBotConfirm = lastUserText && BOT_CONFIRM.test(lastText);

      const SKIP_WF = /매니저\s*연결|일반\s*고객|처음이|기존\s*고객|사업자|아니요/;
      const meaningfulWf = [...userMsgs].reverse().find(
        (m) => m.isWorkflowButton && !SKIP_WF.test(m.content || "") && !VEHICLE_PATTERN.test(m.content || "")
      );

      // 마무리 인사 감지
      const closingPat = /^(네\s*)?(감사합니다|감사해요|고마워요|고맙습니다|알겠습니다|알겠어요|확인했습니다|확인했어요)[\s~!.)]*$/i;
      if (lastText && !isOnlyBotConfirm && closingPat.test(lastText)) {
        aiDraftCacheRef.current.set(cacheKey, {
          answer: "감사합니다!\n\n남은 하루도 평안하고 행복하게 보내시기 바라며,\n추가 문의가 있으시다면 언제든지 문의 주시기 바랍니다 :)",
          generatedAt: Date.now(),
        });
        setAiDraftVersion((v) => v + 1);
        return;
      }

      // 워크플로우만 있고 텍스트 없으면 안내 문구
      if ((!lastUserText || isOnlyBotConfirm) && !meaningfulWf) {
        aiDraftCacheRef.current.set(cacheKey, {
          answer: "안녕하세요, 커버링 입니다.\n문의 내용을 보다 자세하게 작성해 주시면 확인 후 안내드리겠습니다.",
          generatedAt: Date.now(),
        });
        setAiDraftVersion((v) => v + 1);
        return;
      }

      // 연속 고객 메시지 합치기
      const lastManagerIdx = msgs.reduce((idx, m, i) => {
        if (m.role === "manager" && m.senderName && m.senderName !== "커버링") return i;
        return idx;
      }, -1);
      const consecutiveUserMsgs = msgs
        .slice(lastManagerIdx + 1)
        .filter((m) => m.role === "user" && !m.isWorkflowButton && m.content?.trim())
        .map((m) => m.content!.trim());
      const combinedMsg = consecutiveUserMsgs.length > 1 ? consecutiveUserMsgs.join("\n") : null;

      const aiMessage = (isOnlyBotConfirm && meaningfulWf?.content)
        ? meaningfulWf.content
        : (combinedMsg || lastUserText?.content || meaningfulWf?.content || "");

      if (!aiMessage) return;

      // 2. AI suggest 호출
      const recentTurns = msgs
        .filter((m) => m.role === "user" || m.role === "manager")
        .filter((m) => m.content)
        .slice(-6)
        .map((m) => ({
          role: (m.role === "user" ? "user" : "manager") as "user" | "manager",
          text: m.content || "",
          senderName: m.senderName || undefined,
        }));

      // 백오피스 + 배송(두발히어로) 병렬 조회 — suggest 와 분리된 짧은 타임아웃 (8s).
      // 백오피스 504 가 25s 동안 막히면 ctrl.abort 가 suggest 까지 죽이는 회귀 방지.
      // Circuit breaker: 백오피스 연속 3회 실패 시 5분 동안 우회.
      let customerContext: Record<string, unknown> | undefined;
      if (chat.userPhone) {
        const customerCtrl = new AbortController();
        const customerTimer = setTimeout(() => customerCtrl.abort(), 8000);
        try {
          const phone = chat.userPhone.replace(/^\+82/, "0");
          const breaker = backofficeBreakerRef.current;
          const skipBackoffice = Date.now() < breaker.breakUntil;
          const [boRes, dhRes] = await Promise.all([
            skipBackoffice
              ? Promise.resolve(null)
              : fetch("/api/backoffice/lookup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ phone }),
                  signal: customerCtrl.signal,
                }).catch(() => null),
            fetch(`/api/dhero/deliveries?phone=${encodeURIComponent(phone)}&days=14`, {
              signal: customerCtrl.signal,
            }).catch(() => null),
          ]);
          clearTimeout(customerTimer);
          // breaker 카운트 갱신 — boRes 가 ok 면 reset, 아니면 increment
          if (!skipBackoffice) {
            if (boRes?.ok) {
              breaker.failCount = 0;
              breaker.breakUntil = 0;
            } else {
              breaker.failCount += 1;
              if (breaker.failCount >= 3) {
                breaker.breakUntil = Date.now() + 5 * 60_000;
                console.warn("[AI pre-gen] backoffice 연속 실패 → 5분 우회");
              }
            }
          }

          // 백오피스 데이터
          if (boRes?.ok) {
            const boData = await boRes.json();
            const u = boData.data?.userInfo;
            const orders = boData.data?.orders ?? [];
            const activeOrders = orders
              .filter((o: { orderStatus?: string }) => !o.orderStatus?.includes("완료") && !o.orderStatus?.includes("취소"))
              .slice(0, 3)
              .map((o: { orderId: string; orderName: string; orderStatus: string; pickupDate: string; address: string }) => ({
                orderId: o.orderId, orderName: o.orderName, status: o.orderStatus, pickupDate: o.pickupDate, address: o.address,
              }));
            if (u?.name) {
              customerContext = {
                name: u.name, grade: u.grade, isSubscriber: u.isSubscriber,
                subscriptionDate: u.subscriptionDate, address: u.address,
                totalOrders: u.totalOrders, validOrders: u.validOrders,
                recentOrders: u.recentOrders?.slice(0, 5).map((o: { date: string; orderName: string; status: string; weight: string }) => ({
                  date: o.date, orderName: o.orderName, status: o.status, weight: o.weight,
                })),
                ...(activeOrders.length > 0 ? { activeOrders } : {}),
              };
            }
          }

          // 배송(두발히어로) 데이터
          if (dhRes?.ok) {
            const dhData = await dhRes.json();
            const deliveries = (dhData.deliveries ?? []).slice(0, 5);
            if (deliveries.length > 0) {
              if (!customerContext) customerContext = {};
              customerContext.deliveries = deliveries.map((d: { bookId: string; status: number; receivedDate: string | null; deliveredDate: string | null; receiverAddress: string | null; deliveryAllocatedDate: string | null }) => ({
                bookId: d.bookId,
                status: d.status,
                receivedDate: d.receivedDate,
                deliveredDate: d.deliveredDate,
                address: d.receiverAddress,
                allocatedDate: d.deliveryAllocatedDate,
              }));
            }
          }
        } catch { /* 타임아웃/abort 무시 — customerContext 없이 suggest 진행 */ } finally {
          clearTimeout(customerTimer);
        }
      }

      const suggestRes = await fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          message: aiMessage,
          tags: chat.tags,
          recentTurns,
          previousCategories: [],
          mode: "combined",
          ...(customerContext ? { customerContext } : {}),
        }),
        signal: ctrl.signal,
      });

      if (!suggestRes.ok) return;
      const data = await suggestRes.json();

      // 답변 불가 → 사유와 함께 캐시
      if (data.canAnswer === false) {
        aiDraftCacheRef.current.set(cacheKey, {
          answer: "",
          category: data.classifiedCategory,
          canAnswer: false,
          reason: data.reason || "상담사가 직접 답변해야 합니다",
          generatedAt: Date.now(),
        });
        setAiDraftVersion((v) => v + 1);
        return;
      }

      let answerText = "";
      if (data.answer) {
        answerText = data.answer;
      } else if (data.suggestions?.length) {
        answerText = data.suggestions[0].answerText || "";
      }

      if (answerText) {
        aiDraftCacheRef.current.set(cacheKey, {
          answer: answerText,
          category: data.classifiedCategory,
          canAnswer: true,
          generatedAt: Date.now(),
        });
        setAiDraftVersion((v) => v + 1);
      }
    } catch (err) {
      // 타임아웃/abort는 무시, 그 외만 로그
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.warn("[AI pre-gen] skip", chat.id);
    } finally {
      clearTimeout(timer);
      aiDraftPendingRef.current.delete(chat.id);
    }
  }, []);

  // 채팅 목록이 갱신될 때마다 안 읽은 채팅에 대해 AI 답변 사전 생성
  useEffect(() => {
    if (activeTab !== 0) return; // opened 탭만

    const unreadChats = chats.filter((c) => {
      if (c.lastMessagePersonType !== "user") return false;
      const cacheKey = draftCacheKey(c.id, c.lastMessageAt);
      return !aiDraftCacheRef.current.has(cacheKey) && !aiDraftPendingRef.current.has(c.id);
    });

    if (unreadChats.length === 0) return;

    // 동시 2개씩 처리
    let idx = 0;
    const processNext = () => {
      if (idx >= unreadChats.length) return;
      const chat = unreadChats[idx++];
      generateAiDraft(chat).then(processNext);
    };
    processNext();
    processNext();
  }, [chats, activeTab, generateAiDraft]);

  // ─── 백오피스 사전 조회 (대기 중 채팅의 고객 정보를 미리 캐싱) ───
  const boPrefetchedRef = useRef(new Set<string>());
  useEffect(() => {
    if (activeTab !== 0) return;

    const chatsToPrefetch = chats.filter((c) => {
      if (!c.userPhone) return false;
      const phone = c.userPhone.replace(/^\+82/, "0");
      if (boPrefetchedRef.current.has(phone)) return false;
      return true;
    });

    if (chatsToPrefetch.length === 0) return;

    // 1개씩 순차 처리 (스크래퍼 과부하 방지, 캐시 히트 시 즉시 반환)
    // Circuit breaker 가 열려 있으면 prefetch 도 우회 (504 폭주 방지).
    let idx = 0;
    const prefetchNext = async () => {
      if (idx >= chatsToPrefetch.length) return;
      const breaker = backofficeBreakerRef.current;
      if (Date.now() < breaker.breakUntil) return; // 우회 — 5분 후 자동 재개
      const chat = chatsToPrefetch[idx++];
      const phone = chat.userPhone!.replace(/^\+82/, "0");
      boPrefetchedRef.current.add(phone);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch("/api/backoffice/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
          signal: ctrl.signal,
        });
        if (res.ok) {
          breaker.failCount = 0;
          breaker.breakUntil = 0;
        } else {
          breaker.failCount += 1;
          if (breaker.failCount >= 3) {
            breaker.breakUntil = Date.now() + 5 * 60_000;
            console.warn("[BO prefetch] 연속 실패 → 5분 우회");
          }
        }
      } catch { /* ignore */ } finally {
        clearTimeout(timer);
      }
      prefetchNext();
    };
    prefetchNext();
  }, [chats, activeTab]);

  // ─── 메시지 조회 ───

  const fetchMessages = useCallback(async (chatId: string, silent = false) => {
    if (!silent) setMsgLoading(true);
    try {
      const res = await fetch(`/api/channeltalk/chats/${chatId}/messages`);
      if (!res.ok) throw new Error("메시지 조회 실패");
      const data = await res.json();
      const msgs: CTMessage[] = data.messages ?? [];

      // 채널톡 API가 <b>/<i> 태그를 제거한 경우 원본 복원
      const richMap = sentRichTextsRef.current;
      if (richMap.size > 0) {
        for (const msg of msgs) {
          if (msg.role !== "user" && !/<[bi]>/.test(msg.content)) {
            const rich = richMap.get(msg.content);
            if (rich) msg.content = rich;
          }
        }
      }

      setMessages(msgs);
    } catch {
      if (!silent) toast.error("메시지 조회 실패");
    } finally {
      if (!silent) setMsgLoading(false);
    }
  }, []);

  // 선택된 채팅 초기 로드 + 백오피스 요약 초기화
  useEffect(() => {
    setBackofficeSummary(null);
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  // 선택된 채팅 메시지 백그라운드 폴링 (5초, 깜빡임 없음)
  useEffect(() => {
    if (!selectedId) return;
    const timer = setInterval(() => {
      fetch(`/api/channeltalk/chats/${selectedId}/messages`)
        .then((r) => r.json())
        .then((d) => {
          const msgs: CTMessage[] = d.messages ?? [];
          const richMap = sentRichTextsRef.current;
          if (richMap.size > 0) {
            for (const msg of msgs) {
              if (msg.role !== "user" && !/<[bi]>/.test(msg.content)) {
                const rich = richMap.get(msg.content);
                if (rich) msg.content = rich;
              }
            }
          }
          setMessages(msgs);
        })
        .catch(() => {});
    }, 5_000);
    return () => clearInterval(timer);
  }, [selectedId]);

  // ─── 메시지 전송 ───

  const handleSend = async (message: string, options?: { isInternal?: boolean; mentionedManagerIds?: string[]; mentionedNames?: string[]; replyKind?: "ai_auto" | "ai_assist" | "human"; draftCharOverlap?: number }) => {
    if (!selectedId) return;
    const res = await fetch(`/api/channeltalk/chats/${selectedId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        actAsManager: !options?.isInternal,
        isInternal: options?.isInternal ?? false,
        ...(options?.mentionedManagerIds?.length ? { mentionedManagerIds: options.mentionedManagerIds } : {}),
        ...(options?.replyKind ? { replyKind: options.replyKind, draftCharOverlap: options.draftCharOverlap } : {}),
      }),
    });
    if (!res.ok) throw new Error("전송 실패");

    // 전송한 원본 텍스트 저장 (rich text 태그 보존용)
    if (/<[bi]>/.test(message)) {
      const plain = message.replace(/<\/?[bi]>/g, "");
      sentRichTextsRef.current.set(plain, message);
    }

    // 멘션된 상담사에게 알림 생성 (채널톡 닉네임 → 로그인명 변환)
    if (options?.mentionedNames?.length) {
      const recipientLogins = options.mentionedNames.map(
        (nick) => NICKNAME_TO_LOGIN[nick] ?? nick
      );
      fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: recipientLogins,
          chatId: selectedId,
          messagePreview: message.replace(/<[^>]+>/g, "").slice(0, 100),
          type: "mention",
        }),
      }).catch(() => {});
    }

    // 담당자 없음 + 고객 응대 메시지 → 현재 사용자로 자동 배정
    if (!options?.isInternal && user?.name) {
      const chat = chats.find(c => c.id === selectedId);
      console.log("[CT] autoAssign check:", { chatId: selectedId, assignee: chat?.assignee, userName: user.name, assignName: ASSIGN_NAME_MAP[user.name] ?? user.name });
      if (chat && !chat.assignee) {
        autoAssign(selectedId, user.name);
      }
    }

    await fetchMessages(selectedId, true);
  };

  // ─── 자동 배정 (fire-and-forget) ───

  const autoAssign = useCallback(async (chatId: string, userName: string) => {
    try {
      // 매니저 목록 캐시
      if (!managersRef.current) {
        const res = await fetch(`/api/channeltalk/chats/${chatId}/assign`);
        const data = await res.json();
        const map = new Map<string, string>();
        for (const m of data.managers ?? []) map.set(m.name, m.id);
        managersRef.current = map;
      }

      const assignName = ASSIGN_NAME_MAP[userName] ?? userName;
      const managerId = managersRef.current.get(assignName);
      console.log("[CT] autoAssign →", { userName, assignName, managerId, availableManagers: [...managersRef.current.keys()] });
      if (!managerId) {
        console.warn(`[CT] 자동배정 실패: 매니저 "${assignName}" 없음`);
        return;
      }

      const assignRes = await fetch(`/api/channeltalk/chats/${chatId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId }),
      });
      const assignData = await assignRes.json();
      console.log("[CT] autoAssign result:", assignData);

      // 로컬 상태 즉시 반영
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, assignee: assignName } : c));
      console.log(`[CT] ${assignName}에게 자동 배정됨`);
    } catch (err) {
      console.error("[CT] autoAssign error:", err);
    }
  }, []);

  // ─── 이미지 업로드 ───

  const handleUploadImage = async (chatId: string, file: File, isInternal?: boolean) => {
    const formData = new FormData();
    formData.append("file", file);
    if (isInternal) formData.append("isInternal", "true");
    const res = await fetch(`/api/channeltalk/chats/${chatId}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("이미지 업로드 실패");
    await fetchMessages(chatId, true);
  };

  // 태그 변경 시 로컬 즉시 반영
  const handleTagsUpdate = useCallback((chatId: string, newTags: string[]) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, tags: newTags } : c));
  }, []);

  // 상담 종료 시 로컬에서 즉시 종료 표시 (목록에서 바로 사라지지 않음)
  const handleCloseChat = useCallback((chatId: string) => {
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, state: "closed" } : c));
  }, []);

  // ─── 일괄 작업 ───

  const handleBulkAction = useCallback(async (chatIds: string[], action: "message" | "close" | "snooze", message?: string) => {
    let successCount = 0;
    let failCount = 0;

    const processBatch = async (batch: string[]) => {
      await Promise.allSettled(batch.map(async (chatId) => {
        try {
          if (action === "message" && message) {
            await fetch(`/api/channeltalk/chats/${chatId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message, actAsManager: true }),
            });
          } else if (action === "close") {
            await fetch(`/api/channeltalk/chats/${chatId}/close`, { method: "POST" });
            const chat = chats.find((c) => c.id === chatId);
            fetch(`/api/channeltalk/chats/${chatId}/auto-tag`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messages: [], existingTags: chat?.tags ?? [] }),
            }).catch(() => {});
          } else if (action === "snooze") {
            await fetch(`/api/channeltalk/chats/${chatId}/snooze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ duration: "PT4H" }),
            });
          }
          successCount++;
        } catch {
          failCount++;
        }
      }));
    };

    // 5개씩 병렬 처리 (API rate limit 고려)
    for (let i = 0; i < chatIds.length; i += 5) {
      await processBatch(chatIds.slice(i, i + 5));
    }

    const actionLabel = action === "message" ? "메시지 발송" : action === "close" ? "상담종료" : "보류";
    if (successCount > 0) toast.success(`${actionLabel} ${successCount}건 완료`);
    if (failCount > 0) toast.error(`${actionLabel} ${failCount}건 실패`);

    fetchChats();
  }, [chats, fetchChats]);

  const selectedChat = chats.find((c) => c.id === selectedId) ?? null;

  // aiDraftVersion를 읽어서 캐시 갱신 시 re-render 트리거
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _draftVer = aiDraftVersion;
  const preloadedDraft = selectedChat
    ? (aiDraftCacheRef.current.get(draftCacheKey(selectedChat.id, selectedChat.lastMessageAt)) ?? null)
    : null;

  return (
    <div style={{ display: "flex", height: "100vh", backgroundColor: "var(--app-bg)" }}>
      {/* 사이드바 */}
      <div style={{ width: panelWidths.sidebar, flexShrink: 0, overflow: "hidden", borderRight: "none" }}>
        <FilterSidebar
          chats={chats}
          filterAssignee={filterAssignee}
          filterTag={filterTag}
          onFilterAssignee={setFilterAssignee}
          onFilterTag={setFilterTag}
          onRefresh={() => { setLoading(true); fetchChats(); }}
          autoClose={autoClose}
          onToggleAutoClose={handleToggleAutoClose}
          autoVehicle={autoVehicle}
          onToggleAutoVehicle={handleToggleAutoVehicle}
          currentUserName={user?.name}
          managerAvatars={managerAvatars}
        />
      </div>
      <Resizer onDragStart={snapDragBase} onDrag={handleSidebarDrag} onDragEnd={persistWidths} />

      {/* 채팅 목록 */}
      <div style={{ width: panelWidths.chatList, flexShrink: 0, overflow: "hidden" }}>
        <ChatList
          chats={chats}
          selectedId={selectedId}
          activeTab={activeTab}
          search={search}
          loading={loading}
          filterAssignee={filterAssignee}
          filterTag={filterTag}
          onSelectChat={setSelectedId}
          onChangeTab={setActiveTab}
          onChangeSearch={setSearch}
          onClearAssignee={() => setFilterAssignee(null)}
          onClearTag={() => setFilterTag(null)}
          onBulkAction={handleBulkAction}
          viewersByChat={viewersBySession}
        />
      </div>
      <Resizer onDragStart={snapDragBase} onDrag={handleChatListDrag} onDragEnd={persistWidths} />

      {/* 메시지 패널 */}
      <MessagePanel
        selectedChat={selectedChat}
        messages={messages}
        msgLoading={msgLoading}
        onSend={handleSend}
        onUploadImage={handleUploadImage}
        onAssign={fetchChats}
        onCloseChat={handleCloseChat}
        onTagsUpdate={handleTagsUpdate}
        onToggleToolPanel={() => setToolPanelOpen((v) => !v)}
        toolPanelOpen={toolPanelOpen}
        backofficeSummary={backofficeSummary}
        preloadedDraft={preloadedDraft}
        presenceViewers={othersInSession}
        onTypingChange={setTyping}
        onDeleteMessage={async (chatId, messageId) => {
          const res = await fetch(`/api/channeltalk/chats/${chatId}/delete-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "삭제 실패");
          toast.success("메시지가 삭제되었습니다");
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: "", isRemoved: true, files: undefined } : m));
        }}
      />

      {/* 도구 패널 */}
      {toolPanelOpen && <Resizer onDragStart={snapDragBase} onDrag={handleToolPanelDrag} onDragEnd={persistWidths} />}
      <div style={{ width: toolPanelOpen ? panelWidths.toolPanel : 0, flexShrink: 0, overflow: "hidden", borderLeft: toolPanelOpen ? "1px solid var(--app-border)" : undefined }}>
        <ToolPanel
          selectedChat={selectedChat}
          visible={toolPanelOpen}
          onClose={() => setToolPanelOpen(false)}
          onBackofficeLoaded={setBackofficeSummary}
        />
      </div>
    </div>
  );
}
