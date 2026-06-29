"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Loader2, Send, Lock, FileText, ImageIcon, Sparkles, ChevronDown, ChevronLeft, ChevronRight, X, Hash, Bot, Copy, UserPlus, XCircle, Zap, Clock, ExternalLink, Bold, Italic, Link2, AtSign, Check, RefreshCw, Pencil, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import type { CTChat, CTMessage, CTMessageFile } from "./types";
import type { BackofficeSummary } from "./ToolPanel";
import { formatTime, getTagColor } from "./utils";
import { CATEGORY_LABELS } from "@/lib/channeltalk-ai/category-labels";
import type { Category } from "@/lib/channeltalk-ai/normalize";
import AiCompareModal from "./AiCompareModal";
import { classifyReply, type ReplyKind } from "@/lib/utils/reply-classify";

// 커버링톡 상담사 목록 (멘션용 — 채널톡 매니저에 없을 수 있는 계정 포함)
const COVERING_COUNSELORS: Array<{ id: string; name: string }> = [
  { id: "ct-teddy", name: "테디" },
  { id: "ct-ryan", name: "라이언" },
  { id: "ct-merida", name: "메리다" },
  { id: "ct-tommy", name: "토미" },
  { id: "ct-goldship", name: "골드쉽" },
];

// 카테고리 배지 인라인 색상 (Tailwind 대신)
const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  "이용_배출품목": { bg: "#DBEAFE", color: "#1D4ED8" },
  "이용_대형폐기물": { bg: "#E0E7FF", color: "#4338CA" },
  "이용_서비스안내": { bg: "#CFFAFE", color: "#0E7490" },
  "이용_주문관리": { bg: "#E0F2FE", color: "#0369A1" },
  "구독_관리": { bg: "#F3E8FF", color: "#7C3AED" },
  "배송_현황": { bg: "#D1FAE5", color: "#047857" },
  "배송_이슈": { bg: "#CCFBF1", color: "#0F766E" },
  "미수거_정책위반": { bg: "#FFEDD5", color: "#C2410C" },
  "미수거_누락": { bg: "#FEE2E2", color: "#B91C1C" },
  "미수거_출입실패": { bg: "#FFE4E6", color: "#BE123C" },
  "결제_안내": { bg: "#FEF3C7", color: "#B45309" },
  "결제_이슈": { bg: "#FEF9C3", color: "#A16207" },
  "앱_오류": { bg: "#F1F5F9", color: "#475569" },
  "수거_확인": { bg: "#ECFCCB", color: "#4D7C0F" },
  "오인수거": { bg: "#FCE7F3", color: "#BE185D" },
  "계정_정보": { bg: "#EDE9FE", color: "#6D28D9" },
  "쿠폰": { bg: "#FAE8FF", color: "#A21CAF" },
  "VOC": { bg: "#FEE2E2", color: "#DC2626" },
  "기타": { bg: "#F3F4F6", color: "#4B5563" },
  "빼기주문": { bg: "#F5F5F4", color: "#44403C" },
};
const DEFAULT_BADGE = { bg: "#F3F4F6", color: "#4B5563" };

type SendMode = "enter" | "cmd_enter";

interface Macro {
  id: number;
  name: string;
  content: string;
  category: string;
}

// 매크로 이미지 매핑 (매크로 발송 후 자동으로 이미지 전송)
const MACRO_IMAGES: Record<string, { url: string; fileName: string }> = {
  "배출품목_종이박스": {
    url: "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/macro-images/box.png",
    fileName: "box.png",
  },
  "대형봉투_크기": {
    url: "https://nnxaqmeavmcvyqhehuvn.supabase.co/storage/v1/object/public/images/macro-images/size.png",
    fileName: "size.png",
  },
};

export interface AiDraft {
  answer: string;
  category?: string;
  canAnswer?: boolean;
  reason?: string;
  generatedAt: number;
}

interface MessagePanelProps {
  selectedChat: CTChat | null;
  messages: CTMessage[];
  msgLoading: boolean;
  onSend: (message: string, options?: { isInternal?: boolean; mentionedManagerIds?: string[]; mentionedNames?: string[]; replyKind?: ReplyKind; draftCharOverlap?: number }) => Promise<void>;
  onUploadImage?: (chatId: string, file: File, isInternal?: boolean) => Promise<void>;
  onAssign?: () => void;
  onCloseChat?: (chatId: string) => void;
  onTagsUpdate?: (chatId: string, newTags: string[]) => void;
  onToggleToolPanel?: () => void;
  toolPanelOpen?: boolean;
  backofficeSummary?: BackofficeSummary | null;
  preloadedDraft?: AiDraft | null;
  onDeleteMessage?: (chatId: string, messageId: string) => Promise<void>;
  presenceViewers?: { name: string; typing: boolean }[];
  onTypingChange?: (typing: boolean) => void;
}

export default function MessagePanel({ selectedChat, messages, msgLoading, onSend, onUploadImage, onAssign, onCloseChat, onTagsUpdate, onToggleToolPanel, toolPanelOpen, backofficeSummary, preloadedDraft, onDeleteMessage, presenceViewers, onTypingChange }: MessagePanelProps) {
  // 채팅방별 작성 중 텍스트 + 내부대화 모드 보존
  const [inputMap, setInputMap] = useState<Record<string, string>>({});
  const [internalMap, setInternalMap] = useState<Record<string, boolean>>({});
  const _chatId = selectedChat?.id ?? "";
  const input = _chatId ? (inputMap[_chatId] ?? "") : "";
  const setInput = useCallback((valOrFn: string | ((prev: string) => string)) => {
    if (!_chatId) return;
    setInputMap(prev => {
      const cur = prev[_chatId] ?? "";
      const next = typeof valOrFn === "function" ? valOrFn(cur) : valOrFn;
      if (next === cur) return prev;
      return { ...prev, [_chatId]: next };
    });
  }, [_chatId]);
  const [sending, setSending] = useState(false);

  // typing presence: 입력 시 true, 2초 무입력 시 false
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTypingPresence = useCallback((hasText: boolean) => {
    if (!onTypingChange) return;
    if (hasText) {
      onTypingChange(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => onTypingChange(false), 2000);
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      onTypingChange(false);
    }
  }, [onTypingChange]);

  // 전송 완료 시 typing 해제
  useEffect(() => {
    if (!sending) return;
    handleTypingPresence(false);
  }, [sending, handleTypingPresence]);

  const isInternal = _chatId ? (internalMap[_chatId] ?? false) : false;
  const setIsInternal = useCallback((val: boolean) => {
    if (!_chatId) return;
    setInternalMap(prev => ({ ...prev, [_chatId]: val }));
  }, [_chatId]);
  const [sendMode, setSendMode] = useState<SendMode>("enter");
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  // 채팅방별 이미지 파일 보존
  const [imageFilesMap, setImageFilesMap] = useState<Record<string, File[]>>({});
  const [imagePreviewsMap, setImagePreviewsMap] = useState<Record<string, (string | null)[]>>({});
  const imageFiles = _chatId ? (imageFilesMap[_chatId] ?? []) : [];
  const imagePreviews = _chatId ? (imagePreviewsMap[_chatId] ?? []) : [];
  const setImageFiles = useCallback((valOrFn: File[] | ((prev: File[]) => File[])) => {
    if (!_chatId) return;
    setImageFilesMap(prev => {
      const cur = prev[_chatId] ?? [];
      const next = typeof valOrFn === "function" ? valOrFn(cur) : valOrFn;
      return { ...prev, [_chatId]: next };
    });
  }, [_chatId]);
  const setImagePreviews = useCallback((valOrFn: (string | null)[] | ((prev: (string | null)[]) => (string | null)[])) => {
    if (!_chatId) return;
    setImagePreviewsMap(prev => {
      const cur = prev[_chatId] ?? [];
      const next = typeof valOrFn === "function" ? valOrFn(cur) : valOrFn;
      return { ...prev, [_chatId]: next };
    });
  }, [_chatId]);
  const [isUploadingSending, setIsUploadingSending] = useState(false);
  // 매크로(#) 템플릿
  const [macros, setMacros] = useState<Macro[]>([]);
  const [showMacroDropdown, setShowMacroDropdown] = useState(false);
  const [macroSearch, setMacroSearch] = useState("");
  const [macroHashPos, setMacroHashPos] = useState(-1);
  const [focusedMacroIndex, setFocusedMacroIndex] = useState(0);
  const [pendingMacroImage, setPendingMacroImage] = useState<{ url: string; fileName: string } | null>(null);
  // 상담사 배정
  const [managers, setManagers] = useState<Array<{ id: string; name: string; avatarUrl?: string }>>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagUpdating, setTagUpdating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [closing, setClosing] = useState(false);
  // 유저 이름 수정
  const [editingUserName, setEditingUserName] = useState(false);
  const [editUserNameValue, setEditUserNameValue] = useState("");
  const [savingUserName, setSavingUserName] = useState(false);
  const [showSnoozeDropdown, setShowSnoozeDropdown] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [showSnoozeCustom, setShowSnoozeCustom] = useState(false);
  const [snoozeCustomDate, setSnoozeCustomDate] = useState("");
  const [snoozeCustomTime, setSnoozeCustomTime] = useState("09:00");
  const snoozeDropdownRef = useRef<HTMLDivElement>(null);
  const [allConsultationTags, setAllConsultationTags] = useState<string[]>([]);
  // AI 추천 답변
  const [aiCategory, setAiCategory] = useState<Category | null>(null);
  const [aiCategoryHistory, setAiCategoryHistory] = useState<string[]>([]);
  const [aiCanAnswer, setAiCanAnswer] = useState(true);
  const [aiReason, setAiReason] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraftActive, setAiDraftActive] = useState(false); // AI 초안 표시 상태
  const [aiDraftContent, setAiDraftContent] = useState(""); // AI 초안 내용 (textarea와 분리)
  // "채택" 누른 뒤에도 send 시점까지 분류용 원본 draft 보관 — 없으면 분류가 항상 human 으로 떨어짐.
  // 다음 시점에 null 로 리셋: 송신 완료 / 재생성 / 닫기 / 새 draft 도착.
  const lastDraftForCompareRef = useRef<string | null>(null);
  // AI 추천은 항상 ON — 운영 정책상 OFF 불가 (사전 생성된 답변이 누락되지 않도록).
  // setAiSuggestVisible 은 보존 호환성 위해 noop 로 남김 (다른 코드 변경 최소화).
  const aiSuggestVisible = true;
  const setAiSuggestVisible = (_v: boolean) => { void _v; };
  const [aiMode, setAiMode] = useState<"combined" | "default" | "policy-only" | "prompt-only">("combined");
  const [showAiModeMenu, setShowAiModeMenu] = useState(false);
  const aiModeMenuRef = useRef<HTMLDivElement>(null);
  const [aiPendingSuggestion, setAiPendingSuggestion] = useState<string | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareMessage, setCompareMessage] = useState("");
  // 이미지 갤러리 모달
  const [galleryImages, setGalleryImages] = useState<{ url: string; name: string }[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [showGallery, setShowGallery] = useState(false);
  // 이모지 선택
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [emojiCategory, setEmojiCategory] = useState("recent");
  const [emojiSearch, setEmojiSearch] = useState("");
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("ct_recent_emojis") ?? "[]"); } catch { return []; }
  });
  // @멘션
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionAtPos, setMentionAtPos] = useState(-1);
  const [focusedMentionIndex, setFocusedMentionIndex] = useState(0);
  const [mentionMappings, setMentionMappings] = useState<Map<string, string>>(new Map()); // displayName → managerId
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const userScrolledUpRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendOptionsRef = useRef<HTMLDivElement>(null);
  const macroDropdownRef = useRef<HTMLDivElement>(null);

  // 상담 설명
  const [description, setDescription] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const [descSaved, setDescSaved] = useState(false);
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 채팅 변경 시 채널톡에서 가져온 설명 로드
  useEffect(() => {
    setDescription(selectedChat?.description ?? "");
  }, [selectedChat?.id, selectedChat?.description]);


  const saveDescription = useCallback(async (chatId: string, desc: string) => {
    setDescSaving(true);
    try {
      const res = await fetch(`/api/channeltalk/chats/${chatId}/description`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      if (!res.ok) throw new Error();
      setDescSaved(true);
      setTimeout(() => setDescSaved(false), 2000);
    } catch {
      toast.error("상담 설명 저장 실패");
    } finally {
      setDescSaving(false);
    }
  }, []);

  // 상담사별 설정 로드 + 매크로 fetch
  useEffect(() => {
    fetch("/api/auth/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.ctSendMode) setSendMode(d.ctSendMode as SendMode);
        // ctAiSuggestVisible 무시 — AI 추천은 항상 ON 강제
      })
      .catch(() => {});
    fetch("/api/macros")
      .then((r) => r.json())
      .then((d) => setMacros(d.macros ?? []))
      .catch(() => {});
    fetch("/api/channeltalk/tags")
      .then((r) => r.json())
      .then((d) => setAllConsultationTags((d.tags ?? []).map((t: { tag: string }) => t.tag)))
      .catch(() => {});
  }, []);

  // 스크롤 위치 감지: 사용자가 위로 스크롤했는지 추적
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // 하단 100px 이내면 "바닥에 있음"
      userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 100;
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // 채팅 선택 변경 시 스크롤 상태 리셋 + 맨 아래로
  useEffect(() => {
    userScrolledUpRef.current = false;
    prevMsgCountRef.current = 0;
    setAiPendingSuggestion(null);
    setTimeout(() => messagesEndRef.current?.scrollIntoView(), 50);
  }, [selectedChat?.id]);

  // 새 메시지가 추가됐을 때만 + 바닥에 있을 때만 자동 스크롤
  useEffect(() => {
    const newCount = messages.length;
    const hadNewMessages = newCount > prevMsgCountRef.current;
    prevMsgCountRef.current = newCount;

    if (hadNewMessages && !userScrolledUpRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);


  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!showSendOptions && !showMacroDropdown && !showAssignDropdown && !showSnoozeDropdown && !showAiModeMenu && !showMentionDropdown) return;
    const handler = (e: MouseEvent) => {
      if (showAssignDropdown && assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false);
      }
      if (showSendOptions && sendOptionsRef.current && !sendOptionsRef.current.contains(e.target as Node)) {
        setShowSendOptions(false);
      }
      if (showMacroDropdown && macroDropdownRef.current && !macroDropdownRef.current.contains(e.target as Node)) {
        setShowMacroDropdown(false);
        setMacroHashPos(-1);
      }
      if (showSnoozeDropdown && snoozeDropdownRef.current && !snoozeDropdownRef.current.contains(e.target as Node)) {
        setShowSnoozeDropdown(false);
      }
      if (showAiModeMenu && aiModeMenuRef.current && !aiModeMenuRef.current.contains(e.target as Node)) {
        setShowAiModeMenu(false);
      }
      if (showMentionDropdown && mentionDropdownRef.current && !mentionDropdownRef.current.contains(e.target as Node)) {
        setShowMentionDropdown(false);
        setMentionAtPos(-1);
      }
      if (showEmojiPicker && emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSendOptions, showMacroDropdown, showAssignDropdown, showSnoozeDropdown, showAiModeMenu, showMentionDropdown, showEmojiPicker]);

  // textarea 자동 높이 조절
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(adjustHeight, [input, adjustHeight]);

  // ── 서식 태그 삽입 (선택 영역 감싸기) ──
  const wrapSelection = useCallback((tag: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = input.substring(start, end);
    if (!selected) return; // 선택 없으면 무시

    const openTag = `<${tag}>`;
    const closeTag = `</${tag}>`;
    const newText = input.substring(0, start) + openTag + selected + closeTag + input.substring(end);
    setInput(newText);
    // 커서를 닫는 태그 뒤로
    requestAnimationFrame(() => {
      const pos = start + openTag.length + selected.length + closeTag.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  }, [input]);

  const insertLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = input.substring(start, end);

    // URL이 선택된 경우
    if (selected && /^https?:\/\//.test(selected)) {
      const label = prompt("링크 표시 텍스트:", selected);
      if (!label) return;
      const tag = `<link type="url" value="${selected}">${label}</link>`;
      const newText = input.substring(0, start) + tag + input.substring(end);
      setInput(newText);
    } else {
      // 텍스트 선택 또는 미선택
      const url = prompt("URL을 입력하세요:", "https://");
      if (!url) return;
      const label = selected || url;
      const tag = `<link type="url" value="${url}">${label}</link>`;
      const newText = input.substring(0, start) + tag + input.substring(end);
      setInput(newText);
    }
    el.focus();
  }, [input]);

  // ── 이모지 데이터 ──
  const EMOJI_DATA: Record<string, string[]> = useMemo(() => ({
    face: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊",
      "😇","🥰","😍","🤩","😘","😗","😋","😛","😜","🤪",
      "😝","🤑","🤗","🤭","🤫","🤔","😐","😑","😶","😏",
      "😒","🙄","😬","😮‍💨","🤥","😌","😔","😪","🤤","😴",
      "😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯",
      "🥳","🤠","😎","🤓","🧐","😳","🥺","😢","😭","😤",
      "😡","🤬","👿","💀","☠️","💩","🤡","👹","👺","👻",
      "👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀",
    ],
    hand: [
      "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞",
      "🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍",
      "👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝",
      "🙏","✍️","💪","🦾","🫶","🫰","🫱","🫲","🫳","🫴",
    ],
    animal: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯",
      "🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧",
      "🐦","🐤","🦄","🐝","🦋","🐌","🐛","🐞","🐢","🐍",
      "🐙","🐳","🐬","🐟","🦈","🦭","🐊","🦩","🦜","🦚",
    ],
    food: [
      "🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈",
      "🍒","🍑","🥭","🍍","🥝","🍅","🥑","🍕","🍔","🍟",
      "🌭","🍿","🧁","🍰","🎂","🍩","🍪","🍫","☕","🍵",
      "🥤","🧃","🍺","🍷","🥂","🍴","🥢","🥡","🍜","🍣",
    ],
    heart: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔",
      "❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️",
      "⭐","🌟","✨","💫","🔥","💯","🎉","🎊","🎈","🎁",
    ],
    object: [
      "🏆","🥇","📌","📍","💡","🔔","📣","💬","💭","🗯️",
      "✅","❌","⚠️","🚀","💻","📱","⏰","📅","📝","📎",
      "🔗","📞","📧","🗂️","📊","📈","🗑️","🔒","🔑","🛒",
      "🏠","🏢","🚗","🚕","🚌","✈️","🚢","⛽","🅿️","🚦",
    ],
  }), []);

  const EMOJI_CATEGORIES = [
    { key: "recent", icon: "🕐" },
    { key: "face", icon: "😀" },
    { key: "hand", icon: "👋" },
    { key: "animal", icon: "🐱" },
    { key: "food", icon: "🍔" },
    { key: "heart", icon: "❤️" },
    { key: "object", icon: "🔧" },
  ];

  const allEmojis = useMemo(() => Object.values(EMOJI_DATA).flat(), [EMOJI_DATA]);

  const insertEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const newText = input.substring(0, start) + emoji + input.substring(start);
    setInput(newText);
    setShowEmojiPicker(false);
    setEmojiSearch("");
    // 최근 사용 이모지 업데이트
    setRecentEmojis(prev => {
      const next = [emoji, ...prev.filter(e => e !== emoji)].slice(0, 32);
      try { localStorage.setItem("ct_recent_emojis", JSON.stringify(next)); } catch {}
      return next;
    });
    requestAnimationFrame(() => {
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  }, [input, setInput]);

  // ── 매크로(#) 필터링 — 이름 매칭 우선 ──
  const filteredMacros = macros.filter((m) =>
    !macroSearch || m.name.toLowerCase().includes(macroSearch.toLowerCase()) || m.content.toLowerCase().includes(macroSearch.toLowerCase())
  );
  // 이름에 검색어 포함된 것을 우선 정렬
  const q = macroSearch.toLowerCase();
  const sortedMacros = q
    ? [...filteredMacros].sort((a, b) => {
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
        return aName - bName;
      })
    : filteredMacros;
  const macroCategories = [...new Set(sortedMacros.map((m) => m.category))];
  const flatMacroList = macroCategories.flatMap((cat) => sortedMacros.filter((m) => m.category === cat));

  const selectMacro = (macro: Macro) => {
    if (macroHashPos >= 0) {
      const before = input.substring(0, macroHashPos);
      const cursorPos = textareaRef.current?.selectionStart ?? input.length;
      const after = input.substring(cursorPos);
      setInput(before + macro.content + after);
    } else {
      setInput(macro.content);
    }
    // 매크로에 연결된 이미지가 있으면 저장
    const macroImage = MACRO_IMAGES[macro.name];
    setPendingMacroImage(macroImage ?? null);
    setShowMacroDropdown(false);
    setMacroSearch("");
    setMacroHashPos(-1);
    textareaRef.current?.focus();
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    handleTypingPresence(!!val.trim());

    // # 감지
    const cursorPos = e.target.selectionStart;
    if (cursorPos > 0) {
      const beforeCursor = val.substring(0, cursorPos);
      const lastHash = beforeCursor.lastIndexOf("#");
      if (lastHash >= 0 && (lastHash === 0 || /\s/.test(val[lastHash - 1]))) {
        const afterHash = beforeCursor.substring(lastHash + 1);
        if (!afterHash.includes("\n") && afterHash.length < 30) {
          setMacroHashPos(lastHash);
          setMacroSearch(afterHash);
          setShowMacroDropdown(true);
          setFocusedMacroIndex(0);
          return;
        }
      }
    }
    if (showMacroDropdown) {
      setShowMacroDropdown(false);
      setMacroHashPos(-1);
    }

    // @ 감지 (멘션)
    if (cursorPos > 0) {
      const beforeCursor = val.substring(0, cursorPos);
      const lastAt = beforeCursor.lastIndexOf("@");
      if (lastAt >= 0 && (lastAt === 0 || /\s/.test(val[lastAt - 1]))) {
        const afterAt = beforeCursor.substring(lastAt + 1);
        if (!afterAt.includes("\n") && !afterAt.includes(" ") && afterAt.length < 20) {
          // 매니저 목록 미로드 시 로드
          if (managers.length === 0 && selectedChat) {
            fetch(`/api/channeltalk/chats/${selectedChat.id}/assign`)
              .then((r) => r.json())
              .then((d) => setManagers(d.managers ?? []))
              .catch(() => {});
          }
          setMentionAtPos(lastAt);
          setMentionSearch(afterAt);
          setShowMentionDropdown(true);
          setFocusedMentionIndex(0);
          return;
        }
      }
    }
    if (showMentionDropdown) {
      setShowMentionDropdown(false);
      setMentionAtPos(-1);
    }
  };

  // 멘션 선택
  const handleMentionSelect = (manager: { id: string; name: string }) => {
    const before = input.substring(0, mentionAtPos);
    const after = input.substring(mentionAtPos + 1 + mentionSearch.length);
    const newInput = `${before}@${manager.name} ${after}`;
    setInput(newInput);
    setMentionMappings((prev) => new Map(prev).set(manager.name, manager.id));
    setShowMentionDropdown(false);
    setMentionAtPos(-1);
    textareaRef.current?.focus();
  };

  // 입력 텍스트에서 @멘션을 채널톡 link 태그로 변환
  const convertMentionsToTags = (text: string): string => {
    let result = text;
    for (const [name, id] of mentionMappings) {
      result = result.replace(
        new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"),
        `<link type="manager" value="${id}">@${name}</link>`
      );
    }
    return result;
  };

  // 메시지 삭제 (Desk API)
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!selectedChat?.id || !onDeleteMessage) return;
    if (!confirm("이 메시지를 삭제하시겠습니까?")) return;
    try {
      await onDeleteMessage(selectedChat.id, messageId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "메시지 삭제 실패");
    }
  }, [selectedChat?.id, onDeleteMessage]);

  const handleSend = async () => {
    const hasText = input.trim();
    const hasFiles = imageFiles.length > 0;
    if (!hasText && !hasFiles) return;
    if (sending) return;

    // 즉시 UI 초기화 (체감 지연 제거)
    const messageText = hasText ? (mentionMappings.size > 0 ? convertMentionsToTags(input) : input) : "";
    const mentionedIds = mentionMappings.size > 0 ? [...new Set(mentionMappings.values())] : undefined;
    const mentionedNames = mentionMappings.size > 0 ? [...mentionMappings.keys()] : undefined;
    const macroImg = pendingMacroImage;
    const chatId = selectedChat?.id;
    const filesToSend = hasFiles ? [...imageFiles] : [];
    const sendInternal = isInternal;

    // CS Realtime — AI draft 분류 (외부 답변만, 내부 메시지 제외)
    // 1차: 현재 표시 중인 draft (사용자가 채택 안 하고 그대로 송신한 경우)
    // 2차: 채택 후 보관해둔 원본 draft (편집 후 송신한 경우)
    const draftAtSend = aiDraftActive ? aiDraftContent : lastDraftForCompareRef.current;
    const classification = !sendInternal && hasText
      ? classifyReply(messageText, draftAtSend)
      : null;

    setInput("");
    setMentionMappings(new Map());
    setImageFiles([]);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPendingMacroImage(null);
    setAiDraftActive(false);
    setAiDraftContent("");
    // 송신 완료 — 다음 답변은 새 draft 와 비교
    lastDraftForCompareRef.current = null;

    setSending(true);
    try {
      // 1. 텍스트 전송
      if (messageText) {
        await onSend(messageText, {
          isInternal: sendInternal,
          mentionedManagerIds: mentionedIds,
          mentionedNames,
          ...(classification ? { replyKind: classification.kind, draftCharOverlap: classification.charOverlap } : {}),
        });
      }

      // 2. 매크로 이미지 + 첨부 파일 백그라운드 전송
      if ((macroImg || filesToSend.length > 0) && chatId) {
        // 텍스트 전송 직후 바로 sending 해제 → 상담사는 다음 작업 가능
        setSending(false);

        // 백그라운드: 매크로 이미지
        if (macroImg && !sendInternal) {
          fetch(`/api/channeltalk/chats/${chatId}/send-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrl: macroImg.url, fileName: macroImg.fileName }),
          }).catch(() => {});
        }

        // 백그라운드: 첨부 파일 순차 전송
        if (filesToSend.length > 0 && onUploadImage) {
          (async () => {
            let ok = 0;
            for (const file of filesToSend) {
              try { await onUploadImage(chatId, file, sendInternal); ok++; } catch { break; }
            }
            if (ok < filesToSend.length) {
              toast.error(`파일 전송 실패 (${ok}/${filesToSend.length})`);
            }
          })();
        }
        return; // sending은 이미 false
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 매크로 드롭다운 열려있으면 키보드 네비게이션
    if (showMacroDropdown && flatMacroList.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedMacroIndex((prev) => Math.min(prev + 1, flatMacroList.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedMacroIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectMacro(flatMacroList[focusedMacroIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMacroDropdown(false);
        setMacroHashPos(-1);
        return;
      }
    }

    // 멘션 드롭다운 키보드 네비게이션
    if (showMentionDropdown && filteredMentionManagers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedMentionIndex((prev) => Math.min(prev + 1, filteredMentionManagers.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedMentionIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleMentionSelect(filteredMentionManagers[focusedMentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
        setMentionAtPos(-1);
        return;
      }
    }

    // Cmd+J → AI 라이터 (말다듬기)
    if ((e.metaKey || e.ctrlKey) && e.key === "j") {
      e.preventDefault();
      handlePolish();
      return;
    }

    if (sendMode === "enter") {
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleSend();
      }
    } else {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    }
  };

  const handleSendModeChange = (mode: SendMode) => {
    setSendMode(mode);
    setShowSendOptions(false);
    // DB에 저장
    fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ctSendMode: mode }),
    }).catch(() => {});
  };

  // 말다듬기
  const handlePolish = async () => {
    if (!input.trim() || isPolishing) return;
    setIsPolishing(true);
    try {
      const res = await fetch("/api/channeltalk/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setInput(data.polished);
      toast.success("메시지를 다듬었습니다");
    } catch {
      toast.error("AI 라이터 실패");
    } finally {
      setIsPolishing(false);
    }
  };

  // AI 추천 답변 → textarea 직접 입력
  // 차량등록 감지 패턴 — 텍스트 메시지 + 워크플로우 버튼 모두 커버
  const VEHICLE_PATTERN = /차량?\s*번호|차번호?|차량\s*등록|배차\s*번호?|몇\s*번\s*차|무슨\s*차|수거\s*차량?|방문\s*차량?|차량?\s*알려|차량?\s*확인|차\s*몇\s*번|번호판|차량\s*조회|차\s*뭐\s*타|어떤\s*차|기사.*(성함|연락처|번호)|차량\s*번호\s*요청|주차\s*번호|주차\s*안내/;

  const applyVehicleResponse = async () => {
    if (!selectedChat) return;
    toast("차량등록 자동 처리 중...", { icon: "🚗" });
    try {
      const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/vehicle-auto`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("차량등록 자동 처리 완료 (답변 + 배정 + 보류)");
        // 태그 UI 갱신
        if (!selectedChat.tags.includes("차량등록")) {
          onTagsUpdate?.(selectedChat.id, [...selectedChat.tags, "차량등록"]);
        }
        onAssign?.(); // 목록 새로고침
      } else {
        toast.error(`차량등록 처리 실패: ${data.error || "알 수 없는 오류"}`);
      }
    } catch {
      toast.error("차량등록 처리 실패 — 네트워크 오류");
    }
  };

  const handleAiSuggest = async () => {
    if (!selectedChat || aiLoading) return;

    // 1. 워크플로우 버튼 중 차량등록 관련 확인 (텍스트 없이 워크플로우만 온 경우도 커버)
    const userMessages = messages.filter((m) => m.role === "user");
    const hasVehicleWorkflow = userMessages.some(
      (m) => m.isWorkflowButton && VEHICLE_PATTERN.test(m.content || "")
    );

    // 워크플로우 버튼 제외, 실제 텍스트 메시지만
    const lastUserMsg = [...messages].reverse().find(
      (m) => m.role === "user" && !m.isWorkflowButton && m.content?.trim()
    );

    // 상담사 답변 없이 고객이 연속으로 보낸 메시지들 수집 (마지막 매니저 답변 이후)
    const lastManagerIdx = messages.reduce((idx, m, i) => {
      if (m.role === "manager" && m.senderName && m.senderName !== "커버링") return i;
      return idx;
    }, -1);
    const consecutiveUserMsgs = messages
      .slice(lastManagerIdx + 1)
      .filter((m) => m.role === "user" && !m.isWorkflowButton && m.content?.trim())
      .map((m) => m.content!.trim());
    const combinedUserMessage = consecutiveUserMsgs.length > 1
      ? consecutiveUserMsgs.join("\n")
      : null;

    // 워크플로우에서 고객이 선택한 의도 파악 (매니저 연결, 이용 방법 등은 제외)
    // "네", "넵" 같은 봇 확인 응답만 있으면 워크플로우 의도를 AI 메시지로 사용
    const BOT_CONFIRM_PATTERN = /^(네|넵|네네|ㅇㅇ|확인)[\s.!]*$/;
    const lastText = (lastUserMsg?.content || "").trim();
    const isOnlyBotConfirm = lastUserMsg && BOT_CONFIRM_PATTERN.test(lastText);

    // 워크플로우에서 의미있는 선택 (매니저 연결, 일반 고객, 아니요 처음 등 제외)
    const SKIP_WF_LABELS = /매니저\s*연결|일반\s*고객|처음이|기존\s*고객|사업자|아니요/;
    const meaningfulWfButton = [...userMessages].reverse().find(
      (m) => m.isWorkflowButton && !SKIP_WF_LABELS.test(m.content || "") && !VEHICLE_PATTERN.test(m.content || "")
    );
    const workflowIntent = meaningfulWfButton?.content || "";

    // 2. 텍스트 없이 차량등록 워크플로우만 온 경우 (주문번호 폼만 제출)
    if (!lastUserMsg && hasVehicleWorkflow) {
      applyVehicleResponse();
      return;
    }

    if (!lastUserMsg && !workflowIntent) {
      // 워크플로우 버튼만 있고 의미있는 의도 없음 → 인사 + 안내 문구
      setAiDraftContent("안녕하세요, 커버링 입니다.\n문의 내용을 보다 자세하게 작성해 주시면 확인 후 안내드리겠습니다.");
      setAiDraftActive(true);
      return;
    }

    // 마무리 인사 감지 — 고객이 감사/종결 메시지를 보낸 경우 (봇 확인 응답은 제외)
    const closingPatterns = /^(네\s*)?(감사합니다|감사해요|고마워요|고맙습니다|알겠습니다|알겠어요|확인했습니다|확인했어요)[\s~!.)]*$/i;
    if (lastText && !isOnlyBotConfirm && closingPatterns.test(lastText)) {
      setAiDraftContent("감사합니다!\n\n남은 하루도 평안하고 행복하게 보내시기 바라며,\n추가 문의가 있으시다면 언제든지 문의 주시기 바랍니다 :)");
      setAiDraftActive(true);
      return;
    }

    // 차량등록은 page.tsx 리스트 단에서 자동 처리 (handleAiSuggest에서는 감지 안 함)

    // AI 추천에 전달할 메시지 결정:
    // - 실제 텍스트가 있고 봇 확인이 아니면 → 텍스트 사용
    // - 봇 확인("네")만 있으면 → 워크플로우 의도 사용 (예: "이용 방법")
    // 연속 메시지가 여러 개면 합침, 아니면 마지막 메시지 사용
    const aiMessage = (isOnlyBotConfirm && workflowIntent)
      ? workflowIntent
      : (combinedUserMessage || lastUserMsg?.content || workflowIntent || "");

    if (!aiMessage) {
      toast("고객 메시지가 없어 AI 추천을 생성할 수 없습니다", { icon: "💡" });
      return;
    }

    setAiLoading(true);

    try {
      // 봇 워크플로우 메시지 제외, senderName 포함하여 백엔드에서 인사 판단
      const recentTurns = messages
        .filter((m) => m.role === "user" || m.role === "manager")
        .filter((m) => m.content)
        .slice(-6)
        .map((m) => ({
          role: (m.role === "user" ? "user" : "manager") as "user" | "manager",
          text: m.content || "",
          senderName: m.senderName || undefined,
        }));
      // 배송 조회도 병렬로 가져오기 (두발히어로)
      let deliveries: unknown[] | undefined;
      if (selectedChat.userPhone) {
        try {
          const phone = selectedChat.userPhone.replace(/^\+82/, "0");
          const dhRes = await fetch(`/api/dhero/deliveries?phone=${encodeURIComponent(phone)}&days=14`);
          if (dhRes.ok) {
            const dhData = await dhRes.json();
            const list = (dhData.deliveries ?? []).slice(0, 5);
            if (list.length > 0) {
              deliveries = list.map((d: { bookId: string; status: number; receivedDate: string | null; deliveredDate: string | null; receiverAddress: string | null; deliveryAllocatedDate: string | null }) => ({
                bookId: d.bookId, status: d.status, receivedDate: d.receivedDate,
                deliveredDate: d.deliveredDate, address: d.receiverAddress, allocatedDate: d.deliveryAllocatedDate,
              }));
            } else {
              deliveries = []; // 빈 배열 = 조회했지만 결과 없음
            }
          }
        } catch { /* ignore */ }
      }

      const customerContext = {
        ...(backofficeSummary ?? {}),
        ...(deliveries !== undefined ? { deliveries } : {}),
      };

      const res = await fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedChat.id,
          message: aiMessage,
          tags: selectedChat.tags,
          recentTurns,
          previousCategories: aiCategoryHistory,
          mode: aiMode === "prompt-only" ? "policy-only" : aiMode,
          ...(aiMode === "prompt-only" ? { skipPolicy: true } : {}),
          ...(Object.keys(customerContext).length > 0 ? { customerContext } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      // 카테고리 업데이트
      if (data.classifiedCategory) {
        setAiCategory(data.classifiedCategory as Category);
        setAiCategoryHistory((prev) => [...new Set([...prev, data.classifiedCategory])]);
      }

      // 답변 불가 여부
      setAiCanAnswer(data.canAnswer !== false);
      setAiReason(data.reason ?? null);

      // 타이밍 정보 표시
      if (data.timings) {
        const t = data.timings as Record<string, number>;
        const parts = Object.entries(t).map(([k, v]) => `${k}: ${v}ms`);
        console.log("[AI timings]", parts.join(" | "));
      }

      // 답변 추출: default 모드는 suggestions[], 나머지는 answer 직접
      let answerText = "";
      if (aiMode === "default") {
        const suggestions = (data.suggestions ?? []).map((s: Record<string, unknown>) => ({
          answerText: (s.answerText as string) || "",
          totalScore: (s.totalScore as number) || 0,
        }));
        if (suggestions.length > 0) answerText = suggestions[0].answerText;
      } else {
        answerText = data.answer || "";
      }

      if (data.canAnswer === false) {
        toast.error(`AI 답변 불가: ${data.reason || "상담사가 직접 답변해야 합니다"}`, { duration: 5000 });
      } else if (answerText) {
        // 상담사가 이미 타이핑 중이면 → 별도 카드로 표시 (덮어쓰기 방지)
        if (input.trim()) {
          setAiPendingSuggestion(answerText);
        } else {
          setAiDraftContent(answerText);
          setAiDraftActive(true);
        }
        if (data.timings?.total) {
          const modeLabel = aiMode === "combined" ? "Combined" : aiMode === "default" ? "RAG" : aiMode === "policy-only" ? "Policy" : "Prompt";
          toast.success(`${modeLabel} 답변 생성 (${(data.timings.total / 1000).toFixed(1)}초)`, { duration: 3000 });
        }
      } else {
        toast("추천할 답변이 없습니다", { icon: "💡" });
      }
    } catch {
      toast.error("AI 추천 실패");
    } finally {
      setAiLoading(false);
    }
  };

  // 채팅 전환 또는 사전 생성 답변 도착 시 적용
  const appliedDraftRef = useRef<string>("");
  useEffect(() => {
    // AI 추천 OFF → 사전 생성 답변 무시 (입력 중 텍스트는 보존)
    if (!aiSuggestVisible) {
      appliedDraftRef.current = "";
      setAiDraftActive(false);
      setAiDraftContent("");
      setAiCanAnswer(true);
      setAiReason(null);
      setPendingMacroImage(null);
      prevAutoDetectRef.current = "";
      return;
    }
    // 사전 생성 답변이 있을 때
    if (preloadedDraft) {
      const draftKey = `${selectedChat?.id}:${preloadedDraft.generatedAt}`;
      // 같은 draft를 이미 적용했으면 스킵
      if (appliedDraftRef.current === draftKey) return;
      appliedDraftRef.current = draftKey;

      if (preloadedDraft.canAnswer === false) {
        // 답변 불가이지만 백오피스 데이터가 있으면 → 자동 재생성 (고객정보로 답변 가능할 수 있음)
        if (backofficeSummary && (backofficeSummary.activeOrders?.length || backofficeSummary.recentOrders?.length)) {
          setAiDraftContent("");
          setAiDraftActive(false);
          setAiPendingSuggestion(null);
          handleAiSuggest();
          return;
        }
        // 백오피스 데이터 없음 → 답변 불가 표시
        setAiDraftContent("");
        setAiDraftActive(false);
        setAiCanAnswer(false);
        setAiReason(preloadedDraft.reason ?? "상담사가 직접 답변해야 합니다");
      } else if (preloadedDraft.answer) {
        setAiDraftContent(preloadedDraft.answer);
        setAiDraftActive(true);
        setAiCanAnswer(true);
        setAiReason(null);
      } else {
        setAiDraftActive(false);
        setAiDraftContent("");
        setAiCanAnswer(true);
        setAiReason(null);
      }
      if (preloadedDraft.category) {
        setAiCategory(preloadedDraft.category as Category);
        setAiCategoryHistory((prev) => [...new Set([...prev, preloadedDraft.category!])]);
      }
    } else {
      // 사전 생성 답변 없음 → AI 상태만 초기화 (입력 중 텍스트는 보존)
      appliedDraftRef.current = "";
      setAiDraftActive(false);
      setAiDraftContent("");
      setAiCanAnswer(true);
      setAiReason(null);
    }
    setPendingMacroImage(null);
    prevAutoDetectRef.current = "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id, preloadedDraft, aiSuggestVisible, backofficeSummary]);

  // 패턴 자동 감지 — 새 메시지 도착 시 차량등록/마무리인사/워크플로우만 있는 경우 자동 처리
  const prevAutoDetectRef = useRef<string>("");
  useEffect(() => {
    if (!aiSuggestVisible) return; // AI 추천 OFF → 자동 감지도 비활성화
    if (!selectedChat || messages.length === 0 || sending || input.trim()) return;
    // 마지막 메시지가 고객(user)일 때만
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "user") return;
    // 같은 메시지에 대해 중복 감지 방지
    const key = `${selectedChat.id}:${lastMsg.id}`;
    if (prevAutoDetectRef.current === key) return;
    prevAutoDetectRef.current = key;

    const userMessages = messages.filter((m) => m.role === "user");
    const hasVehicleWf = userMessages.some(
      (m) => m.isWorkflowButton && VEHICLE_PATTERN.test(m.content || "")
    );
    const lastUserText = [...messages].reverse().find(
      (m) => m.role === "user" && !m.isWorkflowButton && m.content?.trim()
    );
    const lastText = (lastUserText?.content || "").trim();

    // 봇 확인 응답 감지 ("네", "넵" 등은 봇 전화번호 확인에 대한 응답)
    const isBotConfirm = /^(네|넵|네네|ㅇㅇ|확인)[\s.!]*$/.test(lastText);

    // 워크플로우에서 의미있는 선택 (매니저 연결, 일반 고객 등 제외)
    const SKIP_WF = /매니저\s*연결|일반\s*고객|처음이|기존\s*고객|사업자|아니요/;
    const meaningfulWf = [...userMessages].reverse().find(
      (m) => m.isWorkflowButton && !SKIP_WF.test(m.content || "") && !VEHICLE_PATTERN.test(m.content || "")
    );

    // 1. 차량등록은 page.tsx 리스트 단에서 자동 처리 (여기서는 감지 안 함)

    // 2. 마무리 인사 감지 (봇 확인 응답은 제외)
    const closingPat = /^(네\s*)?(감사합니다|감사해요|고마워요|고맙습니다|알겠습니다|알겠어요|확인했습니다|확인했어요)[\s~!.)]*$/i;
    if (lastText && !isBotConfirm && closingPat.test(lastText)) {
      setAiDraftContent("감사합니다!\n\n남은 하루도 평안하고 행복하게 보내시기 바라며,\n추가 문의가 있으시다면 언제든지 문의 주시기 바랍니다 :)");
      setAiDraftActive(true);
      return;
    }

    // 3. 워크플로우만 있고 텍스트 없음 (또는 봇 확인만) → 워크플로우 의도 없으면 안내 문구
    if ((!lastUserText || isBotConfirm) && !meaningfulWf) {
      setAiDraftContent("안녕하세요, 커버링 입니다.\n문의 내용을 보다 자세하게 작성해 주시면 확인 후 안내드리겠습니다.");
      setAiDraftActive(true);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedChat?.id, aiSuggestVisible]);

  // 이미지 압축 (4MB 이하로)
  const compressImage = useCallback((file: File, maxSize = 4 * 1024 * 1024): Promise<File> => {
    if (file.size <= maxSize) return Promise.resolve(file);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const quality = Math.min(0.85, maxSize / file.size);
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file),
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const addImageWithPreview = useCallback((file: File) => {
    setImageFiles((prev) => [...prev, file]);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreviews((prev) => [...prev, ev.target?.result as string]);
    reader.readAsDataURL(file);
  }, [setImageFiles, setImagePreviews]);

  const addFileWithoutPreview = useCallback((file: File) => {
    setImageFiles((prev) => [...prev, file]);
    setImagePreviews((prev) => [...prev, null]);
  }, [setImageFiles, setImagePreviews]);

  // 파일 선택 (이미지 + 일반 파일, 다중 선택 지원)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: 파일 크기가 20MB를 초과합니다`);
        continue;
      }
      if (file.type.startsWith("image/")) {
        const compressed = await compressImage(file);
        addImageWithPreview(compressed);
      } else {
        addFileWithoutPreview(file);
      }
    }
  };

  // 이미지/파일 전송 (다중)
  const handleImageSend = async () => {
    if (imageFiles.length === 0 || !selectedChat || !onUploadImage) return;
    setIsUploadingSending(true);
    let successCount = 0;
    try {
      for (const file of imageFiles) {
        await onUploadImage(selectedChat.id, file, isInternal);
        successCount++;
      }
      toast.success(`${successCount}개 파일 전송 완료`);
      setImageFiles([]);
      setImagePreviews([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.error(`파일 전송 실패 (${successCount}/${imageFiles.length} 완료)`);
    } finally {
      setIsUploadingSending(false);
    }
  };

  const cancelImage = (index?: number) => {
    if (index !== undefined) {
      setImageFiles((prev) => prev.filter((_, i) => i !== index));
      setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    } else {
      setImageFiles([]);
      setImagePreviews([]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 드래그 & 드랍 이미지
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: 파일 크기가 20MB를 초과합니다`);
        continue;
      }
      if (file.type.startsWith("image/")) {
        const compressed = await compressImage(file);
        addImageWithPreview(compressed);
      } else {
        addFileWithoutPreview(file);
      }
    }
  }, [compressImage, addImageWithPreview, addFileWithoutPreview]);

  // 클립보드 이미지 붙여넣기 (Ctrl+V / Cmd+V)
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > 20 * 1024 * 1024) {
          toast.error("이미지 크기가 20MB를 초과합니다");
          return;
        }
        const compressed = await compressImage(file);
        addImageWithPreview(compressed);
        return;
      }
    }
  }, [compressImage, addImageWithPreview]);

  // 대화방 내 모든 이미지 수집 (갤러리용)
  const allChatImages = useMemo(() => {
    const imgs: { url: string; name: string }[] = [];
    for (const msg of messages) {
      // files 배열에서 이미지 수집
      if (msg.files) {
        for (const f of msg.files) {
          if (isImageFile(f)) {
            imgs.push({ url: f.url, name: f.name });
          }
        }
      }
      // content에 포함된 이미지 URL도 수집 (Open API fallback으로 보낸 이미지)
      const inlineUrls = extractInlineImageUrls(msg.content);
      for (const url of inlineUrls) {
        if (!imgs.some((img) => img.url === url)) {
          imgs.push({ url, name: url.split("/").pop() || "image" });
        }
      }
    }
    return imgs;
  }, [messages]);

  const openGallery = useCallback((imageUrl: string) => {
    const idx = allChatImages.findIndex((img) => img.url === imageUrl);
    setGalleryImages(allChatImages);
    setGalleryIndex(idx >= 0 ? idx : 0);
    setShowGallery(true);
  }, [allChatImages]);

  // @멘션 드롭다운 필터링
  // 멘션용 매니저 목록: 채널톡 매니저 + 커버링톡 상담사 (중복 제거)
  const mentionableManagers = useMemo(() => {
    const merged = [...managers];
    const existingNames = new Set(managers.map((m) => m.name));
    for (const c of COVERING_COUNSELORS) {
      if (!existingNames.has(c.name)) merged.push(c);
    }
    return merged;
  }, [managers]);

  const filteredMentionManagers = useMemo(() => {
    if (!showMentionDropdown) return [];
    const q = mentionSearch.toLowerCase();
    return mentionableManagers.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [mentionableManagers, mentionSearch, showMentionDropdown]);

  if (!selectedChat) {
    return (
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--app-text-placeholder)", fontSize: 17,
      }}>
        왼쪽에서 대화를 선택하세요
      </div>
    );
  }

  return (
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 드래그 오버레이 */}
      {isDragging && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          backgroundColor: "rgba(59,130,246,0.1)",
          border: "3px dashed var(--app-accent)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            padding: "16px 32px", borderRadius: 12,
            backgroundColor: "var(--app-surface)", boxShadow: "var(--app-shadow-lg)",
            fontSize: 17, fontWeight: 600, color: "var(--app-accent)",
          }}>
            파일을 여기에 드랍하세요
          </div>
        </div>
      )}
      {/* 대화 헤더 */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {(() => {
              const phone = selectedChat.userPhone;
              const formattedPhone = phone ? phone.replace(/^\+82/, "0") : "";
              // userName이 전화번호와 동일하면 이름 중복 표시 안함
              const nameIsPhone = phone && (
                selectedChat.userName === phone ||
                selectedChat.userName === formattedPhone ||
                selectedChat.userName.replace(/[^0-9+]/g, "") === phone.replace(/[^0-9+]/g, "")
              );
              // 백오피스에서 조회된 실명 (있으면 우선 표시, null이면 조회중)
              const realName = backofficeSummary?.name;
              const displayName = realName || (!nameIsPhone ? selectedChat.userName : null);
              return (
                <>
                  {displayName ? (
                    editingUserName ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input
                          autoFocus
                          value={editUserNameValue}
                          onChange={(e) => setEditUserNameValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter" && editUserNameValue.trim()) {
                              setSavingUserName(true);
                              try {
                                const res = await fetch(`/api/channeltalk/users/${selectedChat.userId}/profile`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: editUserNameValue.trim() }),
                                });
                                if (!res.ok) throw new Error();
                                toast.success("이름이 수정되었습니다");
                                setEditingUserName(false);
                                onAssign?.(); // 채팅 목록 갱신
                              } catch { toast.error("이름 수정 실패"); }
                              finally { setSavingUserName(false); }
                            }
                            if (e.key === "Escape") setEditingUserName(false);
                          }}
                          onBlur={() => { if (!savingUserName) setEditingUserName(false); }}
                          disabled={savingUserName}
                          style={{
                            fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)",
                            border: "1px solid var(--app-accent)", borderRadius: 6,
                            padding: "2px 8px", outline: "none", width: 200,
                            backgroundColor: "var(--app-surface)",
                          }}
                        />
                        <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>Enter 저장 · Esc 취소</span>
                      </span>
                    ) : (
                      <span
                        style={{ fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)", cursor: "pointer" }}
                        onClick={() => { setEditUserNameValue(selectedChat.userName); setEditingUserName(true); }}
                        title="클릭하여 이름 수정"
                      >
                        {displayName}
                        <Pencil size={12} style={{ marginLeft: 4, color: "var(--app-text-tertiary)", verticalAlign: "middle" }} />
                      </span>
                    )
                  ) : nameIsPhone && !backofficeSummary ? (
                    <span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 400 }}>
                      조회중...
                    </span>
                  ) : null}
                  {phone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{
                        fontSize: displayName ? 14 : 17,
                        fontWeight: displayName ? 400 : 600,
                        color: displayName ? "var(--app-text-tertiary)" : "var(--app-text-primary)",
                      }}>
                        {formattedPhone}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(formattedPhone);
                          toast.success("번호가 복사되었습니다");
                        }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          padding: 2, borderRadius: 4, color: "var(--app-text-tertiary)",
                          display: "inline-flex", alignItems: "center",
                        }}
                        title="번호 복사"
                      >
                        <Copy size={13} />
                      </button>
                    </span>
                  )}
                  {backofficeSummary?.userId && (
                    <a
                      href={`https://admin.covering.app/v2/user/${backofficeSummary.userId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        fontSize: 12, color: "#4F46E5", textDecoration: "none",
                        padding: "2px 8px", borderRadius: 6,
                        backgroundColor: "#EEF2FF", fontWeight: 500,
                      }}
                      title="백오피스에서 보기"
                    >
                      <ExternalLink size={11} />
                      백오피스
                    </a>
                  )}
                </>
              );
            })()}
            {/* AI 카테고리 배지 */}
            {aiCategory && (() => {
              const bc = BADGE_COLORS[aiCategory] || DEFAULT_BADGE;
              return (
                <span
                  style={{
                    fontSize: 12, padding: "2px 10px", borderRadius: 12,
                    fontWeight: 600, whiteSpace: "nowrap",
                    display: "inline-flex", alignItems: "center", gap: 4,
                    backgroundColor: bc.bg, color: bc.color,
                  }}
                  title={`AI 분류: ${aiCategory}`}
                >
                  <Bot style={{ width: 12, height: 12 }} />
                  {CATEGORY_LABELS[aiCategory] || aiCategory}
                </span>
              );
            })()}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            {selectedChat.tags.map((tag) => {
              const tc = getTagColor(tag);
              return (
                <span
                  key={tag}
                  style={{
                    fontSize: 13, padding: "2px 8px", borderRadius: 10,
                    backgroundColor: tc.bg, color: tc.color,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}
                >
                  {tag}
                  <button
                    onClick={async () => {
                      if (tagUpdating) return;
                      setTagUpdating(true);
                      try {
                        const newTags = selectedChat.tags.filter((t) => t !== tag);
                        onTagsUpdate?.(selectedChat.id, newTags);
                        await fetch(`/api/channeltalk/chats/${selectedChat.id}/tags`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ tags: newTags }),
                        });
                        toast.success(`태그 "${tag}" 삭제됨`);
                      } catch { toast.error("태그 삭제 실패"); }
                      finally { setTagUpdating(false); }
                    }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: tc.color, fontSize: 12, padding: 0, lineHeight: 1,
                      opacity: 0.6,
                    }}
                    title="태그 삭제"
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {/* 태그 추가 드롭다운 */}
            {selectedChat.tags.length < 8 && (
              showTagInput ? (
                <div style={{ position: "relative" }}>
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="입력해 주세요"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setShowTagInput(false); setTagInput(""); }
                    }}
                    style={{
                      width: 160, fontSize: 12, padding: "4px 10px", borderRadius: 8,
                      border: "1px solid var(--app-accent)", backgroundColor: "var(--app-surface)",
                      color: "var(--app-text-primary)", outline: "none",
                    }}
                  />
                  {/* 드롭다운 */}
                  <div style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 50,
                    marginTop: 4, width: 260, maxHeight: 280, overflowY: "auto",
                    backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
                    borderRadius: 8, boxShadow: "var(--app-shadow-lg)",
                  }}>
                    {allConsultationTags
                      .filter((t) => !selectedChat.tags.includes(t))
                      .filter((t) => !tagInput.trim() || t.toLowerCase().includes(tagInput.toLowerCase()))
                      .slice(0, 20)
                      .map((t) => (
                        <button
                          key={t}
                          onClick={async () => {
                            if (tagUpdating) return;
                            setTagUpdating(true);
                            try {
                              const newTags = [...selectedChat.tags, t];
                              onTagsUpdate?.(selectedChat.id, newTags);
                              setTagInput("");
                              setShowTagInput(false);
                              await fetch(`/api/channeltalk/chats/${selectedChat.id}/tags`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ tags: newTags }),
                              });
                              toast.success(`태그 "${t}" 추가됨`);
                            } catch { toast.error("태그 추가 실패"); }
                            finally { setTagUpdating(false); }
                          }}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "7px 12px", fontSize: 13, border: "none",
                            backgroundColor: "transparent", color: "var(--app-text-primary)",
                            cursor: "pointer", borderBottom: "1px solid var(--app-border)",
                          }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "var(--app-surface-hover)"; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = "transparent"; }}
                        >
                          {t}
                        </button>
                      ))}
                    {/* 직접 입력 적용 */}
                    {tagInput.trim() && !allConsultationTags.includes(tagInput.trim()) && (
                      <button
                        onClick={async () => {
                          if (tagUpdating) return;
                          setTagUpdating(true);
                          try {
                            const newTags = [...selectedChat.tags, tagInput.trim()];
                            onTagsUpdate?.(selectedChat.id, newTags);
                            setTagInput("");
                            setShowTagInput(false);
                            await fetch(`/api/channeltalk/chats/${selectedChat.id}/tags`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ tags: newTags }),
                            });
                            toast.success("태그 추가됨");
                          } catch { toast.error("태그 추가 실패"); }
                          finally { setTagUpdating(false); }
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "7px 12px", fontSize: 13, border: "none",
                          backgroundColor: "transparent", color: "var(--app-accent)",
                          cursor: "pointer", fontWeight: 600,
                        }}
                      >
                        &quot;{tagInput.trim()}&quot; 직접 추가
                      </button>
                    )}
                  </div>
                  {/* 배경 클릭으로 닫기 */}
                  <div
                    onClick={() => { setShowTagInput(false); setTagInput(""); }}
                    style={{ position: "fixed", inset: 0, zIndex: 49 }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowTagInput(true)}
                  style={{
                    fontSize: 13, padding: "2px 8px", borderRadius: 10,
                    border: "1px dashed var(--app-border)", backgroundColor: "transparent",
                    color: "var(--app-text-tertiary)", cursor: "pointer",
                  }}
                >
                  + 태그
                </button>
              )
            )}
          </div>

          {/* 상담사 Presence */}
          {presenceViewers && presenceViewers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
              {presenceViewers.map((v) => (
                <span key={v.name} style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 10,
                  backgroundColor: v.typing ? "rgba(245, 158, 11, 0.15)" : "rgba(99, 102, 241, 0.1)",
                  color: v.typing ? "#D97706" : "#6366F1",
                  fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    backgroundColor: v.typing ? "#D97706" : "#22C55E",
                  }} />
                  {v.name}{v.typing ? " 입력중..." : " 보는중"}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* 채팅 URL 복사 */}
        <button
          onClick={() => {
            const url = `${window.location.origin}/covering-talk/channeltalk?chatId=${selectedChat.id}`;
            navigator.clipboard.writeText(url);
            toast.success("채팅 URL이 복사되었습니다");
          }}
          title="채널톡 채팅 URL 복사"
          style={{
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", backgroundColor: "transparent",
            color: "var(--app-text-tertiary)", cursor: "pointer",
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          <Link2 size={18} />
        </button>
        {/* 보류 버튼 */}
        <div ref={snoozeDropdownRef} style={{ position: "relative" }}>
          <button
            disabled={snoozing}
            onClick={() => setShowSnoozeDropdown((p) => !p)}
            title="보류"
            style={{
              width: 32, height: 32, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "none", backgroundColor: "transparent",
              color: snoozing ? "#D97706" : "var(--app-text-tertiary)",
              cursor: snoozing ? "not-allowed" : "pointer",
              opacity: snoozing ? 0.7 : 1,
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => { if (!snoozing) e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            {snoozing ? (
              <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
            ) : (
              <Clock style={{ width: 18, height: 18 }} />
            )}
          </button>
          {showSnoozeDropdown && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
              borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              minWidth: 260, zIndex: 100, overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--app-border)", fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)" }}>
                다음 시간까지 보류
              </div>
              {[
                { label: "오늘 21:00", getTime: () => { const d = new Date(); d.setHours(21, 0, 0, 0); return d.getTime(); }, hidden: () => new Date().getHours() >= 21 },
                { label: "4시간", getTime: () => Date.now() + 4 * 60 * 60 * 1000 },
                { label: "내일 오전 9:00", getTime: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); } },
                { label: "내일 오후 1:00", getTime: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(13, 0, 0, 0); return d.getTime(); } },
                { label: "다음 월요일 오전", getTime: () => { const d = new Date(); const day = d.getDay(); const diff = day === 0 ? 1 : 8 - day; d.setDate(d.getDate() + diff); d.setHours(9, 0, 0, 0); return d.getTime(); } },
              ].filter((opt) => !(opt as any).hidden?.()).map((opt) => {
                const targetTime = opt.getTime();
                const formatted = new Date(targetTime).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
                return (
                  <button
                    key={opt.label}
                    onClick={async () => {
                      setShowSnoozeDropdown(false);
                      setSnoozing(true);
                      try {
                        const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/snooze`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reopenedAt: opt.getTime() }),
                        });
                        if (!res.ok) throw new Error((await res.json()).error || "보류 실패");
                        toast.success(`보류 완료 (${opt.label})`);
                        onAssign?.();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "보류 처리 실패");
                      } finally {
                        setSnoozing(false);
                      }
                    }}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      width: "100%", padding: "10px 14px", border: "none",
                      backgroundColor: "transparent", textAlign: "left",
                      fontSize: 14, color: "var(--app-text-primary)", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <span>{opt.label}</span>
                    <span style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>{formatted}</span>
                  </button>
                );
              })}
              {/* 사용자 지정 */}
              <button
                onClick={() => {
                  setShowSnoozeDropdown(false);
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setSnoozeCustomDate(tomorrow.toISOString().slice(0, 10));
                  setSnoozeCustomTime("09:00");
                  setShowSnoozeCustom(true);
                }}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  width: "100%", padding: "10px 14px", border: "none",
                  borderTop: "1px solid var(--app-border)",
                  backgroundColor: "transparent", textAlign: "left",
                  fontSize: 14, color: "var(--app-accent)", cursor: "pointer", fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <span>사용자 지정</span>
                <Calendar style={{ width: 14, height: 14 }} />
              </button>
            </div>
          )}

          {/* 사용자 지정 보류 모달 */}
          {showSnoozeCustom && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(0,0,0,0.5)",
            }} onClick={() => setShowSnoozeCustom(false)}>
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: "var(--app-surface)", borderRadius: 12,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: 24,
                  minWidth: 320, maxWidth: 360,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 16 }}>
                  보류 시간 설정
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>날짜</label>
                    <input
                      type="date"
                      value={snoozeCustomDate}
                      onChange={(e) => setSnoozeCustomDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8,
                        border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface-secondary)",
                        color: "var(--app-text-primary)", fontSize: 14, boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>시간</label>
                    <input
                      type="time"
                      value={snoozeCustomTime}
                      onChange={(e) => setSnoozeCustomTime(e.target.value)}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 8,
                        border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface-secondary)",
                        color: "var(--app-text-primary)", fontSize: 14, boxSizing: "border-box",
                      }}
                    />
                  </div>

                  {snoozeCustomDate && snoozeCustomTime && (
                    <div style={{ fontSize: 13, color: "var(--app-text-secondary)", textAlign: "center", padding: "4px 0" }}>
                      {new Date(`${snoozeCustomDate}T${snoozeCustomTime}`).toLocaleString("ko-KR", {
                        year: "numeric", month: "long", day: "numeric", weekday: "short",
                        hour: "2-digit", minute: "2-digit",
                      })}
                      까지 보류
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                  <button
                    onClick={() => setShowSnoozeCustom(false)}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid var(--app-border)",
                      backgroundColor: "transparent", color: "var(--app-text-primary)",
                      fontSize: 14, fontWeight: 500, cursor: "pointer",
                    }}
                  >
                    취소
                  </button>
                  <button
                    disabled={!snoozeCustomDate || !snoozeCustomTime || snoozing}
                    onClick={async () => {
                      if (!selectedChat || !snoozeCustomDate || !snoozeCustomTime) return;
                      const target = new Date(`${snoozeCustomDate}T${snoozeCustomTime}:00`);
                      if (target.getTime() <= Date.now()) {
                        toast.error("현재 시간 이후로 설정해주세요");
                        return;
                      }
                      setShowSnoozeCustom(false);
                      setSnoozing(true);
                      try {
                        const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/snooze`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ reopenedAt: target.getTime() }),
                        });
                        if (!res.ok) throw new Error((await res.json()).error || "보류 실패");
                        toast.success(`보류 완료 (${target.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})`);
                        onAssign?.();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "보류 처리 실패");
                      } finally {
                        setSnoozing(false);
                      }
                    }}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 8, border: "none",
                      backgroundColor: (!snoozeCustomDate || !snoozeCustomTime || snoozing) ? "#444" : "var(--app-accent)",
                      color: "#fff", fontSize: 14, fontWeight: 600,
                      cursor: (!snoozeCustomDate || !snoozeCustomTime || snoozing) ? "not-allowed" : "pointer",
                    }}
                  >
                    {snoozing ? "처리 중..." : "보류"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {/* 상담 종료 버튼 */}
        <button
          disabled={closing}
          onClick={async () => {
            if (closing) return;
            setClosing(true);
            try {
              // 1. 즉시 상담 종료 (빠름)
              const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/close`, {
                method: "POST",
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || "상담 종료 실패");
              toast.success("상담종료 완료");
              onCloseChat?.(selectedChat.id); // 로컬에서 종료 표시

              // 2. 자동 태깅 (fire-and-forget, 백그라운드)
              fetch(`/api/channeltalk/chats/${selectedChat.id}/auto-tag`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  messages: messages.map((m) => ({ role: m.role, content: m.content })),
                  existingTags: selectedChat.tags ?? [],
                }),
              })
                .then((r) => r.json())
                .then((tagData) => {
                  if (tagData.tags?.length > 0) {
                    onTagsUpdate?.(selectedChat.id, tagData.tags);
                    toast.success(`자동 태그: ${tagData.tags.join(", ")}`);
                  }
                })
                .catch((err) => console.error("[auto-tag]", err));
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "상담 종료 실패");
            } finally {
              setClosing(false);
            }
          }}
          title="상담 종료"
          style={{
            width: 32, height: 32, borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", backgroundColor: "transparent",
            color: closing ? "#EF4444" : "var(--app-text-tertiary)",
            cursor: closing ? "not-allowed" : "pointer",
            opacity: closing ? 0.7 : 1,
            transition: "background-color 0.15s",
          }}
          onMouseEnter={(e) => { if (!closing) e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"; }}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
        >
          {closing ? (
            <Loader2 style={{ width: 18, height: 18, animation: "spin 1s linear infinite" }} />
          ) : (
            <XCircle style={{ width: 18, height: 18 }} />
          )}
        </button>
        {/* 담당자 배정 */}
        <div style={{ position: "relative" }} ref={assignDropdownRef}>
          <button
            onClick={async () => {
              if (managers.length === 0) {
                const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/assign`);
                const data = await res.json();
                setManagers(data.managers ?? []);
              }
              setShowAssignDropdown(!showAssignDropdown);
            }}
            title={selectedChat.assignee ? `담당: ${selectedChat.assignee}` : "담당자 배정"}
            style={{
              height: 32, borderRadius: 8, paddingLeft: 10, paddingRight: 10,
              display: "flex", alignItems: "center", gap: 6,
              border: "none", backgroundColor: "transparent",
              color: "var(--app-text-tertiary)", fontSize: 13,
              cursor: "pointer", transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            {selectedChat.assignee && selectedChat.assigneeAvatarUrl ? (
              <img src={selectedChat.assigneeAvatarUrl} alt="" style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <UserPlus style={{ width: 14, height: 14, flexShrink: 0 }} />
            )}
            <span style={{ whiteSpace: "nowrap" }}>{selectedChat.assignee ? `담당: ${selectedChat.assignee}` : "배정"}</span>
          </button>
          {showAssignDropdown && (
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100,
              backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
              borderRadius: 8, boxShadow: "var(--app-shadow-lg)", minWidth: 160, overflow: "hidden",
            }}>
              {managers.map((m) => (
                <button
                  key={m.id}
                  disabled={assigning}
                  onClick={async () => {
                    setAssigning(true);
                    try {
                      const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/assign`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ managerId: m.id }),
                      });
                      if (!res.ok) throw new Error();
                      toast.success(`${m.name}에게 배정되었습니다`);
                      setShowAssignDropdown(false);
                      onAssign?.();
                    } catch {
                      toast.error("배정 실패");
                    } finally {
                      setAssigning(false);
                    }
                  }}
                  style={{
                    display: "block", width: "100%", padding: "10px 14px",
                    border: "none", backgroundColor: "transparent", textAlign: "left",
                    fontSize: 14, color: "var(--app-text-primary)", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <span style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: "#8B5CF6", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{m.name.charAt(0)}</span>
                    )}
                    <span>{m.name}</span>
                    {selectedChat.assignee === m.name && <span style={{ color: "#8B5CF6", marginLeft: "auto" }}>✓</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {msgLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Loader2 style={{ width: 24, height: 24, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            // 같은 발신자 + 같은 내부/외부 + 2분 이내 → 그룹핑
            const isGrouped = prev != null
              && prev.role === msg.role
              && prev.isInternal === msg.isInternal
              && (prev.senderName || "") === (msg.senderName || "")
              && Math.abs(new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 120000;
            return <MessageBubble key={msg.id} message={msg} onImageClick={openGallery} onDelete={handleDeleteMessage} isGrouped={isGrouped} userAvatarUrl={selectedChat?.userAvatarUrl} />;
          })
        )}
        {/* ─── AI 초안: 메시지 영역 내 채널톡 스타일 ─── */}
        {aiDraftActive && aiDraftContent.trim() && (
          <div style={{
            padding: "8px 20px",
            backgroundColor: "rgba(26, 163, 255, 0.06)",
            borderLeft: "3px solid var(--app-accent)",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            {/* 아바타 */}
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              backgroundColor: "var(--app-accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Bot style={{ width: 18, height: 18 }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 헤더: AI 초안 라벨 + 전송 대기 + 카테고리 뱃지 + 답변 채택 + X */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--app-accent)" }}>AI 초안</span>
                <span style={{
                  fontSize: 11, color: "#22C55E", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#22C55E", display: "inline-block" }} />
                  전송 대기
                </span>
                {aiCategory && (() => {
                  const bc = BADGE_COLORS[aiCategory] || DEFAULT_BADGE;
                  return (
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 8,
                      backgroundColor: bc.bg, color: bc.color, fontWeight: 600,
                    }}>
                      {CATEGORY_LABELS[aiCategory] || aiCategory}
                    </span>
                  );
                })()}
                <button
                  onClick={() => {
                    // "채택" — 원본 draft 를 비교용으로 보관해야 send 시 분류가 정확해짐
                    lastDraftForCompareRef.current = aiDraftContent;
                    setInput(aiDraftContent);
                    setAiDraftActive(false);
                    setAiDraftContent("");
                    textareaRef.current?.focus();
                  }}
                  style={{
                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 10px", borderRadius: 6,
                    backgroundColor: "var(--app-accent)", color: "#fff",
                    border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  }}
                  title="답변 채택 후 수정"
                >
                  <Check style={{ width: 12, height: 12 }} />
                  채택
                </button>
                <button
                  onClick={() => {
                    setAiDraftActive(false);
                    setAiDraftContent("");
                    lastDraftForCompareRef.current = null; // 새 draft 가 올 거라 이전 비교 대상 무효
                    handleAiSuggest();
                  }}
                  disabled={aiLoading}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "3px 10px", borderRadius: 6,
                    backgroundColor: "transparent", color: "var(--app-text-secondary)",
                    border: "1px solid var(--app-border)", cursor: aiLoading ? "not-allowed" : "pointer",
                    fontSize: 11, fontWeight: 600, opacity: aiLoading ? 0.5 : 1,
                  }}
                  title="답변 재생성"
                >
                  <RefreshCw style={{ width: 12, height: 12 }} />
                  재생성
                </button>
                <button
                  onClick={() => {
                    setAiDraftActive(false);
                    setAiDraftContent("");
                    lastDraftForCompareRef.current = null; // 사용자가 명시적으로 거절
                  }}
                  style={{
                    background: "none", border: "none",
                    cursor: "pointer", color: "var(--app-text-tertiary)", padding: 2,
                  }}
                  title="초안 닫기"
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
              {/* 메시지 본문 — 연한 색상으로 구분 */}
              <div style={{
                fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
                color: "var(--app-text-secondary)",
              }}>
                {renderRichText(aiDraftContent)}
              </div>
            </div>
          </div>
        )}

        {/* ─── AI 로딩 인디케이터 (메시지 영역 내) ─── */}
        {aiLoading && (
          <div style={{
            padding: "8px 20px",
            display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              backgroundColor: "var(--app-accent)", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Bot style={{ width: 20, height: 20 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 10 }}>
              <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite", color: "var(--app-accent)" }} />
              <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>AI 답변 생성 중...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── 입력 영역 ─── */}
      <div style={{
        margin: "8px 12px 12px",
        border: `2px solid ${isInternal ? "#D97706" : "var(--app-accent, #1AA3FF)"}`,
        borderRadius: 16,
        backgroundColor: isInternal ? "rgba(180, 130, 40, 0.12)" : "var(--app-chat-input-bg)",
        position: "relative",
        transition: "border-color 0.2s, background-color 0.2s",
      }}>
        {/* 고객응대 / 내부대화 탭 */}
        <div style={{ display: "flex", padding: "0 16px", borderBottom: "1px solid var(--app-chat-input-border)" }}>
          <button
            onClick={() => setIsInternal(false)}
            style={{
              padding: "10px 16px", fontSize: 14, fontWeight: 600,
              color: !isInternal ? "var(--app-chat-input-text)" : "var(--app-text-secondary)",
              backgroundColor: "transparent", border: "none",
              borderBottom: !isInternal ? "2px solid var(--app-chat-input-text)" : "2px solid transparent",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            고객응대
          </button>
          <button
            onClick={() => setIsInternal(true)}
            style={{
              padding: "10px 16px", fontSize: 14, fontWeight: 600,
              color: isInternal ? "var(--app-tag-yellow-text)" : "var(--app-text-secondary)",
              backgroundColor: "transparent", border: "none",
              borderBottom: isInternal ? "2px solid var(--app-tag-yellow-text)" : "2px solid transparent",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            내부대화
          </button>
        </div>

        {/* 파일 미리보기 (다중) */}
        {imageFiles.length > 0 && (
          <div style={{
            padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
            borderBottom: "1px solid var(--app-chat-input-border)", flexWrap: "wrap",
          }}>
            {imageFiles.map((file, idx) => (
              <div key={idx} style={{ position: "relative" }}>
                {imagePreviews[idx] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imagePreviews[idx]!} alt="미리보기"
                    style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #444" }}
                  />
                ) : (
                  <div style={{
                    width: 60, height: 60, borderRadius: 8, border: "1px solid var(--app-border)",
                    backgroundColor: "var(--app-surface-secondary)",
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                  }}>
                    <FileText style={{ width: 20, height: 20, color: "var(--app-text-tertiary)" }} />
                    <span style={{ fontSize: 9, color: "var(--app-text-tertiary)", maxWidth: 54, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
                      {file.name}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => cancelImage(idx)}
                  style={{
                    position: "absolute", top: -6, right: -6,
                    width: 18, height: 18, borderRadius: "50%",
                    backgroundColor: "var(--app-btn-danger-text)", color: "var(--app-surface)",
                    border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                ><X style={{ width: 10, height: 10 }} /></button>
              </div>
            ))}
            <button
              onClick={handleImageSend}
              disabled={isUploadingSending}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                backgroundColor: isUploadingSending ? "#444" : "var(--app-accent)",
                color: "var(--app-surface)", fontSize: 14, fontWeight: 600,
                cursor: isUploadingSending ? "default" : "pointer",
                marginLeft: "auto",
              }}
            >
              {isUploadingSending ? "전송 중..." : `${imageFiles.length}개 파일 전송`}
            </button>
          </div>
        )}

        {/* 매크로 이미지 첨부 표시 */}
        {pendingMacroImage && (
          <div style={{
            padding: "6px 16px", display: "flex", alignItems: "center", gap: 8,
            borderBottom: "1px solid var(--app-chat-input-border)",
            backgroundColor: "rgba(59,130,246,0.05)",
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pendingMacroImage.url} alt={pendingMacroImage.fileName}
              style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(0,0,0,0.1)" }}
            />
            <span style={{ fontSize: 12, color: "var(--app-text-secondary)", flex: 1 }}>
              📎 {pendingMacroImage.fileName} — 전송 시 자동 첨부
            </span>
            <button onClick={() => setPendingMacroImage(null)} style={{
              border: "none", background: "none", cursor: "pointer", padding: 2, color: "#9CA3AF",
            }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* AI 답변 불가 표시 */}
        {!aiCanAnswer && aiReason && (
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid var(--app-chat-input-border)",
            backgroundColor: "rgba(239, 68, 68, 0.05)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Zap style={{ width: 12, height: 12, color: "#ef4444" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "#ef4444" }}>
                AI 답변 불가
              </span>
              {aiCategory && (() => {
                const bc = BADGE_COLORS[aiCategory] || DEFAULT_BADGE;
                return (
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 8,
                    backgroundColor: bc.bg, color: bc.color, fontWeight: 600,
                  }}>
                    {CATEGORY_LABELS[aiCategory] || aiCategory}
                  </span>
                );
              })()}
            </div>
            <div style={{
              fontSize: 13, color: "#ef4444", marginTop: 4, lineHeight: 1.5,
            }}>
              {aiReason}
            </div>
          </div>
        )}

        {/* 매크로 드롭다운 */}
        {showMacroDropdown && flatMacroList.length > 0 && (
          <div
            ref={macroDropdownRef}
            style={{
              maxHeight: 320, overflowY: "auto",
              borderBottom: "1px solid var(--app-chat-input-border)",
              backgroundColor: "var(--app-surface)",
            }}
          >
            <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--app-border-light)" }}>
              <Hash style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
              <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>매크로 검색: {macroSearch || "전체"}</span>
            </div>
            {macroCategories.map((cat) => {
              const items = sortedMacros.filter((m) => m.category === cat);
              return (
                <div key={cat}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: "var(--app-text-tertiary)",
                    padding: "8px 12px 4px", textTransform: "uppercase",
                  }}>
                    {cat} ({items.length}개)
                  </div>
                  {items.map((macro) => {
                    const idx = flatMacroList.indexOf(macro);
                    const isFocused = idx === focusedMacroIndex;
                    return (
                      <div
                        key={macro.id}
                        onClick={() => selectMacro(macro)}
                        onMouseEnter={() => setFocusedMacroIndex(idx)}
                        style={{
                          padding: "8px 12px", cursor: "pointer",
                          backgroundColor: isFocused ? "var(--app-surface-hover)" : "transparent",
                          transition: "background-color 0.1s",
                        }}
                      >
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>{macro.name}</div>
                        <div style={{
                          fontSize: 13, color: "var(--app-text-tertiary)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {macro.content.substring(0, 60)}{macro.content.length > 60 ? "..." : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* @멘션 드롭다운 */}
        {showMentionDropdown && filteredMentionManagers.length > 0 && (
          <div
            ref={mentionDropdownRef}
            style={{
              maxHeight: 240, overflowY: "auto",
              borderBottom: "1px solid var(--app-chat-input-border)",
              backgroundColor: "var(--app-surface)",
            }}
          >
            <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--app-border-light)" }}>
              <AtSign style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
              <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>멘션: {mentionSearch || "전체"}</span>
            </div>
            {filteredMentionManagers.map((m, idx) => (
              <div
                key={m.id}
                onClick={() => handleMentionSelect(m)}
                onMouseEnter={() => setFocusedMentionIndex(idx)}
                style={{
                  padding: "8px 12px", cursor: "pointer",
                  backgroundColor: idx === focusedMentionIndex ? "var(--app-surface-hover)" : "transparent",
                  transition: "background-color 0.1s",
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <UserPlus style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>{m.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* textarea */}
        <div style={{ padding: "12px 16px 8px" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isInternal ? "팀 멤버들만 볼 수 있는 내부대화예요. 상담 상태에 영향을 주지 않아요." : "#으로 매크로 검색 · 무엇을 써볼까요?"}
            rows={1}
            style={{
              width: "100%", resize: "none", minHeight: 24, maxHeight: 160,
              fontSize: 16, color: "var(--app-chat-input-text)", lineHeight: 1.5,
              backgroundColor: "transparent", border: "none", outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* AI 답변 대기 카드 (상담사 타이핑 중에 AI 답변이 생성된 경우) */}
        {aiPendingSuggestion && (
          <div style={{
            margin: "0 16px 8px", padding: "10px 14px",
            backgroundColor: "var(--app-surface-secondary)", borderRadius: 10,
            border: "1px solid var(--app-border-light)",
            fontSize: 13, color: "var(--app-text-secondary)",
            cursor: "pointer", position: "relative",
          }}
          onClick={() => {
            setAiDraftContent(aiPendingSuggestion);
            setAiDraftActive(true);
            setAiPendingSuggestion(null);
          }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-accent)" }}>AI 추천 답변 (클릭하여 적용)</span>
              <button
                onClick={(e) => { e.stopPropagation(); setAiPendingSuggestion(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--app-text-tertiary)", fontSize: 14 }}
              >
                &times;
              </button>
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
              {aiPendingSuggestion.length > 200 ? aiPendingSuggestion.slice(0, 200) + "..." : aiPendingSuggestion}
            </div>
          </div>
        )}

        {/* 하단 툴바 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 16px 10px",
        }}>
          {/* 왼쪽: 매크로 + 이미지 업로드 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => {
                setMacroHashPos(-1);
                setMacroSearch("");
                setShowMacroDropdown(!showMacroDropdown);
                setFocusedMacroIndex(0);
              }}
              title="매크로 템플릿 (#)"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: showMacroDropdown ? "var(--app-chat-input-border)" : "transparent",
                border: "none",
                cursor: "pointer", color: showMacroDropdown ? "var(--app-accent)" : "var(--app-text-tertiary)",
              }}
              onMouseEnter={(e) => { if (!showMacroDropdown) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
              onMouseLeave={(e) => { if (!showMacroDropdown) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <Hash style={{ width: 18, height: 18 }} />
            </button>
            <button
              onClick={() => wrapSelection("b")}
              title="굵게 (텍스트 선택 후 클릭)"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none",
                cursor: "pointer", color: "var(--app-text-tertiary)",
                fontWeight: 700, fontSize: 15,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <Bold style={{ width: 16, height: 16 }} />
            </button>
            <button
              onClick={() => wrapSelection("i")}
              title="기울임 (텍스트 선택 후 클릭)"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none",
                cursor: "pointer", color: "var(--app-text-tertiary)",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <Italic style={{ width: 16, height: 16 }} />
            </button>
            <button
              onClick={insertLink}
              title="링크 삽입"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none",
                cursor: "pointer", color: "var(--app-text-tertiary)",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <Link2 style={{ width: 16, height: 16 }} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="파일 첨부"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none",
                cursor: "pointer", color: "var(--app-text-tertiary)",
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <ImageIcon style={{ width: 18, height: 18 }} />
            </button>
            <button
              onClick={async () => {
                if (managers.length === 0 && selectedChat) {
                  const res = await fetch(`/api/channeltalk/chats/${selectedChat.id}/assign`);
                  const data = await res.json();
                  setManagers(data.managers ?? []);
                }
                if (!showMentionDropdown) {
                  // @ 삽입
                  const pos = textareaRef.current?.selectionStart ?? input.length;
                  const before = input.substring(0, pos);
                  const after = input.substring(pos);
                  const needSpace = before.length > 0 && !/\s$/.test(before);
                  const newInput = `${before}${needSpace ? " " : ""}@${after}`;
                  setInput(newInput);
                  setMentionAtPos(pos + (needSpace ? 1 : 0));
                  setMentionSearch("");
                  setShowMentionDropdown(true);
                  setFocusedMentionIndex(0);
                  textareaRef.current?.focus();
                } else {
                  setShowMentionDropdown(false);
                  setMentionAtPos(-1);
                }
              }}
              title="@멘션"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: showMentionDropdown ? "var(--app-chat-input-border)" : "transparent",
                border: "none",
                cursor: "pointer", color: showMentionDropdown ? "var(--app-accent)" : "var(--app-text-tertiary)",
              }}
              onMouseEnter={(e) => { if (!showMentionDropdown) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
              onMouseLeave={(e) => { if (!showMentionDropdown) e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <AtSign style={{ width: 16, height: 16 }} />
            </button>
            {/* 이모지 선택 버튼 */}
            <div style={{ position: "relative" }} ref={emojiPickerRef}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="이모지 삽입"
                style={{
                  width: 32, height: 32, borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: showEmojiPicker ? "var(--app-chat-input-border)" : "transparent",
                  border: "none",
                  cursor: "pointer", color: showEmojiPicker ? "var(--app-accent)" : "var(--app-text-tertiary)",
                  fontSize: 16,
                }}
                onMouseEnter={(e) => { if (!showEmojiPicker) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
                onMouseLeave={(e) => { if (!showEmojiPicker) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                😊
              </button>
              {showEmojiPicker && (() => {
                const displayEmojis = emojiSearch.trim()
                  ? allEmojis
                  : emojiCategory === "recent" ? recentEmojis : (EMOJI_DATA[emojiCategory] ?? []);
                return (
                  <div style={{
                    position: "absolute", bottom: "100%", left: 0,
                    marginBottom: 6,
                    width: 360, height: 380,
                    backgroundColor: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.18)",
                    zIndex: 1000,
                    display: "flex", flexDirection: "column",
                  }}>
                    {/* 검색 */}
                    <div style={{ padding: "10px 12px 6px" }}>
                      <input
                        value={emojiSearch}
                        onChange={(e) => setEmojiSearch(e.target.value)}
                        placeholder="검색어를 입력해 주세요"
                        autoFocus
                        style={{
                          width: "100%", padding: "7px 10px", fontSize: 13,
                          border: "1px solid var(--app-border)", borderRadius: 8,
                          outline: "none", backgroundColor: "var(--app-input-bg)",
                          color: "var(--app-text-primary)", boxSizing: "border-box",
                        }}
                      />
                    </div>
                    {/* 카테고리 탭 */}
                    <div style={{
                      display: "flex", padding: "0 8px",
                      borderBottom: "1px solid var(--app-border)",
                    }}>
                      {EMOJI_CATEGORIES.map((cat) => (
                        <button
                          key={cat.key}
                          onClick={() => { setEmojiCategory(cat.key); setEmojiSearch(""); }}
                          style={{
                            padding: "6px 8px 8px", border: "none", background: "none",
                            cursor: "pointer", fontSize: 18, lineHeight: 1,
                            opacity: emojiCategory === cat.key ? 1 : 0.4,
                            borderBottom: emojiCategory === cat.key ? "2px solid var(--app-accent)" : "2px solid transparent",
                          }}
                        >
                          {cat.icon}
                        </button>
                      ))}
                    </div>
                    {/* 섹션 라벨 */}
                    {!emojiSearch && (
                      <div style={{ padding: "8px 12px 2px", fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)" }}>
                        {emojiCategory === "recent" ? "최근 사용함" : EMOJI_CATEGORIES.find(c => c.key === emojiCategory)?.key === "face" ? "스마일 및 감정" : emojiCategory === "hand" ? "손 제스처" : emojiCategory === "animal" ? "동물" : emojiCategory === "food" ? "음식" : emojiCategory === "heart" ? "하트 및 기호" : "사물"}
                      </div>
                    )}
                    {/* 이모지 그리드 */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(8, 1fr)",
                      gap: 1, padding: "4px 8px 8px", overflowY: "auto", flex: 1,
                    }}>
                      {displayEmojis.length === 0 ? (
                        <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13 }}>
                          {emojiCategory === "recent" ? "최근 사용한 이모지가 없습니다" : "검색 결과 없음"}
                        </div>
                      ) : displayEmojis.map((emoji, i) => (
                        <button
                          key={`${emojiCategory}-${i}`}
                          onClick={() => insertEmoji(emoji)}
                          style={{
                            width: 38, height: 38, border: "none", background: "none",
                            borderRadius: 8, cursor: "pointer", fontSize: 22,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-surface-hover, #f3f4f6)"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.ppt,.pptx,.zip,.txt"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </div>

          {/* 오른쪽: AI추천 + 말다듬기 + 전송 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* AI 추천 + 모드 선택 (상담사 설정으로 숨기기 가능) */}
            {aiSuggestVisible && <div style={{ display: "flex", alignItems: "center", position: "relative" }} ref={aiModeMenuRef}>
              <button
                onClick={handleAiSuggest}
                disabled={aiLoading}
                title={`AI 추천 답변 (${aiMode})`}
                style={{
                  height: 32, padding: "0 8px 0 10px", borderRadius: "6px 0 0 6px",
                  display: "flex", alignItems: "center", gap: 4,
                  backgroundColor: aiDraftActive ? "var(--app-tag-blue-bg)" : "transparent",
                  border: "none",
                  cursor: aiLoading ? "default" : "pointer",
                  color: aiLoading ? "var(--app-accent)" : aiDraftActive ? "var(--app-accent)" : "var(--app-text-tertiary)",
                  fontSize: 13, fontWeight: 500,
                }}
                onMouseEnter={(e) => { if (!aiDraftActive) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
                onMouseLeave={(e) => { if (!aiDraftActive) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Zap style={{ width: 16, height: 16, animation: aiLoading ? "spin 1s linear infinite" : "none" }} />
                AI
              </button>
              <button
                onClick={() => setShowAiModeMenu((v) => !v)}
                style={{
                  height: 32, width: 20, borderRadius: "0 6px 6px 0", border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backgroundColor: showAiModeMenu ? "var(--app-tag-blue-bg)" : "transparent",
                  cursor: "pointer",
                  color: showAiModeMenu ? "var(--app-accent)" : "var(--app-text-tertiary)",
                }}
                onMouseEnter={(e) => { if (!showAiModeMenu) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
                onMouseLeave={(e) => { if (!showAiModeMenu) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <ChevronDown style={{ width: 12, height: 12 }} />
              </button>
              {showAiModeMenu && (
                <div style={{
                  position: "absolute", bottom: "100%", right: 0, marginBottom: 4,
                  backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
                  borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  padding: 4, minWidth: 200, zIndex: 50,
                }}>
                  {([
                    { mode: "combined" as const, label: "Combined (1회)", desc: "분류+답변 통합 (빠름)" },
                    { mode: "default" as const, label: "Default (RAG)", desc: "분류→RAG→정책" },
                    { mode: "policy-only" as const, label: "Policy-only", desc: "분류→정책문서" },
                    { mode: "prompt-only" as const, label: "Prompt-only", desc: "분류→규칙만 (정책 제외)" },
                  ]).map((opt) => (
                    <button
                      key={opt.mode}
                      onClick={() => { setAiMode(opt.mode); setShowAiModeMenu(false); }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "flex-start",
                        width: "100%", padding: "6px 10px", borderRadius: 6, border: "none",
                        backgroundColor: aiMode === opt.mode ? "var(--app-tag-blue-bg)" : "transparent",
                        cursor: "pointer", textAlign: "left",
                      }}
                      onMouseEnter={(e) => { if (aiMode !== opt.mode) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
                      onMouseLeave={(e) => { if (aiMode !== opt.mode) e.currentTarget.style.backgroundColor = aiMode === opt.mode ? "var(--app-tag-blue-bg)" : "transparent"; }}
                    >
                      <span style={{
                        fontSize: 13, fontWeight: aiMode === opt.mode ? 600 : 400,
                        color: aiMode === opt.mode ? "var(--app-accent)" : "var(--app-text-primary)",
                      }}>
                        {opt.label} {aiMode === opt.mode && "✓"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>{opt.desc}</span>
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid var(--app-border-light)", margin: "4px 0" }} />
                  <button
                    onClick={() => {
                      const userMsgs = messages.filter((m) => m.role === "user");
                      const lastUser = [...messages].reverse().find((m) => m.role === "user" && !m.isWorkflowButton && m.content?.trim());
                      const BOT_CONFIRM = /^(네|넵|네네|ㅇㅇ|확인)[\s.!]*$/;
                      const isConfirm = lastUser && BOT_CONFIRM.test((lastUser.content || "").trim());
                      const SKIP_WF = /매니저\s*연결|일반\s*고객|처음이|기존\s*고객|사업자|아니요/;
                      const wfBtn = [...userMsgs].reverse().find(
                        (m) => m.isWorkflowButton && !SKIP_WF.test(m.content || "") && !(/차량?\s*번호|차번호?|차량\s*등록/).test(m.content || "")
                      );
                      const wfIntent = wfBtn?.content || "";
                      const msg = (isConfirm && wfIntent) ? wfIntent : (lastUser?.content || wfIntent || "");
                      if (!msg) return;
                      setCompareMessage(msg);
                      setShowCompareModal(true);
                      setShowAiModeMenu(false);
                    }}
                    disabled={!selectedChat || aiLoading}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      width: "100%", padding: "6px 10px", borderRadius: 6, border: "none",
                      backgroundColor: "transparent", cursor: "pointer", textAlign: "left",
                      color: "var(--app-text-secondary)", fontSize: 13,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <FileText style={{ width: 14, height: 14 }} />
                    전체 모드 비교
                  </button>
                </div>
              )}
            </div>}
            {/* AI 라이터 (Cmd+J) */}
            <button
              onClick={handlePolish}
              disabled={isPolishing || !input.trim()}
              title="AI 라이터 — 고객친화적 톤으로 다듬기 (⌘J)"
              style={{
                width: 32, height: 32, borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "none",
                cursor: (isPolishing || !input.trim()) ? "default" : "pointer",
                color: isPolishing ? "#F59E0B" : "var(--app-text-tertiary)",
                opacity: !input.trim() ? 0.4 : 1,
              }}
              onMouseEnter={(e) => { if (input.trim()) e.currentTarget.style.backgroundColor = "var(--app-chat-input-border)"; }}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
            >
              <Sparkles style={{ width: 18, height: 18, animation: isPolishing ? "spin 1s linear infinite" : "none" }} />
            </button>

            {/* 전송 버튼 + 드롭다운 */}
            <div style={{ position: "relative" }} ref={sendOptionsRef}>
              <div style={{ display: "flex" }}>
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && imageFiles.length === 0) || sending}
                  style={{
                    height: 34, padding: "0 14px",
                    borderRadius: "8px 0 0 8px", border: "none",
                    backgroundColor: ((input.trim() || imageFiles.length > 0) && !sending) ? (isInternal ? "#92710e" : "var(--app-accent)") : "#444",
                    color: "var(--app-surface)", fontSize: 14, fontWeight: 600,
                    cursor: ((input.trim() || imageFiles.length > 0) && !sending) ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "background-color 0.15s",
                  }}
                >
                  {sending ? (
                    <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                  ) : (
                    <Send style={{ width: 14, height: 14 }} />
                  )}
                  전송
                </button>
                <button
                  onClick={() => setShowSendOptions(!showSendOptions)}
                  style={{
                    height: 34, width: 28,
                    borderRadius: "0 8px 8px 0", border: "none",
                    borderLeft: "1px solid rgba(255,255,255,0.2)",
                    backgroundColor: ((input.trim() || imageFiles.length > 0) && !sending) ? (isInternal ? "#92710e" : "var(--app-accent)") : "#444",
                    color: "var(--app-surface)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background-color 0.15s",
                  }}
                >
                  <ChevronDown style={{ width: 14, height: 14 }} />
                </button>
              </div>

              {/* 전송 옵션 드롭다운 */}
              {showSendOptions && (
                <div style={{
                  position: "absolute", bottom: "100%", right: 0,
                  marginBottom: 6, width: 220,
                  backgroundColor: "var(--app-surface-secondary)", borderRadius: 10,
                  boxShadow: "var(--app-shadow-lg)",
                  padding: 8, zIndex: 100,
                }}>
                  <div style={{ fontSize: 12, color: "var(--app-text-tertiary)", padding: "4px 8px", marginBottom: 4 }}>
                    전송 단축키
                  </div>
                  <button
                    onClick={() => handleSendModeChange("enter")}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "8px 10px", borderRadius: 6,
                      border: "none", backgroundColor: sendMode === "enter" ? "var(--app-surface-hover)" : "transparent",
                      color: "var(--app-surface)", fontSize: 14, cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span>Enter로 전송</span>
                    {sendMode === "enter" && <span style={{ color: "var(--app-accent)", fontSize: 15 }}>✓</span>}
                  </button>
                  <button
                    onClick={() => handleSendModeChange("cmd_enter")}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "8px 10px", borderRadius: 6,
                      border: "none", backgroundColor: sendMode === "cmd_enter" ? "var(--app-surface-hover)" : "transparent",
                      color: "var(--app-surface)", fontSize: 14, cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span>⌘ + Enter로 전송</span>
                    {sendMode === "cmd_enter" && <span style={{ color: "var(--app-accent)", fontSize: 15 }}>✓</span>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* AI 비교 모달 */}
      {showCompareModal && selectedChat && (
        <AiCompareModal
          open={showCompareModal}
          onClose={() => setShowCompareModal(false)}
          chatId={selectedChat.id}
          message={compareMessage}
          tags={selectedChat.tags}
          recentTurns={messages
            .filter((m) => m.role === "user" || m.role === "manager")
            .filter((m) => m.content)
            .slice(-6)
            .map((m) => ({
              role: (m.role === "user" ? "user" : "manager") as "user" | "manager",
              text: m.content || "",
              senderName: m.senderName || undefined,
            }))}
          previousCategories={aiCategoryHistory}
        />
      )}

      {/* 이미지 갤러리 모달 */}
      {showGallery && galleryImages.length > 0 && (
        <ImageGalleryModal
          images={galleryImages}
          initialIndex={galleryIndex}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  );
}

// ─── 이미지 갤러리 모달 ───

function ImageGalleryModal({
  images,
  initialIndex,
  onClose,
}: {
  images: { url: string; name: string }[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((prev) => Math.max(0, prev - 1));
      if (e.key === "ArrowRight") setIndex((prev) => Math.min(images.length - 1, prev + 1));
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          width: 40, height: 40, borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.15)", border: "none",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff",
        }}
      >
        <X style={{ width: 20, height: 20 }} />
      </button>

      {/* 위치 표시 */}
      <div style={{
        position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
        color: "#fff", fontSize: 14, opacity: 0.7,
      }}>
        {index + 1} / {images.length}
      </div>

      {/* 이전 버튼 */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((prev) => prev - 1); }}
          style={{
            position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.15)", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
          }}
        >
          <ChevronLeft style={{ width: 24, height: 24 }} />
        </button>
      )}

      {/* 다음 버튼 */}
      {index < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); setIndex((prev) => prev + 1); }}
          style={{
            position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)",
            width: 44, height: 44, borderRadius: "50%",
            backgroundColor: "rgba(255,255,255,0.15)", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff",
          }}
        >
          <ChevronRight style={{ width: 24, height: 24 }} />
        </button>
      )}

      {/* 이미지 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        onClick={(e) => e.stopPropagation()}
        src={images[index].url}
        alt={images[index].name}
        style={{
          maxWidth: "90vw", maxHeight: "85vh",
          objectFit: "contain", borderRadius: 8,
        }}
      />

      {/* 파일명 */}
      <div style={{
        position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
        color: "#fff", fontSize: 13, opacity: 0.6, maxWidth: "80vw",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {images[index].name}
      </div>
    </div>
  );
}

// ─── 텍스트 내 <b>, <i> 태그를 React 엘리먼트로 변환 ───

function renderRichText(text: string): React.ReactNode {
  // <link type="manager" ...>@이름</link> → @이름 표시, <link type="url" ...> → 클릭 가능 링크
  // <b>...</b> 와 <i>...</i> 태그를 React 엘리먼트로 변환
  const parts = text.split(/(<link[^>]*>[\s\S]*?<\/link>|<b>[\s\S]*?<\/b>|<i>[\s\S]*?<\/i>)/g);
  return parts.map((part, i) => {
    // <link type="manager" value="id">@이름</link> → @이름 (bold 파란색)
    const mentionMatch = part.match(/^<link\s+type="manager"[^>]*>([\s\S]*?)<\/link>$/);
    if (mentionMatch) {
      return <span key={i} style={{ color: "#3B82F6", fontWeight: 600 }}>{mentionMatch[1]}</span>;
    }
    // <link type="url" value="url">텍스트</link> → 클릭 가능 링크
    const urlMatch = part.match(/^<link\s+type="url"\s+value="([^"]*)"[^>]*>([\s\S]*?)<\/link>$/);
    if (urlMatch) {
      return <a key={i} href={urlMatch[1]} target="_blank" rel="noopener noreferrer" style={{ color: "#3B82F6", textDecoration: "underline" }}>{urlMatch[2]}</a>;
    }
    if (part.startsWith("<b>") && part.endsWith("</b>")) {
      return <strong key={i}>{part.slice(3, -4)}</strong>;
    }
    if (part.startsWith("<i>") && part.endsWith("</i>")) {
      return <em key={i}>{part.slice(3, -4)}</em>;
    }
    return part;
  });
}

// ─── 메시지 버블 ───

function MessageBubble({ message, onImageClick, onDelete, isGrouped, userAvatarUrl }: { message: CTMessage; onImageClick?: (url: string) => void; onDelete?: (messageId: string) => void; isGrouped?: boolean; userAvatarUrl?: string | null }) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.role === "user";
  const isBot = message.role === "bot";
  const isManager = message.role === "manager";
  const isInternal = message.isInternal;

  // 발신자 라벨 + 색상
  let senderLabel: string;
  let senderColor: string;
  if (isInternal) {
    senderLabel = `내부대화${message.senderName ? ` · ${message.senderName}` : ""}`;
    senderColor = "#F59E0B";
  } else if (isUser) {
    senderLabel = message.senderName || "고객";
    senderColor = "#3B82F6";
  } else if (isManager) {
    senderLabel = message.senderName || "매니저";
    senderColor = "#22C55E";
  } else {
    senderLabel = message.senderName || "봇";
    senderColor = "#A78BFA";
  }

  // 아바타: 고객은 채널톡 프로필 이미지 또는 이니셜, 매니저/봇은 avatarUrl 또는 로고
  const avatarSize = 40;
  let avatarEl: React.ReactNode;
  if (isUser) {
    if (userAvatarUrl) {
      avatarEl = (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={userAvatarUrl}
          alt={message.senderName || "고객"}
          style={{ width: avatarSize, height: avatarSize, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      );
    } else {
      const initial = (message.senderName || "고객")[0];
      avatarEl = (
        <div style={{
          width: avatarSize, height: avatarSize, borderRadius: "50%",
          backgroundColor: "#3B82F6", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, fontWeight: 700, flexShrink: 0,
        }}>
          {initial}
        </div>
      );
    }
  } else if (message.avatarUrl) {
    avatarEl = (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={message.avatarUrl}
        alt={senderLabel}
        style={{ width: avatarSize, height: avatarSize, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  } else {
    avatarEl = (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src="/covering-talk/logo.png"
        alt="커버링"
        style={{ width: avatarSize, height: avatarSize, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }

  // 삭제된 메시지
  if (message.isRemoved) {
    return (
      <div style={{
        padding: isGrouped ? "2px 20px 2px 72px" : "8px 20px",
        display: "flex", gap: 12, alignItems: "flex-start", opacity: 0.5,
      }}>
        {!isGrouped && avatarEl}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!isGrouped && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: senderColor }}>{senderLabel}</span>
              <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>{formatTime(message.createdAt)}</span>
            </div>
          )}
          <div style={{ fontSize: 14, color: "var(--app-text-tertiary)", fontStyle: "italic" }}>
            삭제된 메시지입니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: isGrouped ? "2px 20px 2px 72px" : "8px 20px",
        backgroundColor: isInternal ? "rgba(245, 158, 11, 0.06)" : isUser ? "rgba(59, 130, 246, 0.04)" : "transparent",
        borderLeft: isInternal ? "3px solid #F59E0B" : "none",
        display: "flex", gap: 12, alignItems: "flex-start", position: "relative",
      }}
    >
      {/* hover 시 삭제 버튼 */}
      {hovered && onDelete && !isUser && (
        <button
          onClick={() => onDelete(message.id)}
          title="메시지 삭제"
          style={{
            position: "absolute", top: 4, right: 16,
            width: 28, height: 28, borderRadius: 6,
            border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", zIndex: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          }}
        >
          <Trash2 style={{ width: 13, height: 13, color: "#EF4444" }} />
        </button>
      )}
      {!isGrouped && avatarEl}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!isGrouped && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
            {isInternal && <Lock style={{ width: 14, height: 14, color: "#F59E0B", flexShrink: 0, position: "relative", top: 2 }} />}
            <span style={{ fontSize: 16, fontWeight: 700, color: senderColor }}>{senderLabel}</span>
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>{formatTime(message.createdAt)}</span>
          </div>
        )}
        {/* 텍스트 */}
        {(() => {
          let text = message.content;
          if (message.formData?.length) {
            const formText = message.formData.map((f) => `${f.label}: ${f.value}`).join("\n");
            text = text.replace(formText, "").replace(/\n\n$/, "").trim();
          }
          if (!text) return null;
          // 워크플로우 버튼 선택 → 칩 스타일
          if (message.isWorkflowButton) {
            return (
              <span style={{
                display: "inline-block", padding: "6px 14px", borderRadius: 18,
                backgroundColor: "rgba(59, 130, 246, 0.12)",
                color: "#60A5FA", fontSize: 15, fontWeight: 600,
                border: "1px solid rgba(59, 130, 246, 0.25)",
              }}>
                {text}
              </span>
            );
          }
          // 인라인 이미지 URL이 포함된 경우 → 이미지 렌더링 + 나머지 텍스트
          const inlineImgUrls = extractInlineImageUrls(text);
          if (inlineImgUrls.length > 0) {
            // 이미지 URL과 텍스트 분리
            let remaining = text;
            for (const url of inlineImgUrls) {
              remaining = remaining.replace(url, "").trim();
            }
            // 📷 아이콘 접두사 제거
            remaining = remaining.replace(/^📷\s*\S*\s*/gm, "").trim();
            return (
              <>
                {remaining && (
                  <div style={{
                    fontSize: 16, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    color: "var(--app-text-primary)", marginBottom: 6,
                  }}>
                    {renderRichText(remaining)}
                  </div>
                )}
                {inlineImgUrls.length > 1 ? (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: inlineImgUrls.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                    gap: 4, maxWidth: inlineImgUrls.length === 2 ? 320 : 360,
                  }}>
                    {inlineImgUrls.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => onImageClick?.(url)}
                        style={{ padding: 0, border: "none", background: "none", cursor: "pointer", overflow: "hidden", borderRadius: 8, aspectRatio: "1", position: "relative" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="이미지" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </button>
                    ))}
                  </div>
                ) : inlineImgUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => onImageClick?.(url)}
                    style={{ display: "block", marginBottom: 4, padding: 0, border: "none", background: "none", cursor: "pointer" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="이미지" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, cursor: "pointer" }} />
                  </button>
                ))}
              </>
            );
          }
          return (
            <div style={{
              fontSize: 16, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word",
              color: "var(--app-text-primary)",
            }}>
              {renderRichText(text)}
            </div>
          );
        })()}
        {/* 폼 카드 */}
        {message.formData && message.formData.length > 0 && (
          <div style={{
            marginTop: 8, padding: "12px 16px", borderRadius: 10,
            backgroundColor: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            maxWidth: 360,
          }}>
            {message.formData.map((field, i) => (
              <div key={i} style={{ marginBottom: i < message.formData!.length - 1 ? 10 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--app-text-secondary)", marginBottom: 2 }}>
                  {field.label}
                </div>
                <div style={{ fontSize: 15, color: "var(--app-text-primary)" }}>
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        )}
        {message.files && message.files.length > 0 && (
          <FileAttachments files={message.files} onImageClick={onImageClick} />
        )}
      </div>
    </div>
  );
}

// ─── 파일/이미지 첨부 ───

function isImageFile(f: CTMessageFile): boolean {
  if (f.type === "image") return true;
  if (f.contentType?.startsWith("image/")) return true;
  if (/\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(f.name)) return true;
  return false;
}

/** content 텍스트에서 이미지 URL 추출 (Supabase storage 등 Open API fallback으로 보낸 이미지) */
const IMAGE_URL_PATTERN = /(https?:\/\/[^\s]+\.(?:jpe?g|png|gif|webp|bmp|svg)(?:\?[^\s]*)?)/gi;
function extractInlineImageUrls(content: string): string[] {
  if (!content) return [];
  const matches = content.match(IMAGE_URL_PATTERN);
  return matches ?? [];
}

function FileAttachments({ files, onImageClick }: { files: CTMessageFile[]; onImageClick?: (url: string) => void }) {
  const images = files.filter(isImageFile);
  const others = files.filter((f) => !isImageFile(f));
  const multi = images.length > 1;

  return (
    <div style={{ marginTop: 8 }}>
      {multi ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: images.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
          gap: 4, maxWidth: images.length === 2 ? 320 : 360,
        }}>
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => onImageClick?.(img.url)}
              style={{ padding: 0, border: "none", background: "none", cursor: "pointer", overflow: "hidden", borderRadius: 8, aspectRatio: "1", position: "relative" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnailUrl || img.url}
                alt={img.name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </button>
          ))}
        </div>
      ) : (
        images.map((img) => (
          <button
            key={img.id}
            onClick={() => onImageClick?.(img.url)}
            style={{ display: "block", marginBottom: 4, padding: 0, border: "none", background: "none", cursor: "pointer" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.thumbnailUrl || img.url}
              alt={img.name}
              style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 8, cursor: "pointer" }}
            />
          </button>
        ))
      )}
      {others.map((file) => (
        <a
          key={file.id}
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
            backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 8,
            textDecoration: "none", color: "#4B5563", fontSize: 15,
            marginBottom: 4,
          }}
        >
          <FileText style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {file.name}
          </span>
        </a>
      ))}
    </div>
  );
}
