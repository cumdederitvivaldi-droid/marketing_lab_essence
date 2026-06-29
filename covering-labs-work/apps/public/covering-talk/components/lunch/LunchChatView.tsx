"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Loader2, RefreshCw, Search, ChevronRight,
  Edit3, X, Calendar, Send, CreditCard, Plus,
  MessageSquare, Package, Inbox, FileText, Check,
  Bot, User, ImageIcon, Users, ClipboardList, Calculator, CalendarCheck, Pencil, ChevronUp, ClipboardCopy, Paperclip, Link2, Trash2, Lock,
} from "lucide-react";
import { toast } from "sonner";
import type { LunchOrder, LunchOrderStatus, LunchSettlementType } from "@/lib/store/lunch-orders";
import type { LunchVendor } from "@/lib/store/lunch-vendors";
import { useCounselorPresence } from "@/lib/hooks/useCounselorPresence";
import { TaxInvoiceSection } from "@/components/lunch/TaxInvoiceSection";
import { MentionPicker } from "@/components/conversations/MentionPicker";
import { parseMentions } from "@/lib/utils/mention-parser";
import { useInternalMode } from "@/lib/hooks/useInternalMode";
import { useMentionNotifier } from "@/lib/hooks/useMentionNotifier";

type ViewMode = "chat" | "orders" | "invoices";

// 딥링크 URL 파라미터 (useSearchParams 대신 window 직접 읽기 — Suspense 회피)
function readUrlSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try { return new URLSearchParams(window.location.search).get("sessionId"); } catch { return null; }
}

const SETTLEMENT_LABELS: Record<LunchSettlementType, string> = {
  link_pay: "링크페이",
  monthly_invoice: "월말정산",
  tax_invoice: "세금계산서",
};

const STATUS_LABELS: Record<LunchOrderStatus, string> = {
  confirmed: "일정확정",
  payment_requested: "결제요청",
  completed: "정산완료",
  cancelled: "취소",
};

const STATUS_COLORS: Record<LunchOrderStatus, { bg: string; text: string }> = {
  confirmed: { bg: "#E8F7FF", text: "#1AA3FF" },
  payment_requested: { bg: "#FFFBEB", text: "#D97706" },
  completed: { bg: "#ECFDF5", text: "#059669" },
  cancelled: { bg: "#FFEBEE", text: "#C62828" },
};

/**
 * 런치 벤더가 보내는 "1. 수거 날짜 : ..." 템플릿 메시지를 createForm 필드로 파싱.
 * 템플릿 헤더(1~3번 필드) 3개 이상 포함 시 유효 → null 아니면 반환.
 */
type LunchParsedOrder = {
  date?: string;
  timeAmPm?: string;
  timeHour?: string;
  timeMinute?: string;
  boxCount?: string;
  pickupAddress?: string;
  ownerPhone?: string;
  siteContact?: string;
  vendorName?: string;
  notes?: string;
  settlementType?: LunchSettlementType;
};

function parseLunchOrderMessage(text: string): LunchParsedOrder | null {
  if (!text) return null;

  // 번호 라인을 번호별로 추출. "1.", "1)", "1 ." 모두 지원. 다음 번호 라인 전까지 이어지는 줄은 같은 항목에 이어붙임.
  const lines = text.split(/\r?\n/);
  const numLines: Record<number, string> = {};
  let curNum: number | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (curNum != null) numLines[curNum] = (numLines[curNum] ? numLines[curNum] + " " : "") + buf.join(" ").trim();
    buf = [];
  };
  for (const raw of lines) {
    const m = raw.match(/^\s*(\d{1,2})\s*[.)]\s*(.*)$/);
    if (m) {
      flush();
      curNum = parseInt(m[1], 10);
      buf = [m[2]];
    } else if (curNum != null) {
      const t = raw.trim();
      if (t) buf.push(t);
    }
  }
  flush();

  // 헤더 조건: 1~4번 모두 있고, 1번에 날짜 패턴 + 4번에 숫자(개수)가 있어야 유효 템플릿으로 본다.
  // 지원 형식: "YYYY년 M월 D일", "M월 D일", "YYYY-MM-DD", "YYYY/M/D", "YYYY.M.D"
  const hasDatePattern = (s: string) =>
    /(?:\d{1,4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일/.test(s) ||
    /\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(s);
  if (!(1 in numLines && 2 in numLines && 3 in numLines && 4 in numLines)) return null;
  if (!hasDatePattern(numLines[1])) return null;
  if (!/\d+/.test(numLines[4])) return null;

  const result: LunchParsedOrder = {};
  const pad = (n: string) => n.padStart(2, "0");

  // ── 각 번호 내용에서 라벨(있으면) 제거 ──
  const strip = (raw: string, labels: RegExp[]) => {
    let s = raw;
    for (const re of labels) s = s.replace(re, "");
    return s.trim();
  };

  // 1. 날짜
  {
    const s = strip(numLines[1], [/수거\s*날짜\s*[:：]\s*/]);
    const ymd = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    const md = !ymd && s.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    const iso = !ymd && !md && s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (ymd) result.date = `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}`;
    else if (iso) result.date = `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
    else if (md) {
      const y = new Date().getFullYear();
      result.date = `${y}-${pad(md[1])}-${pad(md[2])}`;
    }
  }

  // 2. 시간 — "약 13시 ~ 13시 30분", "오전 11시", "11:30", "야간" 등 지원
  {
    const s = strip(numLines[2], [/수거\s*시간\s*[:：]\s*/, /^약\s*/]);
    if (/야간|새벽|심야|(?:오후\s*)?(?:1[0-2])\s*시\s*이후|(?:10|11|12)\s*시\s*이후/.test(s)) {
      result.timeAmPm = "야간"; result.timeHour = ""; result.timeMinute = "";
    } else {
      const ampmMatch = s.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
      if (ampmMatch) {
        result.timeAmPm = ampmMatch[1];
        result.timeHour = ampmMatch[2];
        result.timeMinute = ampmMatch[3] ? pad(ampmMatch[3]) : "00";
      } else {
        // 24h: "13시 30분", "13시", "13:30"
        const h24 = s.match(/(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/) || s.match(/(\d{1,2}):(\d{2})/);
        if (h24) {
          let h = parseInt(h24[1]);
          const ampm = h >= 12 ? "오후" : "오전";
          if (h > 12) h -= 12;
          result.timeAmPm = ampm;
          result.timeHour = String(h || 12);
          result.timeMinute = h24[2] ? pad(h24[2]) : "00";
        }
      }
    }
  }

  // 3. 주소
  {
    const s = strip(numLines[3], [/수거\s*주소[^:：]*[:：]\s*/]);
    if (s) result.pickupAddress = s;
  }

  // 4. 개수
  {
    const boxMatch = numLines[4].match(/(\d+)/);
    if (boxMatch) result.boxCount = boxMatch[1];
  }

  // 5~9번은 번호 의미가 포맷마다 다를 수 있어 내용 키워드로 분류 + 5번은 신청자 연락처 우선 가정
  // 전화번호 추출 헬퍼
  const extractPhone = (raw: string): string | null => {
    const m = raw.match(/(0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}|\d{10,11})/);
    if (!m) return null;
    const d = m[1].replace(/[^\d]/g, "");
    return d.length >= 9 ? d : null;
  };

  // 5: 신청자 연락처 (일반적으로 가장 먼저 나오는 전화번호)
  if (5 in numLines) {
    const phone = extractPhone(numLines[5]);
    if (phone) result.ownerPhone = phone;
  }

  // 6~9 가변: 내용 기반 추론
  const laterNums = [6, 7, 8, 9, 10].filter((n) => n in numLines);
  const notesParts: string[] = [];
  for (const n of laterNums) {
    const raw = numLines[n];
    const clean = strip(raw, [
      /결제\s*방법\s*[:：]?\s*/,
      /현장\s*담당자\s*연락처\s*[:：]?\s*/,
      /상호명\s*[:：]?\s*/,
      /출입\s*방법[^:：]*[:：]?\s*/,
    ]);
    if (!clean) continue;

    // 결제방법
    if (!result.settlementType) {
      if (/카드/.test(clean)) { result.settlementType = "link_pay"; continue; }
      if (/계좌|이체|세금\s*계산서/.test(clean)) { result.settlementType = "tax_invoice"; continue; }
    }

    // 현장 담당자 — 번호 or "5번과 동일" / "상동"
    if (!result.siteContact) {
      if (/동일|위와\s*같|같음|상동/.test(clean)) {
        if (result.ownerPhone) { result.siteContact = result.ownerPhone; continue; }
      }
      const sitePhone = extractPhone(clean);
      if (sitePhone && sitePhone !== result.ownerPhone) {
        result.siteContact = sitePhone;
        continue;
      }
      // 전화번호 없지만 "현장"/"담당자" 라벨이 원문에 있었으면 텍스트 그대로
      if (/현장|담당자/.test(raw) && !sitePhone) {
        result.siteContact = clean;
        continue;
      }
    }

    // 상호명 — 다른 매칭이 없고 짧은 고유명사 (숫자·특수문자 적음)
    if (!result.vendorName && /상호명/.test(raw)) {
      result.vendorName = clean;
      continue;
    }
    if (!result.vendorName && clean.length <= 20 && !/\d{3}/.test(clean) && !/[.@/]/.test(clean)) {
      // 라벨 없이 온 상호명 후보 — 숫자 많거나 길면 제외
      result.vendorName = clean;
      continue;
    }

    // 출입/기타 → notes 에 누적
    notesParts.push(clean);
  }
  if (notesParts.length > 0) result.notes = notesParts.join(" · ");

  return result;
}

interface LunchConv {
  sessionId: string; userKey: string; vendorId: string | null; vendorName: string; phone: string;
  status: string; assignee: string | null; memo: string; unreadCount: number;
  aiDraft: string | null; aiPhase: string; aiOrderData: string | null;
  messages: LunchMsg[]; createdAt: string; updatedAt: string;
}
interface LunchMsg {
  id: string; role: "user" | "assistant" | "system"; content: string;
  messageType: string; imageUrl?: string; sentBy?: string; createdAt: string;
  isInternal?: boolean; mentionedUserIds?: number[];
}

/** 내부 메시지의 @멘션 highlight (퍼플 굵게). */
function renderInternalLunchContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@([가-힣]{2,5}|[a-zA-Z][a-zA-Z0-9_]{1,15})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} style={{ color: "#7B1FA2", fontWeight: 700 }}>@{m[1]}</span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function OrderCard({ o, formatAmount, onPaymentOrder, onEditOrder }: {
  o: LunchOrder;
  formatAmount: (n: number) => string;
  onPaymentOrder: (o: LunchOrder) => void;
  onEditOrder: (o: LunchOrder) => void;
}) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--app-border-light)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, padding: "4px 10px", borderRadius: 12,
          backgroundColor: STATUS_COLORS[o.status].bg, color: STATUS_COLORS[o.status].text,
        }}>{STATUS_LABELS[o.status]}</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--app-text-tertiary)" }}>#{o.orderNumber}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        {[
          { l: "날짜", v: o.date },
          { l: "수거시간", v: o.pickupTime || "-" },
          { l: "개수", v: `${o.boxCount || "-"}개` },
          { l: "금액", v: formatAmount(o.totalAmount) },
          ...(o.pickupAddress ? [{ l: "주소", v: o.pickupAddress }] : []),
        ].map(({ l, v }) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
            <span style={{ color: "var(--app-text-tertiary)", width: 60, flexShrink: 0 }}>{l}</span>
            <span style={{ color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => onEditOrder(o)} style={{
          flex: 1, height: 32, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
        }}>
          <Edit3 style={{ width: 12, height: 12 }} /> 수정
        </button>
        {o.settlementType === "link_pay" && o.status !== "cancelled" && o.status !== "completed" && (
          <button onClick={() => onPaymentOrder(o)} style={{
            flex: 1, height: 32, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            backgroundColor: o.paymentIds.length > 0 ? "var(--app-tag-purple-bg)" : "var(--app-tag-blue-bg)",
            color: o.paymentIds.length > 0 ? "var(--app-tag-purple-text)" : "var(--app-accent)",
          }}>
            <CreditCard style={{ width: 12, height: 12 }} />
            {o.paymentIds.length > 0 ? "결제확인" : "결제요청"}
          </button>
        )}
      </div>
    </div>
  );
}

export function LunchChatView({
  orders, vendors, vendorMap, selectedId, onSelect, getVendorPhone, formatAmount, formatPhone, setViewMode, onRefresh, onPaymentOrder, onCreateOrder, onEditOrder, extractTripFee, regionPrices,
}: {
  orders: LunchOrder[];
  vendors: LunchVendor[];
  vendorMap: Map<string, LunchVendor>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  getVendorPhone: (o: LunchOrder) => string;
  formatAmount: (n: number) => string;
  formatPhone: (p: string) => string;
  setViewMode: (mode: ViewMode) => void;
  onRefresh: () => void;
  onPaymentOrder: (order: LunchOrder) => void;
  onCreateOrder: (vendorId?: string, vendorName?: string, aiOrderData?: string | null, sessionId?: string) => void;
  onEditOrder: (order: LunchOrder) => void;
  extractTripFee: (address: string, boxCount?: number) => { district: string | null; fee: number };
  regionPrices: { region: string; price1: number; lunchSmall?: number }[];
}) {
  const [chatSearch, setChatSearch] = useState("");
  const [chatTab, setChatTab] = useState<"chat" | "orders">("chat");
  const [convStatusTab, setConvStatusTab] = useState<"active" | "closed">("active");
  const [rightTab, setRightTab] = useState<"info" | "quote" | "orders">("info");

  // ── 견적 계산 상태 ──
  const [quoteForm, setQuoteForm] = useState({
    region: "", boxCount: "", sortingPrice: "", timeType: "오후" as string,
  });

  // ── 런치 대화 상태 ──
  const [conversations, setConversations] = useState<LunchConv[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<LunchConv | null>(null);

  // 딥링크 sessionId 초기 선택 (/lunch?sessionId=xxx)
  useEffect(() => {
    const sid = readUrlSessionId();
    if (sid) setSelectedConvId(sid);
  }, []);
  const [msgInput, setMsgInput] = useState("");
  const [sending, setSending] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);
  const msgTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ── 플랫폼별 단축키 표기 ──
  const isMac = typeof window !== "undefined" && /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
  const modKey = isMac ? "⌘" : "Ctrl+";

  // ── 내부대화 모드 + @멘션 (방문수거와 동일) ──
  const [internalMode, setInternalMode] = useInternalMode(selectedConvId ?? "");
  const [counselors, setCounselors] = useState<{ id: number; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    fetch("/api/counselors").then((r) => r.json()).then((d) => {
      setCounselors((d.counselors ?? []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);
  // 런치 도메인 멘션 알림 (toast + 카드 카운터)
  const { unreadBySession: lunchMentionUnread, markRead: markLunchMentionRead } = useMentionNotifier({
    endpoint: "/api/lunch/conversations/mentions",
    readEndpoint: (sid) => `/api/lunch/conversations/${sid}/internal-read`,
    toastLabel: "런치",
    onSessionClick: (sid) => { setSelectedConvId(sid); },
  });

  // 외부 ↔ 내부 텍스트 분리 보존 (sessionId 별)
  const externalDraftRef = useRef<Record<string, string>>({});
  const internalDraftRef = useRef<Record<string, string>>({});
  const prevInternalRef = useRef(internalMode);
  useEffect(() => {
    const sid = selectedConvId ?? "";
    if (!sid) return;
    if (prevInternalRef.current === internalMode) return;
    if (internalMode) {
      externalDraftRef.current[sid] = msgInput;
      setMsgInput(internalDraftRef.current[sid] ?? "");
    } else {
      internalDraftRef.current[sid] = msgInput;
      setMsgInput(externalDraftRef.current[sid] ?? "");
    }
    prevInternalRef.current = internalMode;
  }, [internalMode, selectedConvId, msgInput]);

  // ── Presence (상담사 접속 상태) ──
  const { othersInSession, viewersBySession } = useCounselorPresence(selectedConvId, "presence:lunch-counselors");

  // ── 이미지 전송 상태 ──
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingSending, setIsUploadingSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);

  // ── 매크로 상태 ──
  interface Macro { id: number; name: string; content: string; category: string; }
  const [macros, setMacros] = useState<Macro[]>([]);
  const [showMacroDropdown, setShowMacroDropdown] = useState(false);
  const [macroSearch, setMacroSearch] = useState("");
  const [macroHashPos, setMacroHashPos] = useState(-1);
  const [focusedMacroIdx, setFocusedMacroIdx] = useState(0);
  const macroDropdownRef = useRef<HTMLDivElement>(null);
  const macroSearchRef = useRef<HTMLInputElement>(null);

  // 매크로 로드
  useEffect(() => { fetch("/api/macros").then(r => r.json()).then(d => setMacros(d.macros ?? [])).catch(() => {}); }, []);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!showMacroDropdown) return;
    const h = (e: MouseEvent) => { if (macroDropdownRef.current && !macroDropdownRef.current.contains(e.target as Node)) setShowMacroDropdown(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [showMacroDropdown]);

  const filteredMacros = macroSearch.trim() ? macros.filter(m => m.name.toLowerCase().includes(macroSearch.toLowerCase())) : macros;
  const groupedMacros: Record<string, Macro[]> = {};
  for (const m of filteredMacros) { if (!groupedMacros[m.category]) groupedMacros[m.category] = []; groupedMacros[m.category].push(m); }
  const flatMacroList = Object.values(groupedMacros).flat();

  const selectMacro = (macro: Macro) => {
    if (macroHashPos >= 0) {
      const before = msgInput.substring(0, macroHashPos);
      setMsgInput(before + macro.content);
    } else {
      setMsgInput(macro.content);
    }
    setShowMacroDropdown(false); setMacroSearch(""); setMacroHashPos(-1);
  };

  const handleMsgInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMsgInput(val);
    // # 감지
    const cursorPos = e.target.selectionStart;
    if (cursorPos > 0) {
      const beforeCursor = val.substring(0, cursorPos);
      const lastHash = beforeCursor.lastIndexOf("#");
      if (lastHash >= 0 && (lastHash === 0 || /\s/.test(val[lastHash - 1]))) {
        const afterHash = beforeCursor.substring(lastHash + 1);
        if (!afterHash.includes("\n") && afterHash.length < 30) {
          setMacroHashPos(lastHash); setMacroSearch(afterHash); setShowMacroDropdown(true); return;
        }
      }
    }
    if (showMacroDropdown) setShowMacroDropdown(false);

    // @ 감지 — 내부대화 모드에서만 picker 표시
    if (internalMode && cursorPos > 0) {
      const beforeCursor = val.substring(0, cursorPos);
      const lastAt = beforeCursor.lastIndexOf("@");
      if (lastAt >= 0 && (lastAt === 0 || /\s/.test(val[lastAt - 1]))) {
        const afterAt = beforeCursor.substring(lastAt + 1);
        if (!/\s/.test(afterAt) && afterAt.length < 16) {
          setMentionStartPos(lastAt);
          setMentionQuery(afterAt);
          const rect = e.target.getBoundingClientRect();
          setPickerAnchor({ left: rect.left + 16, bottom: rect.top });
          return;
        }
      }
    }
    if (mentionQuery !== null) {
      setMentionQuery(null);
      setMentionStartPos(-1);
    }
  };

  const handleMacroKeyDown = (e: React.KeyboardEvent) => {
    if (!showMacroDropdown || flatMacroList.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocusedMacroIdx(i => Math.min(i + 1, flatMacroList.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedMacroIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flatMacroList[focusedMacroIdx]) selectMacro(flatMacroList[focusedMacroIdx]); }
    else if (e.key === "Escape") { e.preventDefault(); setShowMacroDropdown(false); }
  };

  // 대화 목록 로드
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/lunch/conversations?limit=100");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {} finally { setConvLoading(false); }
  }, []);

  useEffect(() => { if (chatTab === "chat") fetchConversations(); }, [chatTab, fetchConversations]);

  // 5초 폴링
  useEffect(() => {
    if (chatTab !== "chat") return;
    const iv = setInterval(fetchConversations, 15000);
    return () => clearInterval(iv);
  }, [chatTab, fetchConversations]);

  // 대화 선택 → 메시지 로드
  const selectConv = useCallback(async (sessionId: string) => {
    setSelectedConvId(sessionId);
    setMsgInput("");
    markLunchMentionRead(sessionId);
    try {
      const res = await fetch(`/api/lunch/conversations/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedConv(data);
        prevMsgCountRef.current = data.messages?.length ?? 0;
        // AI 초안이 있으면 입력창에 반영
        if (!internalModeRef.current && data.aiDraft) setMsgInput(data.aiDraft);
        // 자동 읽음 처리 제거 — 상담사가 실제 답장을 보낼 때만 unread 해제 (누락 방지)
      }
    } catch {}
    setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
  }, []);

  // 선택된 대화 폴링 (새 메시지 + AI 초안 갱신)
  const prevDraftRef = useRef<string | null>(null);
  // 폴링 closure 에 internalMode stale 캡쳐 방지 — ref 로 동기화
  const internalModeRef = useRef(internalMode);
  useEffect(() => { internalModeRef.current = internalMode; }, [internalMode]);
  const prevMsgCountRef = useRef<number>(0);
  // msgInput을 ref로도 유지 (interval 내 stale closure 방지)
  const msgInputRef = useRef(msgInput);
  useEffect(() => { msgInputRef.current = msgInput; }, [msgInput]);
  useEffect(() => {
    if (!selectedConvId) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/lunch/conversations/${selectedConvId}`);
        if (res.ok) {
          const data = await res.json();
          const newCount = data.messages?.length ?? 0;
          const hadNew = newCount > prevMsgCountRef.current;
          setSelectedConv(data);
          prevMsgCountRef.current = newCount;
          // 새 메시지 도착 시 자동 스크롤
          if (hadNew) {
            setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }
          // AI 초안이 새로 생성됐고 입력창이 비어있으면 자동 반영
          // msgInputRef로 최신값 체크 (stale closure 방지 — 사용자 타이핑 중 덮어쓰기 방지)
          // 상담완료(closed)된 세션은 입력창에 자동 반영하지 않음 — 입력창이 잠겨있어 의미 없음
          if (!internalModeRef.current && data.status !== "closed" && data.aiDraft && data.aiDraft !== prevDraftRef.current && !msgInputRef.current.trim()) {
            setMsgInput(data.aiDraft);
          }
          prevDraftRef.current = data.aiDraft;
        }
      } catch {}
    }, 15000);
    return () => clearInterval(iv);
  }, [selectedConvId]);

  // 메시지 발송
  const handleSend = async () => {
    if (!msgInput.trim() || !selectedConvId || sending) return;
    // 내부대화 모드 — 별도 endpoint, 벤더에게 절대 안 나감
    if (internalMode) {
      setSending(true);
      try {
        const text = msgInput.trim();
        const { ids } = parseMentions(text, counselors);
        const res = await fetch(`/api/lunch/conversations/${selectedConvId}/internal-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, mentionedUserIds: ids }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "내부대화 전송 실패");
        }
        setMsgInput("");
        const refreshRes = await fetch(`/api/lunch/conversations/${selectedConvId}`);
        if (refreshRes.ok) setSelectedConv(await refreshRes.json());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "내부대화 전송 실패");
      } finally {
        setSending(false);
      }
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/lunch/conversations/${selectedConvId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msgInput.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || d.error || `발송 실패 (${res.status})`);
      }
      setMsgInput("");
      // 즉시 반영
      const refreshRes = await fetch(`/api/lunch/conversations/${selectedConvId}`);
      if (refreshRes.ok) setSelectedConv(await refreshRes.json());
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "발송 실패");
    } finally { setSending(false); }
  };

  // ── 이미지 압축 ──
  const compressImage = (file: File, maxWidth = 1600, quality = 0.82): Promise<File> => {
    return new Promise((resolve) => {
      if (file.size < 500 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : file);
        }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("파일 크기가 20MB를 초과합니다"); return; }
    const compressed = await compressImage(file);
    setImageFile(compressed);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(compressed);
  };

  const handleImageSend = async () => {
    if (!imageFile || !selectedConvId) return;
    setIsUploadingSending(true);
    try {
      const formData = new FormData();
      formData.append("file", imageFile);
      const res = await fetch(`/api/lunch/conversations/${selectedConvId}/send-image`, { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "이미지 전송 실패"); }
      toast.success("이미지 전송 완료");
      setImageFile(null); setImagePreview(null);
      const refreshRes = await fetch(`/api/lunch/conversations/${selectedConvId}`);
      if (refreshRes.ok) setSelectedConv(await refreshRes.json());
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { toast.error(e instanceof Error ? e.message : "이미지 전송 실패"); }
    finally { setIsUploadingSending(false); }
  };

  const cancelImage = () => { setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; };

  // 파일 전송
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("파일 크기가 50MB를 초과합니다"); return; }
    setPendingFile(file);
  };

  const handleFileSend = async () => {
    if (!pendingFile || !selectedConvId) return;
    setIsSendingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch(`/api/lunch/conversations/${selectedConvId}/send-file`, { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "파일 전송 실패"); }
      toast.success(`파일 전송 완료: ${pendingFile.name}`);
      setPendingFile(null); if (docFileInputRef.current) docFileInputRef.current.value = "";
      const refreshRes = await fetch(`/api/lunch/conversations/${selectedConvId}`);
      if (refreshRes.ok) setSelectedConv(await refreshRes.json());
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { toast.error(e instanceof Error ? e.message : "파일 전송 실패"); }
    finally { setIsSendingFile(false); }
  };

  const cancelFile = () => { setPendingFile(null); if (docFileInputRef.current) docFileInputRef.current.value = ""; };

  // 드래그 & 드롭 핸들러
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (file.size > 20 * 1024 * 1024) { toast.error("이미지 크기가 20MB를 초과합니다"); return; }
      const compressed = await compressImage(file);
      setImageFile(compressed);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(compressed);
    } else {
      if (file.size > 50 * 1024 * 1024) { toast.error("파일 크기가 50MB를 초과합니다"); return; }
      setPendingFile(file);
    }
  };

  // ── 기존 orders 탭 로직 ──
  const selected = orders.find((o) => o.id === selectedId) || null;
  const vendor = selected?.vendorId ? vendorMap.get(selected.vendorId) : selected?.vendorName ? vendorMap.get(selected.vendorName) : null;

  const chatFiltered = useMemo(() => {
    if (!chatSearch) return orders;
    const q = chatSearch.toLowerCase();
    return orders.filter((o) => {
      const searchable = [o.vendorName, o.pickupAddress, o.siteContact, o.orderNumber, o.notes].join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }, [orders, chatSearch]);

  // 대화 검색 + 상태 필터
  const convFiltered = useMemo(() => {
    let list = conversations;
    // 상태 탭 필터: 대기중(active+needs_check) / 상담완료(closed)
    if (convStatusTab === "active") {
      list = list.filter((c) => c.status !== "closed");
    } else {
      list = list.filter((c) => c.status === "closed");
    }
    if (chatSearch) {
      const q = chatSearch.toLowerCase();
      list = list.filter((c) => c.vendorName.toLowerCase().includes(q) || c.phone.includes(q));
    }
    return list;
  }, [conversations, chatSearch, convStatusTab]);

  // 탭별 건수
  const activeCount = conversations.filter((c) => c.status !== "closed").length;
  const closedCount = conversations.filter((c) => c.status === "closed").length;

  const formatRelativeDate = (dateStr: string) => {
    const today = new Date();
    const date = new Date(dateStr);
    const diffTime = today.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "오늘";
    if (diffDays === 1) return "어제";
    if (diffDays < 7) return `${diffDays}일 전`;
    return dateStr.slice(0, 10);
  };

  // ── 선택된 대화의 벤더/주문 정보 ──
  const convVendor = useMemo(() => {
    if (!selectedConv) return null;
    if (selectedConv.vendorId) return vendorMap.get(selectedConv.vendorId) || null;
    if (selectedConv.vendorName) return vendorMap.get(selectedConv.vendorName) || null;
    return null;
  }, [selectedConv, vendorMap]);

  const convOrders = useMemo(() => {
    if (!convVendor) return [];
    return orders.filter((o) => o.vendorId === convVendor.id || o.vendorName === convVendor.name)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [convVendor, orders]);
  const activeOrders = useMemo(() => convOrders.filter((o) => o.status === "confirmed" || o.status === "payment_requested"), [convOrders]);
  const pastOrders = useMemo(() => convOrders.filter((o) => o.status === "completed" || o.status === "cancelled"), [convOrders]);
  const [showPastOrders, setShowPastOrders] = useState(false);

  // 벤더명/전화번호 편집
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldInput, setFieldInput] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  // 이미지 라이트박스
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [convMemo, setConvMemo] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  useEffect(() => { setConvMemo(selectedConv?.memo || ""); }, [selectedConv?.memo]);

  const saveConvField = async (field: string, value: string) => {
    if (!selectedConv) return;
    try {
      await fetch(`/api/lunch/conversations/${selectedConv.sessionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      // 벤더도 업데이트
      if (convVendor && (field === "vendorName" || field === "phone")) {
        const vendorField = field === "vendorName" ? "name" : "ownerPhone";
        await fetch(`/api/lunch/vendors/${convVendor.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [vendorField]: value }),
        });
      }
      onRefresh();
      fetchConversations();
      if (selectedConvId) selectConv(selectedConvId);
    } catch {}
    setEditingField(null);
  };

  const saveConvMemo = async () => {
    if (!selectedConv) return;
    setSavingMemo(true);
    try {
      await fetch(`/api/lunch/conversations/${selectedConv.sessionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: convMemo }),
      });
      toast.success("메모 저장 완료");
    } catch {} finally { setSavingMemo(false); }
  };

  const formatMsgDate = (ts: string) => {
    const d = new Date(ts);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  };

  const formatMsgTime = (ts: string) => {
    const d = new Date(ts);
    const h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? "오후" : "오전";
    return `${ap} ${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")}`;
  };

  // getVendorPhone is currently unused inside ChatView body but kept on the props for parity
  void getVendorPhone;

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      {/* Left Panel - Order List (320px) */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ width: 320, backgroundColor: "var(--app-surface)", borderRight: "1px solid var(--app-border)" }}
      >
        {/* Tabs: 상담 / 예약 */}
        <div style={{ padding: "12px 16px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 10 }}>
            {([
              { key: "chat" as const, label: "상담", icon: MessageSquare },
              { key: "orders" as const, label: "예약", icon: Calendar },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => key === "orders" ? setViewMode("orders") : setChatTab(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  height: 34, padding: "0 12px",
                  fontSize: 13, fontWeight: chatTab === key ? 600 : 400,
                  color: chatTab === key ? "white" : "var(--app-text-tertiary)",
                  backgroundColor: chatTab === key ? "var(--app-accent)" : "transparent",
                  borderRadius: 8, border: "none", cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                <Icon style={{ width: 14, height: 14 }} />
                {label}
              </button>
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <Search
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--app-text-placeholder)" }}
            />
            <input
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="지점명, 주소, 순번 검색"
              style={{
                width: "100%", paddingLeft: 36, paddingRight: 12,
                height: 36, fontSize: 14, backgroundColor: "var(--app-surface-secondary)",
                borderRadius: 8, border: "none", outline: "none",
                color: "var(--app-text-primary)",
                boxSizing: "border-box",
              }}
            />
          </div>
          {/* 대기중 / 상담완료 서브탭 */}
          <div style={{ display: "flex", gap: 0, marginTop: 8 }}>
            {([
              { key: "active" as const, label: "대기중", count: activeCount },
              { key: "closed" as const, label: "상담완료", count: closedCount },
            ]).map(({ key, label, count }) => (
              <button key={key} onClick={() => setConvStatusTab(key)} style={{
                flex: 1, padding: "6px 0", fontSize: 12, fontWeight: convStatusTab === key ? 600 : 400,
                color: convStatusTab === key ? "var(--app-accent)" : "var(--app-text-tertiary)",
                backgroundColor: "transparent", border: "none", cursor: "pointer",
                borderBottom: convStatusTab === key ? "2px solid var(--app-accent)" : "2px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}>
                {label}
                {key === "closed" && count > 0 && (
                  <span style={{
                    minWidth: 16, height: 16, borderRadius: 8, fontSize: 10, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                    backgroundColor: "var(--app-border)", color: "var(--app-text-tertiary)",
                  }}>{count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content based on tab */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {chatTab === "chat" ? (
            convLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
              </div>
            ) : convFiltered.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200 }}>
                <MessageSquare style={{ width: 40, height: 40, marginBottom: 8, color: "var(--app-text-placeholder)" }} />
                <p style={{ fontSize: 14, color: "var(--app-text-tertiary)", margin: 0 }}>대화가 없습니다</p>
              </div>
            ) : (
              convFiltered.map((c) => {
                const isActive = selectedConvId === c.sessionId;
                const lastMsg = c.messages?.[c.messages.length - 1];
                const initial = c.vendorName?.charAt(0) || "?";
                const otherViewers = viewersBySession[c.sessionId] || [];
                const statusColor = c.status === "needs_check" ? "#FF9F43" : c.status === "active" ? "#1AA3FF" : "#ADB5BD";
                const statusLabel = c.status === "active" ? "대기중" : c.status === "needs_check" ? "확인필요" : "상담완료";
                return (
                  <div key={c.sessionId} onClick={() => selectConv(c.sessionId)}
                    style={{
                      padding: "14px 20px", cursor: "pointer",
                      borderBottom: "1px solid var(--app-border-light)",
                      backgroundColor: isActive ? "var(--app-selected-bg)" : "transparent",
                      borderLeft: `3px solid ${statusColor}`,
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isActive ? "var(--app-selected-bg)" : "transparent"; }}
                  >
                    {/* 상단: 아바타 + 이름 + 시간 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                          backgroundColor: "var(--app-border)",
                          color: "var(--app-text-secondary)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 15, fontWeight: 600, position: "relative",
                        }}>
                          {initial}
                          {otherViewers.length > 0 && c.unreadCount === 0 && (
                            <span style={{
                              position: "absolute", bottom: -1, right: -1,
                              width: 12, height: 12, borderRadius: "50%",
                              backgroundColor: "#20C997", border: "2px solid var(--app-surface)",
                            }} title={otherViewers.map(v => v.name).join(", ")} />
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.vendorName || c.phone || c.sessionId.slice(0, 10)}
                            </span>
                            {c.unreadCount > 0 && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: "white", backgroundColor: "#1AA3FF", borderRadius: 8, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0 }}>
                                {c.unreadCount > 9 ? "9+" : c.unreadCount}
                              </span>
                            )}
                            {(lunchMentionUnread[c.sessionId] ?? 0) > 0 && (
                              <span title={`멘션 ${lunchMentionUnread[c.sessionId]}건`} style={{ fontSize: 12, fontWeight: 700, color: "white", backgroundColor: "#7B1FA2", borderRadius: 8, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0 }}>
                                @{lunchMentionUnread[c.sessionId] > 9 ? "9+" : lunchMentionUnread[c.sessionId]}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: "var(--app-text-placeholder)", flexShrink: 0, marginLeft: 8 }}>
                        {formatRelativeDate(c.updatedAt)}
                      </span>
                    </div>

                    {/* 미리보기 */}
                    <p style={{
                      fontSize: 15, color: "var(--app-text-secondary)", margin: "0 0 8px 44px",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {lastMsg?.content || "새 대화"}
                    </p>

                    {/* 상태 + 담당자 뱃지 */}
                    <div style={{ display: "flex", gap: 6, marginLeft: 44, flexWrap: "wrap" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 13, fontWeight: 500, color: "var(--app-text-secondary)",
                        backgroundColor: "var(--app-surface-secondary)", borderRadius: 4, padding: "2px 8px",
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: statusColor }} />
                        {statusLabel}
                      </span>
                      {c.assignee && (
                        <span style={{
                          fontSize: 13, fontWeight: 500, color: "var(--app-tag-purple-text)",
                          backgroundColor: "var(--app-tag-purple-bg)", borderRadius: 4, padding: "2px 8px",
                        }}>
                          {c.assignee}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )
          ) : chatFiltered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Inbox style={{ width: 40, height: 40, marginBottom: 8, color: "var(--app-text-placeholder)" }} />
              <p style={{ fontSize: 14, color: "var(--app-text-tertiary)", margin: 0 }}>주문이 없습니다</p>
            </div>
          ) : (
            chatFiltered.map((o) => {
              const isActive = selectedId === o.id;
              const sc = STATUS_COLORS[o.status];
              const initial = o.vendorName.charAt(0);
              return (
                <div
                  key={o.id}
                  onClick={() => onSelect(o.id)}
                  style={{
                    padding: "12px 16px", cursor: "pointer",
                    borderBottom: "1px solid var(--app-border-light)",
                    backgroundColor: isActive ? "var(--app-selected-bg)" : "transparent",
                    display: "flex", gap: 12, alignItems: "flex-start",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isActive ? "var(--app-selected-bg)" : "transparent"; }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    backgroundColor: isActive ? "var(--app-accent)" : "var(--app-surface-secondary)",
                    color: isActive ? "white" : "var(--app-text-secondary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, fontWeight: 700,
                  }}>
                    {initial}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.vendorName}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", flexShrink: 0, marginLeft: 8 }}>
                        {formatRelativeDate(o.date)}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13, color: "var(--app-text-secondary)", marginBottom: 5,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      수거: {o.pickupTime || "-"} / {o.boxCount || "-"}개
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
                        backgroundColor: sc.bg, color: sc.text,
                      }}>
                        {STATUS_LABELS[o.status]}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-primary)" }}>
                        {formatAmount(o.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Center Panel — 채팅 영역 */}
      {chatTab === "chat" && selectedConv ? (
        <div
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)", overflow: "hidden", position: "relative" }}
        >
          {/* 드래그 오버레이 */}
          {isDragOver && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 50,
              backgroundColor: "rgba(59,130,246,0.1)", border: "3px dashed var(--app-accent)", borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none",
            }}>
              <div style={{ padding: "16px 32px", borderRadius: 12, backgroundColor: "var(--app-surface)", boxShadow: "var(--app-shadow-lg)", fontSize: 17, fontWeight: 600, color: "var(--app-accent)" }}>
                파일을 여기에 드랍하세요
              </div>
            </div>
          )}
          {/* Chat Header */}
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid var(--app-border)",
            backgroundColor: "var(--app-surface)", display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                backgroundColor: selectedConv.status === "active" ? "#E8F7FF" : "#F1F3F5",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, color: selectedConv.status === "active" ? "#1AA3FF" : "#868E96",
              }}>
                {(selectedConv.vendorName || "?").charAt(0)}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)" }}>
                    {selectedConv.vendorName || selectedConv.phone || "알 수 없음"}
                  </span>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    backgroundColor: selectedConv.status === "active" ? "#20C997" : selectedConv.status === "needs_check" ? "#FF9F43" : "#ADB5BD",
                  }} />
                </div>
                <div style={{ fontSize: 14, color: "var(--app-text-tertiary)", marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  세션 {selectedConv.sessionId}
                  {selectedConv.phone && ` · ${selectedConv.phone}`}
                  {othersInSession.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 8, backgroundColor: "#E8F7FF", fontSize: 11, color: "#1AA3FF", fontWeight: 600 }}>
                      <Users style={{ width: 11, height: 11 }} />
                      {othersInSession.map(v => v.name).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* 주소 복사 (상담사끼리 세션 공유용) */}
              <button
                onClick={() => {
                  const url = `${window.location.origin}/covering-talk/lunch?sessionId=${selectedConv.sessionId}`;
                  navigator.clipboard.writeText(url);
                  toast.success("채팅 주소가 복사되었습니다");
                }}
                title="채팅 주소 복사"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 600, color: "var(--app-text-secondary)",
                  backgroundColor: "var(--app-surface-secondary)", border: "1px solid var(--app-border)",
                  borderRadius: 8, padding: "7px 14px",
                  cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-border)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
              >
                <Link2 style={{ width: 15, height: 15 }} />
                주소복사
              </button>

              {/* 읽음/안읽음 토글 */}
              <button
                onClick={async () => {
                  const isUnread = selectedConv.unreadCount > 0;
                  try {
                    await fetch(`/api/lunch/conversations/${selectedConv.sessionId}/read`, { method: isUnread ? "POST" : "DELETE" });
                    const newCount = isUnread ? 0 : 1;
                    setSelectedConv((prev) => prev ? { ...prev, unreadCount: newCount } : prev);
                    setConversations((prev) => prev.map((c) => c.sessionId === selectedConv.sessionId ? { ...c, unreadCount: newCount } : c));
                    toast.success(isUnread ? "읽음 처리되었습니다" : "안읽음 처리되었습니다");
                  } catch { toast.error("처리 실패"); }
                }}
                title={selectedConv.unreadCount > 0 ? "답장 없이 읽음 처리" : "안읽음으로 되돌리기"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 600, color: "var(--app-text-secondary)",
                  backgroundColor: "var(--app-surface-secondary)", border: "1px solid var(--app-border)",
                  borderRadius: 8, padding: "7px 14px",
                  cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedConv.unreadCount > 0 ? (
                  <><Check style={{ width: 15, height: 15 }} /> 읽음</>
                ) : (
                  <><Inbox style={{ width: 15, height: 15 }} /> 안읽음</>
                )}
              </button>

              {/* 상태 pill 드롭다운 */}
              <select
                value={selectedConv.status}
                onChange={(e) => saveConvField("status", e.target.value)}
                style={{
                  padding: "7px 28px 7px 14px", borderRadius: 8, border: "1px solid var(--app-border)",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  appearance: "none", WebkitAppearance: "none",
                  backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
                  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
                  ...(selectedConv.status === "active" ? { backgroundColor: "#E8F7FF", color: "#1AA3FF" }
                    : selectedConv.status === "needs_check" ? { backgroundColor: "#FFF3E0", color: "#E65100" }
                    : { backgroundColor: "#F1F3F5", color: "#868E96" }),
                }}
              >
                <option value="active">대기중</option>
                <option value="needs_check">확인필요</option>
                <option value="closed">상담완료</option>
              </select>

            </div>
          </div>

          {/* Messages with date separators */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {(() => {
              let lastDateStr = "";
              const msgs = selectedConv.messages;
              const skipIds = new Set<string>();
              const elements: React.ReactNode[] = [];

              msgs.forEach((msg, idx) => {
                if (skipIds.has(msg.id)) return;
                const isUser = msg.role === "user";
                const isSystem = msg.role === "system";
                const dateStr = formatMsgDate(msg.createdAt);
                const showDate = dateStr !== lastDateStr;
                if (showDate) lastDateStr = dateStr;

                // 날짜 구분선
                if (showDate) {
                  elements.push(
                    <div key={`date-${dateStr}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0", gap: 12 }}>
                      <div style={{ flex: 1, height: 1, backgroundColor: "var(--app-border)" }} />
                      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", whiteSpace: "nowrap", fontWeight: 500 }}>{dateStr}</span>
                      <div style={{ flex: 1, height: 1, backgroundColor: "var(--app-border)" }} />
                    </div>
                  );
                }

                if (isSystem) {
                  elements.push(
                    <div key={msg.id} style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                      <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", backgroundColor: "var(--app-border)", padding: "4px 12px", borderRadius: 12 }}>
                        {msg.content}
                      </span>
                    </div>
                  );
                  return;
                }

                // 연속 이미지 그룹핑 (방문수거 ChatArea와 동일)
                let imageGroup: LunchMsg[] | null = null;
                if (msg.messageType === "image" && msg.imageUrl) {
                  const group = [msg];
                  for (let j = idx + 1; j < msgs.length; j++) {
                    const next = msgs[j];
                    if (next.messageType === "image" && next.imageUrl && next.role === msg.role) {
                      group.push(next);
                      skipIds.add(next.id);
                    } else break;
                  }
                  if (group.length > 1) imageGroup = group;
                }

                elements.push(
                  <div key={msg.id} style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-start" }}>
                    {isUser ? (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, backgroundColor: "var(--app-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <User style={{ width: 16, height: 16, color: "var(--app-text-secondary)" }} />
                      </div>
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, backgroundColor: "#1AA3FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white" }}>
                        {(msg.sentBy || "상")[0]}
                      </div>
                    )}
                    <div style={{ maxWidth: "75%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>
                          {isUser ? (selectedConv.vendorName || "벤더") : (msg.sentBy || "상담사")}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--app-text-placeholder)" }}>{formatMsgTime(msg.createdAt)}</span>
                      </div>
                      {imageGroup ? (
                        /* 그룹 이미지: 가로 그리드 (방문수거와 동일) */
                        <div style={{
                          display: "grid", gap: 4, borderRadius: 12, overflow: "hidden",
                          gridTemplateColumns: imageGroup.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                          maxWidth: imageGroup.length === 1 ? 320 : 480,
                        }}>
                          {imageGroup.map((img) => (
                            <div key={img.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--app-border)", cursor: "zoom-in" }}
                              onClick={() => setLightboxUrl(img.imageUrl!)}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={img.imageUrl} alt="" style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }} />
                            </div>
                          ))}
                        </div>
                      ) : msg.messageType === "image" && msg.imageUrl ? (
                        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--app-border)", cursor: "zoom-in", display: "inline-block" }}
                          onClick={() => setLightboxUrl(msg.imageUrl!)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={msg.imageUrl} alt="" style={{ maxWidth: 320, borderRadius: 12, display: "block" }} />
                        </div>
                      ) : msg.messageType === "file" && msg.imageUrl ? (
                        <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                          borderRadius: 12, backgroundColor: "var(--app-bg)", border: "1px solid var(--app-border)",
                          textDecoration: "none", maxWidth: 320,
                        }}>
                          <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>FILE</span>
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {msg.content.replace("[파일] ", "") || "파일"}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--app-accent)" }}>다운로드</div>
                          </div>
                        </a>
                      ) : (
                        <>
                          <div style={{
                            padding: "10px 16px", borderRadius: "18px 18px 18px 4px",
                            fontSize: 16, lineHeight: 1.6, wordBreak: "break-word", whiteSpace: "pre-wrap",
                            backgroundColor: msg.isInternal ? "#FFF8E1" : (isUser ? "var(--app-bubble-user-bg)" : "var(--app-bubble-manager-bg)"),
                            color: msg.isInternal ? "#5D4037" : (isUser ? "var(--app-bubble-user-text)" : "var(--app-bubble-manager-text)"),
                            border: msg.isInternal ? "1px solid #FFD54F" : (isUser ? "var(--app-bubble-user-border)" : "none"),
                            boxShadow: "var(--app-shadow)",
                          }}>
                            {msg.isInternal ? renderInternalLunchContent(msg.content) : msg.content}
                          </div>
                          {/* 예약 추가 버튼 — 벤더가 템플릿 형식으로 보낸 경우만 노출 */}
                          {isUser && (() => {
                            const parsed = parseLunchOrderMessage(msg.content);
                            if (!parsed) return null;
                            return (
                              <button
                                onClick={() => {
                                  // 세션에 매핑된 벤더 최우선 → parsed.vendorName 은 세션 매핑이 없을 때만 fallback
                                  let finalVendorId: string | undefined = selectedConv.vendorId || undefined;
                                  let finalVendorName = selectedConv.vendorName || "";
                                  if (!finalVendorId) {
                                    const vName = parsed.vendorName || finalVendorName || "";
                                    const matched = vendors.find((v) =>
                                      v.isActive && (v.name === vName || (vName && v.name.includes(vName)) || (vName && vName.includes(v.name)))
                                    );
                                    if (matched) {
                                      finalVendorId = matched.id;
                                      finalVendorName = matched.name;
                                    } else if (!finalVendorName) {
                                      finalVendorName = vName;
                                    }
                                  }
                                  // LunchPage 의 onCreateOrder 콜백 사용 — aiOrderData JSON 문자열로 전달
                                  onCreateOrder(
                                    finalVendorId,
                                    finalVendorName,
                                    JSON.stringify({
                                      vendorName: finalVendorName,
                                      date: parsed.date,
                                      timeAmPm: parsed.timeAmPm,
                                      timeHour: parsed.timeHour,
                                      timeMinute: parsed.timeMinute,
                                      boxCount: parsed.boxCount,
                                      pickupAddress: parsed.pickupAddress,
                                      ownerPhone: parsed.ownerPhone,
                                      siteContact: parsed.siteContact,
                                      notes: parsed.notes,
                                      settlementType: parsed.settlementType,
                                    }),
                                    selectedConv.sessionId,
                                  );
                                }}
                                style={{
                                  marginTop: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600,
                                  color: "var(--app-tag-purple-text)", backgroundColor: "var(--app-tag-purple-bg)",
                                  border: "1px solid var(--app-tag-purple-text)", borderRadius: 6,
                                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                                }}
                              >
                                <Plus style={{ width: 12, height: 12 }} /> 예약 추가
                              </button>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                );
              });
              return elements;
            })()}
            {/* AI 초안 — 상담완료된 세션은 숨김 (보내질 일 없는 초안이라 혼란 유발) */}
            {selectedConv.aiDraft && selectedConv.status !== "closed" && !internalMode && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  backgroundColor: "var(--app-tag-blue-bg)", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Bot style={{ width: 16, height: 16, color: "var(--app-accent)" }} />
                </div>
                <div style={{ maxWidth: "70%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text-tertiary)" }}>AI 초안</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--app-accent)", fontWeight: 500 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--app-accent)", animation: "pulse 2s infinite" }} />
                      전송 대기
                    </span>
                  </div>
                  <div style={{
                    backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                    padding: "12px 16px", borderRadius: "4px 16px 16px 16px",
                    fontSize: 16, lineHeight: 1.6,
                    border: "1px solid var(--app-border)",
                    wordBreak: "break-word", whiteSpace: "pre-wrap",
                  }}>
                    {selectedConv.aiDraft}
                  </div>
                </div>
              </div>
            )}
            <div ref={msgEndRef} />
          </div>

          {/* 이미지 미리보기 — 종료된 상담은 발송 불가하므로 숨김 */}
          {imagePreview && selectedConv.status !== "closed" && (
            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="미리보기" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--app-border)" }} />
                <button onClick={cancelImage} style={{
                  position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                  backgroundColor: "#E8344E", color: "white", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}><X style={{ width: 12, height: 12 }} /></button>
              </div>
              <button onClick={handleImageSend} disabled={isUploadingSending} style={{
                padding: "8px 20px", borderRadius: 8, border: "none",
                backgroundColor: isUploadingSending ? "var(--app-border)" : "var(--app-btn-primary-bg, var(--app-accent))",
                color: "white", fontSize: 14, fontWeight: 600, cursor: isUploadingSending ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {isUploadingSending ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 전송 중...</> : <><Send style={{ width: 14, height: 14 }} /> 이미지 전송</>}
              </button>
            </div>
          )}

          {/* 파일 미리보기 — 종료된 상담은 발송 불가하므로 숨김 */}
          {pendingFile && selectedConv.status !== "closed" && (
            <div style={{ padding: "12px 24px", borderTop: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                <Paperclip style={{ width: 18, height: 18, color: "var(--app-text-secondary)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.name}</div>
                  <div style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>{(pendingFile.size / 1024).toFixed(1)} KB</div>
                </div>
              </div>
              <button onClick={cancelFile} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
              </button>
              <button onClick={handleFileSend} disabled={isSendingFile} style={{
                padding: "8px 20px", borderRadius: 8, border: "none",
                backgroundColor: isSendingFile ? "var(--app-border)" : "var(--app-accent)",
                color: "white", fontSize: 14, fontWeight: 600, cursor: isSendingFile ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              }}>
                {isSendingFile ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 전송 중...</> : <><Send style={{ width: 14, height: 14 }} /> 파일 전송</>}
              </button>
            </div>
          )}

          {/* Input — 방문수거 MessageInput 동일 레이아웃 */}
          <div style={{ borderTop: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", position: "relative" }}>
            {/* 상담완료(closed)된 세션은 입력창 잠금 — 방문수거 isDone 패턴과 동일 */}
            {selectedConv.status === "closed" ? (
              <div style={{
                padding: "20px 24px", textAlign: "center",
                fontSize: 16, color: "var(--app-text-tertiary)",
              }}>
                종료된 상담입니다 (고객이 채팅방을 나갔습니다)
              </div>
            ) : (
            <>
            {/* 매크로 드롭다운 */}
            {showMacroDropdown && (
              <div ref={macroDropdownRef} style={{
                position: "absolute", bottom: "100%", left: 24, right: 24,
                maxHeight: 360, backgroundColor: "var(--app-surface)",
                borderRadius: "12px 12px 0 0", border: "1px solid var(--app-border)", borderBottom: "none",
                boxShadow: "var(--app-shadow-lg)", display: "flex", flexDirection: "column", zIndex: 100,
              }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--app-border-light)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--app-accent)" }}>#</span>
                  <input ref={macroSearchRef} value={macroSearch} onChange={e => { setMacroSearch(e.target.value); setFocusedMacroIdx(0); }}
                    onKeyDown={handleMacroKeyDown} placeholder="매크로 검색..."
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 15, color: "var(--app-text-primary)", backgroundColor: "transparent" }} />
                  <button onClick={() => setShowMacroDropdown(false)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                    <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
                  </button>
                </div>
                <div style={{ flex: 1, overflow: "auto", maxHeight: 300 }}>
                  {flatMacroList.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 15 }}>
                      {macroSearch ? "검색 결과 없음" : "등록된 매크로 없음"}
                    </div>
                  ) : (
                    (() => {
                      let gi = 0;
                      return Object.entries(groupedMacros).map(([cat, items]) => (
                        <div key={cat}>
                          <div style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", backgroundColor: "var(--app-bg)", textTransform: "uppercase" }}>{cat}</div>
                          {items.map(macro => {
                            const idx = gi++;
                            return (
                              <button key={macro.id} onClick={() => selectMacro(macro)} onMouseEnter={() => setFocusedMacroIdx(idx)}
                                style={{
                                  display: "block", width: "100%", textAlign: "left", padding: "8px 14px", border: "none",
                                  backgroundColor: idx === focusedMacroIdx ? "var(--app-selected-bg)" : "transparent",
                                  cursor: "pointer", fontSize: 15, color: "var(--app-text-primary)",
                                }}>
                                <div style={{ fontWeight: 500 }}>{macro.name}</div>
                                <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {macro.content.substring(0, 60)}...
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ));
                    })()
                  )}
                </div>
              </div>
            )}

            {isDragOver && (
              <div style={{ textAlign: "center", padding: "12px 0", color: "var(--app-accent)", fontSize: 14, fontWeight: 600 }}>
                파일을 여기에 놓으세요
              </div>
            )}
            {/* 외부/내부 탭 — 채널톡식 */}
            <div style={{ display: "flex", margin: "0 24px", borderBottom: "1px solid var(--app-border)" }}>
              {([
                { key: false, label: "외부", desc: "벤더 답변" },
                { key: true, label: "내부", desc: "상담사 메모" },
              ] as const).map((t) => {
                const active = internalMode === t.key;
                const isInt = t.key;
                return (
                  <button
                    key={String(t.key)}
                    type="button"
                    onClick={() => setInternalMode(t.key)}
                    disabled={sending}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "8px 14px",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 13, fontWeight: active ? 700 : 500,
                      color: active ? (isInt ? "#7B1FA2" : "var(--app-accent)") : "var(--app-text-tertiary)",
                      borderBottom: active ? `2px solid ${isInt ? "#7B1FA2" : "var(--app-accent)"}` : "2px solid transparent",
                      marginBottom: -1,
                    }}
                  >
                    {isInt && <Lock style={{ width: 13, height: 13 }} />}
                    <span>{t.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{t.desc}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: "12px 24px 8px" }}>
              <textarea
                ref={msgTextareaRef}
                value={msgInput}
                onChange={handleMsgInputChange}
                onKeyDown={(e) => {
                  if (showMacroDropdown) { handleMacroKeyDown(e); return; }
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { handleSend(); return; }
                  if (!internalMode && (e.metaKey || e.ctrlKey) && e.key === "1") {
                    e.preventDefault();
                    if (!isRegenerating && !sending) {
                      (async () => {
                        if (!selectedConvId) return;
                        setIsRegenerating(true);
                        try {
                          const res = await fetch(`/api/lunch/conversations/${selectedConvId}/regenerate`, { method: "POST" });
                          if (res.ok) { const d = await res.json(); setMsgInput(d.aiDraft || ""); toast.success("AI 답변 생성"); }
                          else toast.error("AI 생성 실패");
                        } catch { toast.error("AI 생성 오류"); }
                        finally { setIsRegenerating(false); }
                      })();
                    }
                    return;
                  }
                  if (!internalMode && (e.metaKey || e.ctrlKey) && e.key === "2") {
                    e.preventDefault();
                    if (!isPolishing && !sending && msgInput.trim()) {
                      (async () => {
                        if (!selectedConvId) return;
                        setIsPolishing(true);
                        try {
                          const res = await fetch(`/api/lunch/conversations/${selectedConvId}/polish`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ message: msgInput.trim() }),
                          });
                          if (res.ok) { const d = await res.json(); setMsgInput(d.polished); toast.success("메시지를 다듬었습니다"); }
                          else toast.error("말다듬기 실패");
                        } catch { toast.error("말다듬기 오류"); }
                        finally { setIsPolishing(false); }
                      })();
                    }
                    return;
                  }
                }}
                placeholder={internalMode ? "내부대화 (@이름 으로 멘션)..." : "AI 초안을 수정하거나 직접 작성하세요..."}
                disabled={sending}
                rows={3}
                style={{
                  width: "100%", resize: "vertical", minHeight: 60, maxHeight: 300,
                  fontSize: 16,
                  color: internalMode ? "#5D4037" : "var(--app-text-primary)",
                  backgroundColor: internalMode ? "#FFF8E1" : "var(--app-bg)",
                  borderRadius: 12, padding: "12px 16px",
                  border: internalMode ? "1px solid #FFD54F" : "1px solid var(--app-border)",
                  outline: "none", lineHeight: 1.6, opacity: sending ? 0.5 : 1, boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  if (internalMode) return;
                  e.currentTarget.style.borderColor = "var(--app-accent)";
                  e.currentTarget.style.backgroundColor = "var(--app-surface)";
                }}
                onBlur={(e) => {
                  if (internalMode) return;
                  e.currentTarget.style.borderColor = "var(--app-border)";
                  e.currentTarget.style.backgroundColor = "var(--app-bg)";
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingLeft: 4 }}>
                <span style={{ fontSize: 13, color: "var(--app-text-placeholder)" }}>Ctrl+Enter로 바로 전송</span>
              </div>
            </div>
            {mentionQuery !== null && (
              <MentionPicker
                query={mentionQuery}
                counselors={counselors}
                anchorRect={pickerAnchor}
                onSelect={(c) => {
                  const el = msgTextareaRef.current;
                  const liveValue = el?.value ?? msgInput;
                  const liveCaret = el?.selectionStart ?? liveValue.length;
                  const before = liveValue.slice(0, mentionStartPos);
                  const after = liveValue.slice(liveCaret);
                  const next = `${before}@${c.name} ${after}`;
                  setMsgInput(next);
                  setMentionQuery(null);
                  setMentionStartPos(-1);
                  requestAnimationFrame(() => {
                    const t = msgTextareaRef.current;
                    if (t) {
                      t.focus();
                      const caret = before.length + 1 + c.name.length + 1;
                      t.setSelectionRange(caret, caret);
                    }
                  });
                }}
                onCancel={() => { setMentionQuery(null); setMentionStartPos(-1); }}
              />
            )}

            {/* 버튼 바 — 방문수거와 동일 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 24px 16px" }}>
              {/* 전송 */}
              <button onClick={handleSend} disabled={sending || !msgInput.trim()} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 42,
                backgroundColor: (sending || !msgInput.trim())
                  ? "var(--app-border)"
                  : (internalMode ? "#7B1FA2" : "var(--app-btn-primary-bg, var(--app-accent))"),
                color: (sending || !msgInput.trim())
                  ? "var(--app-text-placeholder)"
                  : (internalMode ? "white" : "var(--app-btn-primary-text, white)"),
                borderRadius: 8, border: "none", fontSize: 16, fontWeight: 600,
                cursor: (sending || !msgInput.trim()) ? "default" : "pointer",
              }}>
                <Send style={{ width: 16, height: 16 }} />
                {sending ? "전송 중..." : (internalMode ? "내부 전송" : "전송")}
              </button>

              {/* AI 답변 (빈껍데기 — 나중에 연결) */}
              <button onClick={async () => {
                if (!selectedConvId || isRegenerating) return;
                setIsRegenerating(true);
                try {
                  const res = await fetch(`/api/lunch/conversations/${selectedConvId}/regenerate`, { method: "POST" });
                  if (res.ok) {
                    const data = await res.json();
                    setMsgInput(data.aiDraft || "");
                    toast.success("AI 답변이 생성되었습니다");
                  } else { toast.error("AI 생성 실패"); }
                } catch { toast.error("AI 생성 오류"); }
                finally { setIsRegenerating(false); }
              }} disabled={isRegenerating || sending || internalMode} title={internalMode ? "내부대화 모드에선 비활성" : undefined} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 42, padding: "0 16px",
                backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
                cursor: (isRegenerating || sending || internalMode) ? "default" : "pointer",
                opacity: (isRegenerating || sending || internalMode) ? 0.4 : 1,
              }}>
                <RefreshCw style={{ width: 15, height: 15, animation: isRegenerating ? "spin 1s linear infinite" : "none" }} />
                {isRegenerating ? "생성 중" : "AI 답변"}
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 2 }}>{modKey}1</span>
              </button>

              {/* 말다듬기 (빈껍데기 — 나중에 연결) */}
              <button onClick={async () => {
                if (!msgInput.trim() || !selectedConvId || isPolishing) return;
                setIsPolishing(true);
                try {
                  const res = await fetch(`/api/lunch/conversations/${selectedConvId}/polish`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: msgInput.trim() }),
                  });
                  if (res.ok) { const d = await res.json(); setMsgInput(d.polished); toast.success("메시지를 다듬었습니다"); }
                  else toast.error("말다듬기 실패");
                } catch { toast.error("말다듬기 오류"); }
                finally { setIsPolishing(false); }
              }} disabled={isPolishing || sending || !msgInput.trim() || internalMode} title={internalMode ? "내부대화 모드에선 비활성" : "말다듬기"} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 42, padding: "0 14px",
                backgroundColor: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)",
                borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
                cursor: (isPolishing || sending || !msgInput.trim() || internalMode) ? "default" : "pointer",
                opacity: (isPolishing || sending || !msgInput.trim() || internalMode) ? 0.4 : 1,
              }}>
                {isPolishing ? "다듬는 중" : "말다듬기"}
                <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 2 }}>{modKey}2</span>
              </button>

              {/* 직접작성 */}
              <button onClick={() => setMsgInput("")} disabled={sending} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                height: 42, padding: "0 16px",
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
                cursor: sending ? "default" : "pointer", opacity: sending ? 0.5 : 1,
              }}>
                <Edit3 style={{ width: 15, height: 15 }} />
                직접작성
              </button>

              {/* # 매크로 */}
              <button onClick={() => { setMacroHashPos(-1); setMacroSearch(""); setShowMacroDropdown(!showMacroDropdown); }} disabled={sending} title="매크로 (#)" style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 42, height: 42,
                backgroundColor: showMacroDropdown ? "var(--app-btn-primary-bg, var(--app-accent))" : "var(--app-surface-secondary)",
                color: showMacroDropdown ? "white" : "var(--app-text-secondary)",
                borderRadius: 8, border: "none", fontSize: 16, fontWeight: 600,
                cursor: sending ? "default" : "pointer", opacity: sending ? 0.5 : 1,
              }}>
                #
              </button>

              {/* 이미지 전송 */}
              {/* 파일 전송 */}
              <button onClick={() => docFileInputRef.current?.click()} disabled={sending} title="파일 전송" style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 42, height: 42,
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
                cursor: sending ? "default" : "pointer", opacity: sending ? 0.5 : 1,
              }}>
                <Paperclip style={{ width: 18, height: 18 }} />
              </button>
              <input ref={docFileInputRef} type="file" accept=".pdf,.xlsx,.xls,.doc,.docx,.hwp,.zip,.ppt,.pptx,.csv,.txt" onChange={handleFileSelect} style={{ display: "none" }} />

              {/* 이미지 전송 */}
              <button onClick={() => fileInputRef.current?.click()} disabled={sending} title="이미지 전송" style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 42, height: 42,
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
                borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
                cursor: sending ? "default" : "pointer", opacity: sending ? 0.5 : 1,
              }}>
                <ImageIcon style={{ width: 18, height: 18 }} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: "none" }} />
            </div>
            </>
            )}
          </div>
        </div>
      ) : chatTab === "orders" && selected ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--app-bg)" }}>
          <div style={{ textAlign: "center" }}>
            <Package style={{ width: 48, height: 48, margin: "0 auto 12px", color: "var(--app-text-placeholder)" }} />
            <p style={{ fontSize: 15, color: "var(--app-text-tertiary)", fontWeight: 500, margin: 0 }}>주문 상세는 오른쪽 패널에서 확인하세요</p>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--app-bg)" }}>
          <div style={{ textAlign: "center" }}>
            <Inbox style={{ width: 48, height: 48, margin: "0 auto 12px", color: "var(--app-text-placeholder)" }} />
            <p style={{ fontSize: 15, color: "var(--app-text-tertiary)", fontWeight: 500, margin: 0 }}>
              {chatTab === "chat" ? "대화를 선택해주세요" : "주문을 선택해주세요"}
            </p>
          </div>
        </div>
      )}

      {/* ══ Right Panel — 방문수거 스타일 3탭 (정보/견적/예약) ══ */}
      {chatTab === "chat" && selectedConv && (
        <div style={{ width: 320, borderLeft: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>

          {/* ── 헤더: 지점명/연락처 (방문수거 CustomerPanel 스타일) ── */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--app-border)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {/* 지점명 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", fontWeight: 600, marginBottom: 2 }}>지점명</div>
                {editingField === "vendorName" ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input value={fieldInput} onChange={(e) => setFieldInput(e.target.value)} autoFocus
                      style={{ width: "100%", padding: "3px 6px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 4, outline: "none" }}
                      onKeyDown={(e) => { if (e.key === "Enter") saveConvField("vendorName", fieldInput); if (e.key === "Escape") setEditingField(null); }} />
                    <button onClick={() => saveConvField("vendorName", fieldInput)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                      <Check style={{ width: 12, height: 12, color: "#059669" }} /></button>
                    <button onClick={() => setEditingField(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                      <X style={{ width: 12, height: 12, color: "var(--app-text-tertiary)" }} /></button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                    onClick={() => { setEditingField("vendorName"); setFieldInput(selectedConv.vendorName || ""); }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: selectedConv.vendorName ? "var(--app-text-primary)" : "var(--app-text-placeholder)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedConv.vendorName || "미등록"}
                    </span>
                    <Pencil style={{ width: 11, height: 11, color: "var(--app-text-placeholder)", flexShrink: 0 }} />
                  </div>
                )}
              </div>
              {/* 연락처 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: "var(--app-text-placeholder)", fontWeight: 600, marginBottom: 2 }}>사장님 연락처</div>
                {editingField === "phone" ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input value={fieldInput} onChange={(e) => setFieldInput(e.target.value)} autoFocus
                      style={{ width: "100%", padding: "3px 6px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 4, outline: "none" }}
                      onKeyDown={(e) => { if (e.key === "Enter") saveConvField("phone", fieldInput); if (e.key === "Escape") setEditingField(null); }} />
                    <button onClick={() => saveConvField("phone", fieldInput)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                      <Check style={{ width: 12, height: 12, color: "#059669" }} /></button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
                    onClick={() => { setEditingField("phone"); setFieldInput(selectedConv.phone || ""); }}>
                    <span style={{ fontSize: 13, color: selectedConv.phone ? "var(--app-text-primary)" : "var(--app-text-placeholder)" }}>
                      {selectedConv.phone || "미등록"}
                    </span>
                    <Pencil style={{ width: 11, height: 11, color: "var(--app-text-placeholder)", flexShrink: 0 }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 탭 바: 정보 / 견적 / 예약 (방문수거와 동일) ── */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--app-border)", flexShrink: 0 }}>
            {([
              { key: "info" as const, label: "정보", icon: ClipboardList, badge: 0 },
              { key: "quote" as const, label: "견적", icon: Calculator, badge: 0 },
              { key: "orders" as const, label: "예약", icon: CalendarCheck, badge: convOrders.length },
            ]).map(({ key, label, icon: Icon, badge }) => (
              <button key={key} onClick={() => setRightTab(key)} style={{
                flex: 1, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                fontSize: 13, fontWeight: 500,
                color: rightTab === key ? "var(--app-accent)" : "var(--app-text-tertiary)",
                backgroundColor: "transparent", border: "none", cursor: "pointer",
                borderBottom: rightTab === key ? "2px solid var(--app-accent)" : "2px solid transparent",
              }}>
                <Icon style={{ width: 14, height: 14 }} />
                {label}
                {badge !== undefined && badge > 0 && (
                  <span style={{ minWidth: 16, height: 16, borderRadius: 8, backgroundColor: "#F57C00", color: "#fff", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── 탭 콘텐츠 (스크롤) ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>

          {/* ═══ 정보 탭 ═══ */}
          {rightTab === "info" && (
          <>
            {/* 고객 상세 — 방문수거와 동일 */}
            <div style={{ padding: 20, borderBottom: "1px solid var(--app-border-light)" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", margin: "0 0 12px" }}>고객 상세</h4>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 15 }}>
                <span style={{ color: "var(--app-text-tertiary)", width: 70, flexShrink: 0 }}>식별키</span>
                <span style={{ color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{selectedConv.userKey || selectedConv.sessionId}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 15 }}>
                <span style={{ color: "var(--app-text-tertiary)", width: 70, flexShrink: 0 }}>최근 접속</span>
                <span style={{ color: "var(--app-text-primary)", textAlign: "right" }}>
                  {new Date(selectedConv.updatedAt).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            </div>

            {/* 벤더 정보 */}
            {convVendor && (
            <div style={{ padding: 20, borderBottom: "1px solid var(--app-border-light)" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", margin: "0 0 12px" }}>벤더 정보</h4>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 15 }}>
                <span style={{ color: "var(--app-text-tertiary)", width: 70, flexShrink: 0 }}>주소</span>
                <span style={{ color: "var(--app-text-primary)", textAlign: "right", wordBreak: "break-all" }}>{convVendor.address || "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 15 }}>
                <span style={{ color: "var(--app-text-tertiary)", width: 70, flexShrink: 0 }}>정산방식</span>
                <span style={{ fontSize: 13, fontWeight: 600, padding: "2px 10px", borderRadius: 12,
                  backgroundColor: convVendor.settlementType === "link_pay" ? "#E8F7FF" : convVendor.settlementType === "tax_invoice" ? "#EFF6FF" : "#FDF4FF",
                  color: convVendor.settlementType === "link_pay" ? "#1AA3FF" : convVendor.settlementType === "tax_invoice" ? "#2563EB" : "#9333EA",
                }}>{SETTLEMENT_LABELS[convVendor.settlementType]}</span>
              </div>
            </div>
            )}

            {/* 상담 메모 */}
            <div style={{ padding: 20, borderBottom: "1px solid var(--app-border-light)" }}>
              <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", margin: "0 0 12px" }}>상담 이력</h4>
              <textarea value={convMemo} onChange={(e) => setConvMemo(e.target.value)}
                rows={4} placeholder="상담 메모를 입력하세요..."
                style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", resize: "vertical", boxSizing: "border-box", backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)" }}
              />
              <button onClick={saveConvMemo} disabled={savingMemo} style={{
                marginTop: 8, width: "100%", height: 36, borderRadius: 8, border: "none", cursor: "pointer",
                backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                fontSize: 14, fontWeight: 500,
              }}>{savingMemo ? "저장 중..." : "메모 저장"}</button>
            </div>

            {/* 디버그 / 관리 */}
            <div style={{ padding: "12px 20px" }}>
              <button onClick={() => setShowDebug(!showDebug)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 10px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8,
                border: "1px solid var(--app-border)", cursor: "pointer", fontSize: 12, color: "var(--app-text-tertiary)",
              }}>
                <span style={{ fontWeight: 600 }}>디버그 / 관리</span>
                <ChevronUp style={{ width: 14, height: 14, transition: "transform 0.2s", transform: showDebug ? "rotate(0deg)" : "rotate(180deg)" }} />
              </button>
              {showDebug && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => {
                    const msgs = selectedConv.messages ?? [];
                    const recentMsgs = msgs.slice(-20).map((m) => {
                      const time = new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
                      const prefix = m.role === "user" ? "벤더" : (m.sentBy || "상담사");
                      return `[${time}] ${prefix}: ${m.content}`;
                    }).join("\n");
                    const debugText = [
                      `=== 런치 디버깅 정보 ===`,
                      `세션: ${selectedConv.sessionId}`,
                      `식별키: ${selectedConv.userKey}`,
                      `Status: ${selectedConv.status}`,
                      `지점명: ${selectedConv.vendorName || "미등록"} | 연락처: ${selectedConv.phone || "-"}`,
                      `벤더ID: ${selectedConv.vendorId || "미연결"}`,
                      convVendor ? `주소: ${convVendor.address || "-"}\n정산: ${convVendor.settlementType}` : "",
                      ``,
                      `--- 연결된 주문 (${convOrders.length}건) ---`,
                      convOrders.map(o => `#${o.orderNumber} ${o.date} ${o.status} ${o.totalAmount.toLocaleString()}원`).join("\n") || "없음",
                      ``,
                      `--- 최근 대화 (${msgs.length}건 중 최근 20건) ---`,
                      recentMsgs,
                      ``,
                      `메모: ${selectedConv.memo || "없음"}`,
                      `생성: ${new Date(selectedConv.createdAt).toLocaleString("ko-KR")}`,
                      `수정: ${new Date(selectedConv.updatedAt).toLocaleString("ko-KR")}`,
                    ].filter(Boolean).join("\n");
                    navigator.clipboard.writeText(debugText).then(() => toast.success("디버깅 정보가 복사되었습니다"));
                  }} style={{
                    flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                    borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}>
                    <ClipboardCopy style={{ width: 12, height: 12 }} />
                    디버깅 복사
                  </button>
                  <button onClick={async () => {
                    if (!confirm("이 대화를 완전히 삭제합니다. 계속하시겠습니까?")) return;
                    try {
                      const res = await fetch(`/api/lunch/conversations/${selectedConv.sessionId}`, { method: "DELETE" });
                      if (!res.ok) throw new Error();
                      toast.success("대화가 삭제되었습니다");
                      setSelectedConvId(null); setSelectedConv(null);
                      fetchConversations(); onRefresh();
                    } catch { toast.error("삭제 실패"); }
                  }} style={{
                    flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    backgroundColor: "var(--app-btn-danger-bg)", color: "var(--app-btn-danger-text)",
                    borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                    삭제
                  </button>
                </div>
              )}
            </div>
          </>
          )}

          {/* ═══ 견적 탭 ═══ */}
          {rightTab === "quote" && (
          <div style={{ padding: 20 }}>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", margin: "0 0 14px" }}>견적 계산</h4>

            {/* 지역 — 자동완성 입력 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>지역 (구/시)</div>
              <div style={{ position: "relative" }}>
                <input
                  value={quoteForm.region}
                  onChange={(e) => setQuoteForm(f => ({ ...f, region: e.target.value }))}
                  placeholder="지역명 입력 (예: 강남구)"
                  style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }}
                />
                {quoteForm.region && !regionPrices.some(rp => rp.region === quoteForm.region) && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, marginTop: 4,
                    backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
                    borderRadius: 8, boxShadow: "var(--app-shadow-lg)", maxHeight: 180, overflowY: "auto",
                  }}>
                    {regionPrices.filter(rp => rp.region && rp.region.includes(quoteForm.region)).slice(0, 10).map(rp => (
                      <div key={rp.region} onClick={() => setQuoteForm(f => ({ ...f, region: rp.region }))}
                        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}>
                        <span style={{ fontWeight: 500, color: "var(--app-text-primary)" }}>{rp.region}</span>
                        <span style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>{rp.price1.toLocaleString()}원</span>
                      </div>
                    ))}
                    {regionPrices.filter(rp => rp.region && rp.region.includes(quoteForm.region)).length === 0 && (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--app-text-placeholder)", textAlign: "center" }}>일치하는 지역 없음</div>
                    )}
                  </div>
                )}
                {quoteForm.region && regionPrices.some(rp => rp.region === quoteForm.region) && (
                  <div style={{ fontSize: 11, color: "var(--app-accent)", marginTop: 4 }}>
                    {quoteForm.region} — 출장비 {(regionPrices.find(rp => rp.region === quoteForm.region)?.price1 ?? 0).toLocaleString()}원
                  </div>
                )}
              </div>
            </div>

            {/* 시간대 — 오전/오후 + 야간 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>시간대</div>
              <div style={{ display: "flex", gap: 6 }}>
                {([{ label: "오전/오후", value: "오후" }, { label: "야간", value: "야간" }]).map(({ label, value }) => {
                  const isActive = value === "야간" ? quoteForm.timeType === "야간" : quoteForm.timeType !== "야간";
                  return (
                    <button key={value} onClick={() => setQuoteForm(f => ({ ...f, timeType: value }))} style={{
                      flex: 1, padding: "8px 0", fontSize: 13, fontWeight: isActive ? 600 : 400, borderRadius: 8, cursor: "pointer",
                      backgroundColor: isActive ? (value === "야간" ? "var(--app-tag-purple-bg)" : "var(--app-tag-blue-bg)") : "var(--app-bg)",
                      color: isActive ? (value === "야간" ? "var(--app-tag-purple-text)" : "var(--app-accent)") : "var(--app-text-secondary)",
                      border: isActive ? "none" : "1px solid var(--app-border)",
                    }}>{label}</button>
                  );
                })}
              </div>
              {quoteForm.timeType === "야간" && (
                <div style={{ fontSize: 11, color: "var(--app-tag-purple-text)", marginTop: 4, fontWeight: 500 }}>야간: 출장비 없음, 최소 10,000원</div>
              )}
            </div>

            {/* 도시락 개수 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>도시락 개수</div>
              <input value={quoteForm.boxCount} onChange={(e) => setQuoteForm(f => ({ ...f, boxCount: e.target.value }))}
                placeholder="50" type="number" style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* 선별가격 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", marginBottom: 5 }}>선별가격 (개당)</div>
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {[{ l: "500", v: "500" }, { l: "450", v: "450" }, { l: "400", v: "400" }, { l: "직접", v: "" }].map(({ l, v }) => {
                  const on = v ? quoteForm.sortingPrice === v : !["500","450","400"].includes(quoteForm.sortingPrice);
                  return <button key={l} onClick={() => setQuoteForm(f => ({ ...f, sortingPrice: v }))} style={{
                    flex: 1, padding: "7px 0", fontSize: 12, fontWeight: on ? 600 : 400, borderRadius: 6, cursor: "pointer",
                    backgroundColor: on ? "var(--app-accent)" : "var(--app-bg)", color: on ? "white" : "var(--app-text-secondary)",
                    border: on ? "none" : "1px solid var(--app-border)",
                  }}>{l}</button>;
                })}
              </div>
              {!["500","450","400"].includes(quoteForm.sortingPrice) && (
                <input value={quoteForm.sortingPrice} onChange={(e) => setQuoteForm(f => ({ ...f, sortingPrice: e.target.value }))}
                  placeholder="직접 입력" type="number" style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 8, outline: "none", boxSizing: "border-box" }} />
              )}
            </div>

            {/* 계산 결과 */}
            {(() => {
              const boxes = parseInt(quoteForm.boxCount) || 0;
              const sorting = parseInt(quoteForm.sortingPrice) || 0;
              const isNight = quoteForm.timeType === "야간";
              const rp = regionPrices.find(r => r.region === quoteForm.region);
              const tripFee = isNight ? 0 : (rp ? (boxes < 100 ? (rp.lunchSmall ?? rp.price1) : rp.price1) : 0);
              const sortingTotal = sorting * boxes;
              const total = isNight ? Math.max(sortingTotal, boxes > 0 ? 10000 : 0) : (tripFee + sortingTotal);
              return (
                <div style={{ backgroundColor: "var(--app-bg)", borderRadius: 10, padding: 14 }}>
                  {!isNight && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>출장비{boxes > 0 && boxes < 100 ? " (100↓)" : ""}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>{tripFee.toLocaleString()}원</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>선별비 ({sorting} x {boxes})</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)" }}>{sortingTotal.toLocaleString()}원</span>
                  </div>
                  {isNight && sortingTotal < 10000 && boxes > 0 && (
                    <div style={{ fontSize: 11, color: "var(--app-tag-purple-text)", marginBottom: 6 }}>야간 최소 10,000원</div>
                  )}
                  <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>총 견적금액</span>
                    <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-accent)" }}>{total.toLocaleString()}원</span>
                  </div>
                </div>
              );
            })()}

            <button onClick={() => {
              const boxes = parseInt(quoteForm.boxCount) || 0; const sorting = parseInt(quoteForm.sortingPrice) || 0;
              const isNight = quoteForm.timeType === "야간"; const rp = regionPrices.find(r => r.region === quoteForm.region);
              const tripFee = isNight ? 0 : (rp ? (boxes < 100 ? (rp.lunchSmall ?? rp.price1) : rp.price1) : 0);
              const sortingTotal = sorting * boxes; const total = isNight ? Math.max(sortingTotal, boxes > 0 ? 10000 : 0) : (tripFee + sortingTotal);
              const text = [`[견적 안내]`, ``, `지역: ${quoteForm.region || "-"}`, `시간대: ${quoteForm.timeType}`, `도시락: ${boxes}개`, `선별: ${sorting.toLocaleString()}원/개`,
                ...(!isNight ? [`출장비: ${tripFee.toLocaleString()}원`] : []), ``, `총 금액: ${total.toLocaleString()}원`].join("\n");
              navigator.clipboard.writeText(text); toast.success("견적 복사됨");
            }} style={{
              width: "100%", marginTop: 12, height: 40, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              backgroundColor: "var(--app-accent)", color: "white", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>
              <FileText style={{ width: 14, height: 14 }} /> 견적 복사
            </button>
          </div>
          )}

          {/* ═══ 예약 탭 ═══ */}
          {rightTab === "orders" && (
          <div style={{ padding: 20 }}>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)", margin: "0 0 12px" }}>주문 관리</h4>

            {convOrders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <CalendarCheck style={{ width: 20, height: 20, margin: "0 auto 8px", color: "var(--app-text-placeholder)", opacity: 0.5 }} />
                <p style={{ fontSize: 14, color: "var(--app-text-placeholder)", margin: 0 }}>연결된 주문 없음</p>
              </div>
            ) : (
              <>
                {/* 활성 주문 (일정확정 + 결제요청) */}
                {activeOrders.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {activeOrders.map((o) => (
                      <OrderCard key={o.id} o={o} formatAmount={formatAmount} onPaymentOrder={onPaymentOrder} onEditOrder={onEditOrder} />
                    ))}
                  </div>
                )}

                {/* 지난 주문 (정산완료 + 취소) — 접기 */}
                {pastOrders.length > 0 && (
                  <div style={{ marginTop: activeOrders.length > 0 ? 16 : 0 }}>
                    <button onClick={() => setShowPastOrders(!showPastOrders)} style={{
                      width: "100%", padding: "8px 12px", borderRadius: 8,
                      backgroundColor: "var(--app-surface-secondary)", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontSize: 13, fontWeight: 500, color: "var(--app-text-secondary)",
                    }}>
                      <span>지난 주문 ({pastOrders.length})</span>
                      {showPastOrders ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
                    </button>
                    {showPastOrders && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                        {pastOrders.map((o) => (
                          <OrderCard key={o.id} o={o} formatAmount={formatAmount} onPaymentOrder={onPaymentOrder} onEditOrder={onEditOrder} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* 주문 추가 버튼 — 바로 신규등록 모달 띄움 */}
            <button onClick={() => onCreateOrder(convVendor?.id, convVendor?.name, selectedConv?.aiOrderData, selectedConv?.sessionId)} style={{
              width: "100%", height: 36, marginTop: 12, borderRadius: 8,
              backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)",
              border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <CalendarCheck style={{ width: 14, height: 14 }} />
              {convOrders.length > 0 ? "주문 추가 등록" : "주문 등록"}
            </button>
          </div>
          )}

          </div>
        </div>
      )}

      {/* 이미지 라이트박스 */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{
          position: "fixed", inset: 0, zIndex: 9999,
          backgroundColor: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "zoom-out",
        }}>
          {/* 닫기 버튼 */}
          <button onClick={() => setLightboxUrl(null)} style={{
            position: "absolute", top: 20, right: 20,
            width: 40, height: 40, borderRadius: "50%",
            background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X style={{ width: 20, height: 20, color: "white" }} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="이미지"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw", maxHeight: "90vh",
              borderRadius: 8, objectFit: "contain", cursor: "default",
              boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
            }}
          />
        </div>
      )}

      {/* Right Panel - Order Detail (예약 탭에서만 표시) */}
      {chatTab === "orders" && selected && (
        <div style={{
          width: 320, borderLeft: "1px solid var(--app-border)",
          backgroundColor: "var(--app-surface)", display: "flex", flexDirection: "column",
          overflow: "hidden", flexShrink: 0,
        }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>{selected.vendorName}</h3>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
                  backgroundColor: STATUS_COLORS[selected.status].bg,
                  color: STATUS_COLORS[selected.status].text,
                }}>{STATUS_LABELS[selected.status]}</span>
              </div>
            </div>

            {/* Vendor Info */}
            {vendor && (
              <div style={{ padding: "0 20px", marginBottom: 16 }}>
                <div style={{
                  backgroundColor: "var(--app-bg)", borderRadius: 10, padding: 14,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 2 }}>지점 정보</div>
                  <DetailRow label="주소" value={vendor.address || "-"} />
                  <DetailRow label="연락처" value={formatPhone(vendor.ownerPhone)} />
                  <DetailRow label="정산방식" value={SETTLEMENT_LABELS[vendor.settlementType] || "-"} />
                  {vendor.memo && <DetailRow label="메모" value={vendor.memo} />}
                </div>
              </div>
            )}

            {/* Order Info */}
            <div style={{ padding: "0 20px", marginBottom: 16 }}>
              <div style={{
                backgroundColor: "var(--app-bg)", borderRadius: 10, padding: 14,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 2 }}>주문 정보</div>
                <DetailRow label="순번" value={selected.orderNumber} />
                <DetailRow label="날짜" value={selected.date} />
                <DetailRow label="수거시간" value={selected.pickupTime || "-"} />
                <DetailRow label="수거주소" value={selected.pickupAddress || "-"} />
                <DetailRow label="개수" value={selected.boxCount || "-"} />
                <DetailRow label="현장 담당자" value={selected.siteContact || "-"} />
                <DetailRow label="비고" value={selected.notes || "-"} />
              </div>
            </div>

            {/* Payment Info */}
            <div style={{ padding: "0 20px", marginBottom: 16 }}>
              <div style={{
                backgroundColor: "var(--app-bg)", borderRadius: 10, padding: 14,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 2 }}>결제 정보</div>
                <DetailRow label="정산금액" value={formatAmount(selected.totalAmount)} />
                <DetailRow label="선별가격" value={formatAmount(selected.sortingPrice)} />
                <DetailRow label="정산방식" value={SETTLEMENT_LABELS[selected.settlementType]} />
                <DetailRow label="수거완료" value={selected.isPickedUp ? "완료" : "미완료"} />
                <DetailRow label="매출발행" value={selected.invoiceIssued ? "발행 완료" : "미발행"} />
                {selected.paymentIds.length > 0 && (
                  <DetailRow label="결제요청" value={`${selected.paymentIds.length}건`} />
                )}
                {selected.settlementType === "link_pay" && (
                  <button
                    onClick={() => onPaymentOrder(selected)}
                    style={{
                      width: "100%", marginTop: 6, padding: "7px 0", borderRadius: 8,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      backgroundColor: selected.paymentIds.length > 0 ? "var(--app-tag-purple-bg)" : "var(--app-tag-blue-bg)",
                      color: selected.paymentIds.length > 0 ? "var(--app-tag-purple-text)" : "var(--app-accent)",
                      border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <CreditCard style={{ width: 14, height: 14 }} />
                    {selected.paymentIds.length > 0 ? "결제 확인 / 재발송" : "결제 요청"}
                  </button>
                )}
              </div>
            </div>

            {/* Tax Invoice Section — 링크페이가 아닌 경우만 */}
            {vendor && vendor.settlementType !== "link_pay" && (
              <TaxInvoiceSection vendor={vendor} order={selected} onVendorUpdate={onRefresh} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
