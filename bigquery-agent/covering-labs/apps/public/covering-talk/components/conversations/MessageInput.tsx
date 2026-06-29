"use client";

import { useState, useEffect, useRef, useTransition, useCallback, useImperativeHandle } from "react";
import { Send, RefreshCw, PenLine, CheckCircle, Hash, ImageIcon, X, Loader2, Sparkles, AlertCircle, Paperclip, Lock } from "lucide-react";
import { MentionPicker } from "./MentionPicker";
import { parseMentions } from "@/lib/utils/mention-parser";
import { useInternalMode } from "@/lib/hooks/useInternalMode";
import { toast } from "sonner";
import type { Conversation } from "@/lib/store/conversations";
import { BLOCK_RANGES, timeSlotToBlock, type TimeBlock } from "@/lib/dispatch/time-blocks";
import { SchedulePreview, ScheduleSummaryBadge, type ScheduleData, type AbcData } from "./SchedulePreview";

interface Macro {
  id: number;
  name: string;
  content: string;
  category: string;
}

const BOOKING_CONFIRM_SIGNATURE = "날짜와 주소로 수거 예약 완료 되었습니다";

export interface MessageInputHandle {
  triggerBookingConfirm: () => void;
}

interface Props {
  sessionId: string;
  aiDraft: string | null;
  isDone: boolean;
  onSent: () => void;
  onDraftUpdated: () => void;
  droppedFile?: File | null;
  onDroppedFileConsumed?: () => void;
  conv?: Conversation;
  inputRef?: React.Ref<MessageInputHandle>;
  onTypingChange?: (typing: boolean) => void;
}

const LS_KEY = "chatbot-textarea-height";

export function MessageInput({ sessionId, aiDraft, isDone, onSent, onDraftUpdated, droppedFile, onDroppedFileConsumed, conv, inputRef, onTypingChange }: Props) {
  const [message, setMessage] = useState(() => {
    // 세션별 드래프트 복원 (이전에 타이핑하다가 다른 세션 갔다 돌아온 경우)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`chatbot-draft-${sessionId}`);
      if (saved !== null) return saved;
    }
    return aiDraft ?? "";
  });
  const [isSending, startSend] = useTransition();
  const [isRegenerating, startRegen] = useTransition();
  const [sentStatus, setSentStatus] = useState<"idle" | "sent" | "error">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isUserEditing = useRef(false); // 상담사가 직접 타이핑 중인지 추적
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // 타이핑 감지 — 입력 시 typing=true, 2초 무입력 시 typing=false
  const handleTypingSignal = useCallback(() => {
    if (!onTypingChange) return;
    if (!isTypingRef.current) { isTypingRef.current = true; onTypingChange(true); }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { isTypingRef.current = false; onTypingChange(false); }, 3000);
  }, [onTypingChange]);

  // 플랫폼별 단축키 표기 — macOS=⌘, 그 외=Ctrl
  const isMac = typeof window !== "undefined" && /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
  const modKey = isMac ? "⌘" : "Ctrl+";

  // 내부대화 모드 — ChatArea 와 공유 (AI 초안 banner 동시 숨김)
  const [internalMode, setInternalMode] = useInternalMode(sessionId);

  // 멘션 picker 상태
  const [counselors, setCounselors] = useState<{ id: number; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = picker hidden
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const [pickerAnchor, setPickerAnchor] = useState<{ left: number; bottom: number } | null>(null);
  useEffect(() => {
    fetch("/api/counselors").then((r) => r.json()).then((d) => {
      setCounselors((d.counselors ?? []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
    }).catch(() => {});
  }, []);

  // 매크로 상태
  const [macros, setMacros] = useState<Macro[]>([]);
  const [showMacroDropdown, setShowMacroDropdown] = useState(false);
  const [macroSearch, setMacroSearch] = useState("");
  const [macroHashPos, setMacroHashPos] = useState(-1); // textarea에서 # 시작 위치
  const [focusedMacroIndex, setFocusedMacroIndex] = useState(0); // 키보드 네비게이션 인덱스
  const macroDropdownRef = useRef<HTMLDivElement>(null);
  const macroSearchRef = useRef<HTMLInputElement>(null);
  const macroItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 말다듬기 상태
  const [isPolishing, setIsPolishing] = useState(false);

  // 예약확정 확인 모달
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  // 주소 정규화 상태: "idle" | "loading" | "success" | "failed"
  const [addressNormState, setAddressNormState] = useState<"idle" | "loading" | "success" | "failed">("idle");
  const [addressOriginal, setAddressOriginal] = useState<string>("");
  const [bookingForm, setBookingForm] = useState({
    name: "", phone: "", address: "", date: "", floor: "",
    timeAmPm: "오후", timeHour: "", timeMinute: "00", timeEndAmPm: "오후", timeEndHour: "", timeEndMinute: "00",
    timeBlock: null as "A" | "B" | "C" | null, // ABC 블록 선택. null 이면 수동
    elevator: null as boolean | null, parking: null as boolean | null, groundAccess: true as boolean,
    ladder: null as boolean | null,
    district: "", totalPrice: "", memo: "",
    items: [] as { category: string; name: string; quantity: number; unitPrice: number }[],
  });
  // 일정 현황
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [abcData, setAbcData] = useState<AbcData | null>(null);
  // 드래그 & 리사이즈
  const [modalPos, setModalPos] = useState({ x: -1, y: -1 }); // -1 = centered
  const [modalSize, setModalSize] = useState({ w: 480, h: 0 }); // h=0 = auto
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // 이미지 전송 상태
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingSending, setIsUploadingSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 전송 상태
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  // 일정 현황 조회 (기존 /api/schedule + ABC 블록 집계 병렬)
  const fetchSchedule = useCallback(async (date: string) => {
    if (!date) return;
    setScheduleLoading(true);
    try {
      const [schedRes, abcRes] = await Promise.all([
        fetch(`/api/schedule?date=${date}`),
        fetch(`/api/schedule/abc?date=${date}`),
      ]);
      if (schedRes.ok) setScheduleData(await schedRes.json());
      if (abcRes.ok) {
        const abc = await abcRes.json();
        setAbcData({ date: abc.date, blocks: abc.blocks });
      } else {
        setAbcData(null);
      }
    } catch { /* ignore */ }
    setScheduleLoading(false);
  }, []);

  /** 시간 문자열 → 구조화된 필드로 파싱 */
  const parseTimeToFields = (timeStr: string) => {
    let amPm = "오후", hour = "", minute = "00", endAmPm = "오후", endHour = "", endMinute = "00";
    if (!timeStr) return { amPm, hour, minute, endAmPm, endHour, endMinute };

    // "오후 2:00~오후 4:00" 또는 "오후 2:00~4:00" 형식
    const korMatch = timeStr.match(/(오전|오후)\s*(\d{1,2}):?(\d{0,2})/);
    if (korMatch) {
      amPm = korMatch[1]; hour = korMatch[2]; minute = korMatch[3] || "00";
      const endMatch = timeStr.match(/[~\-]\s*(오전|오후)?\s*(\d{1,2}):?(\d{0,2})/);
      if (endMatch) { endAmPm = endMatch[1] || amPm; endHour = endMatch[2]; endMinute = endMatch[3] || "00"; }
      return { amPm, hour, minute, endAmPm, endHour, endMinute };
    }
    // "14:00~16:00" 24h 형식
    const h24Match = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (h24Match) {
      const h = parseInt(h24Match[1]);
      minute = h24Match[2];
      amPm = h >= 12 ? "오후" : "오전";
      hour = (h > 12 ? h - 12 : h === 0 ? 12 : h).toString();
      const endMatch = timeStr.match(/[~\-]\s*(\d{1,2}):(\d{2})/);
      if (endMatch) {
        const eh = parseInt(endMatch[1]);
        endMinute = endMatch[2];
        endAmPm = eh >= 12 ? "오후" : "오전";
        endHour = (eh > 12 ? eh - 12 : eh === 0 ? 12 : eh).toString();
      }
    }
    return { amPm, hour, minute, endAmPm, endHour, endMinute };
  };

  // 외부에서 예약확정 트리거 — {{결제정보}} 는 server(send/route.ts) 가 feature flag(prepayment_enabled) ON 시
  //   결제 금액·링크·12h 자동취소 안내 블록으로 치환. OFF 면 placeholder 제거.
  const DEFAULT_BOOKING_MSG = `말씀해 주신 날짜와 주소로 수거 예약 완료 되었습니다!\n\n{{결제정보}}\n\n혹시 수거 관련하여 변동 사항이 있으신 경우, 수거 24시간 전까지만 말씀해 주세요.\n깔끔한 수거로 찾아뵙겠습니다!\n\n감사합니다 : )`;

  const initBookingForm = useCallback(() => {
    if (!conv) return;

    // ── 대화에서 날짜/시간 추출 (가장 마지막 언급 우선, booking DB는 fallback) ──
    let date = "";
    let timeStr = "";

    // 상대 날짜 파서 (기준: 메시지 작성 시각)
    const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(d.getDate() + n); return r; };
    const DOW_MAP: Record<string, number> = { "일": 0, "월": 1, "화": 2, "수": 3, "목": 4, "금": 5, "토": 6 };
    const parseRelativeDate = (text: string, baseMs: number): string | null => {
      const base = new Date(baseMs);
      // 키워드 뒤 '요'/'에'/'인가' 등 존대 어미 허용용 suffix
      const suf = "(?:요|이요|에|에요|입니다|이에요)?(?![가-힣])";
      // 오늘
      if (new RegExp(`(?:^|[^가-힣])오늘${suf}`).test(text)) return fmtDate(base);
      // 모레/모래/내일모레 — "내일"보다 먼저 체크 (내일 모레를 내일로 오인하지 않도록)
      if (new RegExp(`(?:^|[^가-힣])(?:내일\\s*모레|모레|모래)${suf}`).test(text)) return fmtDate(addDays(base, 2));
      // 글피
      if (new RegExp(`(?:^|[^가-힣])글피${suf}`).test(text)) return fmtDate(addDays(base, 3));
      // 내일/낼/익일
      if (new RegExp(`(?:^|[^가-힣])(?:내일|낼|익일)${suf}`).test(text)) return fmtDate(addDays(base, 1));
      // 이번주/금주 X요일
      const thisWeek = text.match(/(?:이번\s*주|금주)\s*([월화수목금토일])(?:요일)?/);
      if (thisWeek) {
        const target = DOW_MAP[thisWeek[1]];
        const mondayOffset = (base.getDay() + 6) % 7;
        const monday = addDays(base, -mondayOffset);
        const targetOffset = (target + 6) % 7;
        return fmtDate(addDays(monday, targetOffset));
      }
      // 다음주/차주/담주 X요일
      const nextWeek = text.match(/(?:다음\s*주|차주|담주)\s*([월화수목금토일])(?:요일)?/);
      if (nextWeek) {
        const target = DOW_MAP[nextWeek[1]];
        const mondayOffset = (base.getDay() + 6) % 7;
        const monday = addDays(base, -mondayOffset);
        const targetOffset = (target + 6) % 7;
        return fmtDate(addDays(monday, targetOffset + 7));
      }
      // 단독 X요일 — 다음 가장 빠른 해당 요일 (오늘이 그 요일이면 다음 주)
      const bare = text.match(/(?<![가-힣])([월화수목금토일])요일/);
      if (bare) {
        const target = DOW_MAP[bare[1]];
        let diff = (target - base.getDay() + 7) % 7;
        if (diff === 0) diff = 7;
        return fmtDate(addDays(base, diff));
      }
      return null;
    };

    if (conv.messages) {
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        const msg = conv.messages[i];
        // ai_draft 도 포함 (상담사가 확정 전 초안에 정돈된 날짜/시간 적혀있는 경우 많음)
        if (msg.role !== "user" && msg.role !== "assistant" && msg.role !== "ai_draft") continue;
        const content = msg.content;
        // ABC 시간안내 발송·접수 확인 자동 메시지는 시간 추출만 제외 (날짜는 추출 허용 —
        // "04월 28일(화) 수거 가능한 시간대입니다" 같은 메시지에서 28일을 살리기 위함)
        const skipTime = /수거 가능한 시간대입니다/.test(content)
          || /접수해드렸습니다 :\) 담당자가 최종 확인/.test(content);
        // 날짜 추출 (우선순위 순)
        if (!date) {
          // "2026-04-16" 형식
          const dm2 = content.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
          if (dm2) date = `${dm2[1]}-${dm2[2].padStart(2, "0")}-${dm2[3].padStart(2, "0")}`;
          // "4월 16일" 형식
          if (!date) {
            const dm = content.match(/(\d{1,2})월\s*(\d{1,2})\s*일/);
            if (dm) {
              const y = new Date().getFullYear();
              date = `${y}-${dm[1].padStart(2, "0")}-${dm[2].padStart(2, "0")}`;
            }
          }
          // "X일부터" / "X일 이후" / "X일 가능" — 가용 안내 표현 우선
          //   (예: "27일 마감, 28일부터 가능" → 28일을 의도된 날짜로 인식)
          if (!date) {
            const dayFrom = content.match(/(\d{1,2})\s*일\s*(?:부터|이후|이후로|가능)/);
            if (dayFrom) {
              const now = new Date();
              const day = parseInt(dayFrom[1]);
              if (day >= 1 && day <= 31) {
                let m = now.getMonth() + 1;
                let y = now.getFullYear();
                if (day < now.getDate()) { m++; if (m > 12) { m = 1; y++; } }
                date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              }
            }
          }
          // "4/21", "4.21" — 월/일 슬래시·점 구분 (연도 없음)
          if (!date) {
            const slash = content.match(/(?:^|[\s,(])(\d{1,2})[/.](\d{1,2})(?=[\s,.)일]|$)/);
            if (slash) {
              const mm = parseInt(slash[1]);
              const dd = parseInt(slash[2]);
              if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                const y = new Date().getFullYear();
                date = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
              }
            }
          }
          // "16일" (월 없이 일만) — 현재 월 기준
          if (!date) {
            const dayOnly = content.match(/(?<!\d)(\d{1,2})\s?일(?![가-힣])/);
            if (dayOnly) {
              const now = new Date();
              const day = parseInt(dayOnly[1]);
              if (day >= 1 && day <= 31) {
                let m = now.getMonth() + 1;
                let y = now.getFullYear();
                // 이미 지난 날이면 다음 달로
                if (day < now.getDate()) { m++; if (m > 12) { m = 1; y++; } }
                date = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              }
            }
          }
          // 상대 날짜 (오늘/내일/모레/글피/이번주·다음주 X요일) — 메시지 작성 시각 기준
          if (!date) {
            const rel = parseRelativeDate(content, msg.timestamp || Date.now());
            if (rel) date = rel;
          }
        }
        // 시간 추출 (우선순위 순) — ABC 시간안내 / 접수확인 메시지는 시간 오파싱 위험으로 제외
        if (!timeStr && !skipTime) {
          // "오후 3시", "오전 10:00~오후 1시" 등
          const tm = content.match(/(오전|오후)\s*(\d{1,2})\s*[시:~]?/);
          if (tm) { timeStr = content; }
          // "18시", "18:00" — 24시간 표기 (오전/오후 없이)
          else {
            const h24 = content.match(/(?<!\d)(\d{1,2})\s*시/);
            if (h24) {
              const h = parseInt(h24[1]);
              if (h >= 0 && h <= 23) {
                const ap = h >= 12 ? "오후" : "오전";
                const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
                timeStr = `${ap} ${h12}:00`;
              }
            }
          }
        }
        if (date && timeStr) break;
      }
    }

    // 대화에서 못 찾으면 booking DB fallback
    if (!date) date = conv.booking?.preferredDate || "";
    if (!timeStr) timeStr = conv.booking?.preferredTime || "";
    // collected_info fallback (AI 가 대화에서 추출했거나 고객이 ABC 버튼 클릭한 날짜)
    if (!date) {
      const ci = conv.collectedInfo as { requestedDate?: string | null; selectedDate?: string | null } | null;
      date = ci?.requestedDate || ci?.selectedDate || "";
    }

    // 시간 파싱
    let amPm = "오후", hour = "", minute = "00", endAmPm = "오후", endHour = "", endMinute = "00";
    if (timeStr) {
      // "오후 3~4시" 또는 "오후 3시~4시" 또는 "오전 11시~오후 1시"
      const rangeMatch = timeStr.match(/(오전|오후)\s*(\d{1,2})\s*[시:]?\s*(\d{0,2})\s*[~\-]\s*(?:(오전|오후)\s*)?(\d{1,2})\s*[시:]?\s*(\d{0,2})/);
      if (rangeMatch) {
        amPm = rangeMatch[1]; hour = rangeMatch[2]; minute = rangeMatch[3] || "00";
        endAmPm = rangeMatch[4] || amPm; endHour = rangeMatch[5]; endMinute = rangeMatch[6] || "00";
      } else {
        const tp = parseTimeToFields(timeStr);
        amPm = tp.amPm; hour = tp.hour; minute = tp.minute;
        endAmPm = tp.endAmPm; endHour = tp.endHour; endMinute = tp.endMinute;
      }
    }

    // ── 특이사항 자동 채움 ──
    const specialNotes = (conv.collectedInfo?.special_notes as string[] | undefined)?.join(", ") || "";
    const memoSummary = conv.memo || "";
    const memo = [specialNotes, memoSummary].filter(Boolean).join("\n") || "";

    // ── 품목 자동 채움 ──
    const items = (conv.quote?.items ?? []).map((item: { category?: string; name?: string; spec?: string; quantity?: number; unitPrice?: number }) => ({
      category: item.category || "기타",
      name: item.name || item.spec || "",
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
    }));

    const rawAddress = conv.collectedInfo?.address || "";

    // ABC 블록 자동 감지
    //   1) collectedInfo.selectedTimeBlock (고객이 ABC 버튼 클릭한 경우) 최우선
    //   2) 없으면 timeStr 파싱 후 블록 판정 (블록 밖이면 null → 수동)
    const selectedBlock = (conv.collectedInfo?.selectedTimeBlock as TimeBlock | undefined) ?? null;
    const autoBlock: TimeBlock | null = selectedBlock || timeSlotToBlock(timeStr);

    // 블록 확정 시 개별 시/분 필드도 해당 블록 기준으로 강제 세팅.
    //   (과거 버그: AI 발송 메시지·대화 속 다른 시각 표현이 timeStr 에 걸려 버려서
    //    블록이 "A" 여도 timeHour/timeEndHour 가 엉뚱한 값으로 저장되던 케이스 방지)
    if (autoBlock) {
      const r = BLOCK_RANGES[autoBlock];
      amPm = r.startH < 12 ? "오전" : "오후";
      hour = String(r.startH < 12 ? r.startH : r.startH === 12 ? 12 : r.startH - 12);
      minute = "00";
      endAmPm = r.endH >= 12 ? "오후" : "오전";
      endHour = String(r.endH === 12 ? 12 : r.endH > 12 ? r.endH - 12 : r.endH);
      endMinute = "00";
    }

    setBookingForm({
      name: conv.name || "",
      phone: conv.phone || "",
      address: rawAddress,
      date,
      floor: conv.collectedInfo?.floor?.toString() || "",
      timeAmPm: amPm, timeHour: hour, timeMinute: minute,
      timeEndAmPm: endAmPm, timeEndHour: endHour, timeEndMinute: endMinute,
      timeBlock: autoBlock,
      elevator: conv.collectedInfo?.elevator ?? null,
      parking: conv.collectedInfo?.parking ?? null,
      groundAccess: true,
      // 견적에 사다리차비가 잡혀있거나 booking 에 표시돼 있으면 자동 O
      ladder: (conv.quote?.ladderFee ?? 0) > 0 || conv.booking?.ladderNeeded ? true : null,
      district: conv.collectedInfo?.district || "",
      totalPrice: conv.quote?.totalPrice?.toString() || "",
      memo,
      items,
    });
    setModalPos({ x: -1, y: -1 });
    setModalSize({ w: 500, h: 0 });
    if (date) fetchSchedule(date);

    // 주소 정규화 자동 실행 (실패 시 원문 유지)
    setAddressOriginal(rawAddress);
    setAddressNormState("idle");
    if (rawAddress.trim().length >= 4) {
      setAddressNormState("loading");
      (async () => {
        try {
          const res = await fetch("/api/address/normalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: rawAddress }),
          });
          const data = await res.json();
          if (res.ok && data.matched) {
            const combined = data.detail ? `${data.fullAddress} ${data.detail}`.trim() : data.fullAddress;
            setBookingForm((prev) => ({
              ...prev,
              address: combined,
              district: data.sigungu || prev.district,
            }));
            setAddressNormState("success");
          } else {
            setAddressNormState("failed");
          }
        } catch {
          setAddressNormState("failed");
        }
      })();
    }
  }, [conv, fetchSchedule]);

  useImperativeHandle(inputRef, () => ({
    triggerBookingConfirm: () => {
      if (!conv) return;
      setMessage(DEFAULT_BOOKING_MSG);
      initBookingForm();
      setShowBookingConfirm(true);
    },
  }));

  // localStorage에서 textarea 높이 복원
  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && textareaRef.current) {
      textareaRef.current.style.height = saved;
    }
  }, []);

  // textarea 크기 변경 감지 → localStorage 저장
  const handleResize = useCallback(() => {
    if (textareaRef.current) {
      localStorage.setItem(LS_KEY, textareaRef.current.style.height || `${textareaRef.current.offsetHeight}px`);
    }
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(handleResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleResize]);

  // 세션 변경 시 편집 상태 리셋
  useEffect(() => {
    isUserEditing.current = false;
  }, [sessionId]);

  // 드래그앤드랍 파일 처리 (이미지 → 이미지 모드, 그 외 → 파일 모드)
  useEffect(() => {
    if (!droppedFile) return;
    if (droppedFile.type.startsWith("image/")) {
      (async () => {
        const compressed = await compressImage(droppedFile);
        setImageFile(compressed);
        const reader = new FileReader();
        reader.onload = (ev) => setImagePreview(ev.target?.result as string);
        reader.readAsDataURL(compressed);
        onDroppedFileConsumed?.();
      })();
    } else {
      // 파일 드랍 → 파일 전송 모드
      setPendingFile(droppedFile);
      onDroppedFileConsumed?.();
    }
  }, [droppedFile, onDroppedFileConsumed]);

  // aiDraft가 변경되면 텍스트박스에 반영 (상담사 타이핑 중 또는 예약확정 모달 열림 시 무시)
  useEffect(() => {
    if (isUserEditing.current) return;
    if (showBookingConfirm) return;
    if (internalMode) return; // 내부대화 모드 — AI draft 자동 채움 안 함
    // 저장된 드래프트가 있으면 aiDraft로 덮어쓰지 않음
    if (typeof window !== "undefined" && localStorage.getItem(`chatbot-draft-${sessionId}`) !== null) return;
    if (aiDraft !== null && aiDraft !== "") {
      setMessage(aiDraft);
    } else if (aiDraft === null) {
      setMessage("");
    }
  }, [aiDraft, sessionId, internalMode]);

  // 외부 ↔ 내부 모드 전환 — 각자 별도 텍스트 보존
  const prevInternalRef = useRef(internalMode);
  const externalDraftRef = useRef<string>("");
  const internalDraftRef = useRef<string>("");
  useEffect(() => {
    if (prevInternalRef.current === internalMode) return;
    if (internalMode) {
      // 외부 → 내부: 외부 텍스트 보관 후 내부 텍스트 복원
      externalDraftRef.current = message;
      setMessage(internalDraftRef.current);
    } else {
      // 내부 → 외부: 내부 텍스트 보관 후 외부 텍스트 복원
      internalDraftRef.current = message;
      setMessage(externalDraftRef.current);
    }
    prevInternalRef.current = internalMode;
  }, [internalMode, message]);

  // 전송 성공 표시 자동 사라짐
  useEffect(() => {
    if (sentStatus === "sent") {
      const t = setTimeout(() => setSentStatus("idle"), 2000);
      return () => clearTimeout(t);
    }
  }, [sentStatus]);

  // 매크로 로드
  useEffect(() => {
    fetch("/api/macros")
      .then(r => r.json())
      .then(d => setMacros(d.macros ?? []))
      .catch(() => {});
  }, []);

  // 매크로 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!showMacroDropdown) return;
    const handler = (e: MouseEvent) => {
      if (macroDropdownRef.current && !macroDropdownRef.current.contains(e.target as Node)) {
        setShowMacroDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMacroDropdown]);

  // 매크로 드롭다운 열리면 검색 입력 포커스 + 인덱스 초기화
  useEffect(() => {
    if (showMacroDropdown) {
      setFocusedMacroIndex(0);
      // 버튼으로 열었을 때만 검색 입력에 포커스
      if (macroHashPos < 0 && macroSearchRef.current) {
        macroSearchRef.current.focus();
      }
    }
  }, [showMacroDropdown, macroHashPos]);

  if (isDone) {
    return (
      <div style={{
        borderTop: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
        padding: "20px 24px", textAlign: "center",
        fontSize: 16, color: "var(--app-text-tertiary)",
      }}>
        처리 완료된 상담입니다
      </div>
    );
  }

  const handleSend = () => {
    if (!message.trim()) { toast.error("메시지를 입력해주세요."); return; }
    // 내부대화 모드 — 별도 endpoint, 고객에게 절대 안 나감
    if (internalMode) {
      sendInternalMessage();
      return;
    }
    // 예약확정 메시지 감지 → 확인 모달 표시
    if (conv && message.includes(BOOKING_CONFIRM_SIGNATURE) && !showBookingConfirm) {
      initBookingForm();
      setShowBookingConfirm(true);
      return;
    }
    doSend();
  };

  const sendInternalMessage = () => {
    const text = message.trim();
    const { ids } = parseMentions(text, counselors);
    startSend(async () => {
      try {
        const res = await fetch(`/api/conversations/${sessionId}/internal-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, mentionedUserIds: ids }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? "내부대화 전송 실패");
        }
        setMessage("");
        localStorage.removeItem(`chatbot-draft-${sessionId}`);
        setSentStatus("sent");
        setTimeout(() => setSentStatus("idle"), 1500);
        onSent();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "내부대화 전송 실패");
        setSentStatus("error");
      }
    });
  };

  const doSend = () => {
    const isEdited = aiDraft !== null && message.trim() !== aiDraft.trim();
    const isBookingConfirm = showBookingConfirm;
    const formSnapshot = { ...bookingForm };

    startSend(async () => {
      try {
        // 빈 날짜 차단 — 빈 값이 PATCH로 전송되면 기존 date 가 날아가는 회귀 방지
        if (isBookingConfirm && !formSnapshot.date) {
          toast.error("수거 희망 날짜가 비어있습니다. 날짜를 입력해 주세요.", { duration: 5000 });
          return;
        }
        // 과거 날짜 차단
        if (isBookingConfirm && formSnapshot.date) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const target = new Date(`${formSnapshot.date}T00:00:00`);
          if (target < today) {
            toast.error("과거 날짜로는 예약할 수 없습니다. 날짜를 확인해 주세요.", { duration: 5000 });
            return;
          }
        }

        // ABC 블록 선택 시 해당 블록 케파 재검증 (수동 시간 선택은 스킵)
        if (isBookingConfirm && formSnapshot.timeBlock && formSnapshot.date) {
          try {
            const chk = await fetch(`/api/schedule/abc?date=${formSnapshot.date}`);
            if (chk.ok) {
              const sched = await chk.json();
              const blockInfo = sched.blocks?.[formSnapshot.timeBlock];
              if (blockInfo && !blockInfo.available) {
                const label = BLOCK_RANGES[formSnapshot.timeBlock as TimeBlock].label;
                toast.error(`${formSnapshot.date} ${label} 슬롯이 마감되었습니다. 다른 시간대를 선택해 주세요.`, { duration: 6000 });
                return;
              }
            }
          } catch { /* 검증 실패 시 통과 (네트워크 이슈로 저장 차단 방지) */ }
        }

        const res = await fetch(`/api/conversations/${sessionId}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim(), isEdited }),
        });
        const d = await res.json();
        if (!res.ok) { throw new Error(d.error ?? "전송 실패"); }
        if (d.status === "session_expired") {
          toast.info(d.message || "고객이 채팅방을 나가셨습니다. 상담이 종료됩니다.");
          setMessage("");
          localStorage.removeItem(`chatbot-draft-${sessionId}`);
          isUserEditing.current = false;
          onSent();
          return;
        }

        // 예약확정 모달에서 수정된 데이터 반영
        if (isBookingConfirm && formSnapshot.name) {
          try {
            // orders 테이블: 활성 주문(confirmed/payment_requested) 찾기, 없으면 새로 생성
            const orderRes = await fetch(`/api/orders?sessionId=${sessionId}`);
            const orderData = await orderRes.json();
            const allOrders = orderData.orders ?? [];
            // 완료/취소가 아닌 활성 주문 우선, 없으면 새로 생성
            const order = allOrders.find((o: { status: string }) => o.status === "confirmed" || o.status === "payment_requested")
              || null;
            if (order) {
              await fetch(`/api/orders/${order.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  customerName: formSnapshot.name,
                  phone: formSnapshot.phone,
                  address: formSnapshot.address,
                  date: formSnapshot.date,
                  // 블록 선택 시 무조건 블록 슬롯 포맷으로 정규화 (단일 시각으로 저장되던 버그 차단)
                  timeSlot: formSnapshot.timeBlock
                    ? BLOCK_RANGES[formSnapshot.timeBlock].slot
                    : formSnapshot.timeHour
                      ? `${formSnapshot.timeAmPm} ${formSnapshot.timeHour}:${formSnapshot.timeMinute || "00"}${formSnapshot.timeEndHour ? `~${formSnapshot.timeEndAmPm} ${formSnapshot.timeEndHour}:${formSnapshot.timeEndMinute || "00"}` : ""}`
                      : "",
                  totalPrice: parseInt(formSnapshot.totalPrice) || order.totalPrice || 0,
                  hasElevator: formSnapshot.elevator ?? false,
                  hasParking: formSnapshot.parking ?? false,
                  hasGroundAccess: formSnapshot.groundAccess ?? true,
                  needLadder: formSnapshot.ladder ?? false,
                  memo: formSnapshot.memo || "",
                  items: formSnapshot.items?.map((it) => ({
                    category: it.category,
                    name: it.name,
                    displayName: `${it.category} - ${it.name}`,
                    price: it.unitPrice,
                    quantity: it.quantity,
                  })) || order.items,
                }),
              });
            } else {
              // 활성 주문이 없으면 새로 생성
              await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sessionId,
                  customerName: formSnapshot.name,
                  phone: formSnapshot.phone,
                  address: formSnapshot.address,
                  date: formSnapshot.date,
                  // 블록 선택 시 무조건 블록 슬롯 포맷으로 정규화 (단일 시각으로 저장되던 버그 차단)
                  timeSlot: formSnapshot.timeBlock
                    ? BLOCK_RANGES[formSnapshot.timeBlock].slot
                    : formSnapshot.timeHour
                      ? `${formSnapshot.timeAmPm} ${formSnapshot.timeHour}:${formSnapshot.timeMinute || "00"}${formSnapshot.timeEndHour ? `~${formSnapshot.timeEndAmPm} ${formSnapshot.timeEndHour}:${formSnapshot.timeEndMinute || "00"}` : ""}`
                      : "",
                  totalPrice: parseInt(formSnapshot.totalPrice) || 0,
                  hasElevator: formSnapshot.elevator ?? false,
                  hasParking: formSnapshot.parking ?? false,
                  hasGroundAccess: formSnapshot.groundAccess ?? true,
                  needLadder: formSnapshot.ladder ?? false,
                  memo: formSnapshot.memo || "",
                  items: formSnapshot.items?.map((it) => ({
                    category: it.category,
                    name: it.name,
                    displayName: `${it.category} - ${it.name}`,
                    price: it.unitPrice,
                    quantity: it.quantity,
                  })) || [],
                }),
              });
            }
            // conversations 정보도 업데이트
            await fetch(`/api/conversations/${sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: formSnapshot.name,
                phone: formSnapshot.phone,
              }),
            });
          } catch { /* 업데이트 실패해도 메시지 전송은 성공 */ }
        }

        setSentStatus("sent");
        setMessage("");
        localStorage.removeItem(`chatbot-draft-${sessionId}`);
        isUserEditing.current = false;
        setShowBookingConfirm(false);
        onSent();
      } catch (e: unknown) {
        setSentStatus("error");
        toast.error(e instanceof Error ? e.message : "전송 중 오류 발생");
      }
    });
  };

  const handleRegenerate = () => {
    startRegen(async () => {
      try {
        const res = await fetch(`/api/conversations/${sessionId}/regenerate`, { method: "POST" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setMessage(data.aiDraft);
        isUserEditing.current = false;
        onDraftUpdated();
      } catch { toast.error("AI 재생성에 실패했습니다."); }
    });
  };

  // 말다듬기
  const handlePolish = async () => {
    if (!message.trim() || isPolishing) return;
    setIsPolishing(true);
    try {
      const res = await fetch(`/api/conversations/${sessionId}/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessage(data.polished);
      isUserEditing.current = true;
      toast.success("메시지를 다듬었습니다");
    } catch {
      toast.error("말다듬기에 실패했습니다");
    } finally {
      setIsPolishing(false);
    }
  };

  // # 입력 감지
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);
    isUserEditing.current = val.trim().length > 0;
    handleTypingSignal();
    // 세션별 드래프트 저장
    if (val) {
      localStorage.setItem(`chatbot-draft-${sessionId}`, val);
    } else {
      localStorage.removeItem(`chatbot-draft-${sessionId}`);
    }

    // # 감지: 마지막으로 입력한 문자가 #이고, 그 앞이 줄 시작이나 공백인지 확인
    const cursorPos = e.target.selectionStart;
    if (cursorPos > 0) {
      const beforeCursor = val.substring(0, cursorPos);
      const lastHash = beforeCursor.lastIndexOf("#");
      if (lastHash >= 0 && (lastHash === 0 || /\s/.test(val[lastHash - 1]))) {
        const afterHash = beforeCursor.substring(lastHash + 1);
        // #뒤에 줄바꿈이 없고, 연속된 텍스트
        if (!afterHash.includes("\n") && afterHash.length < 30) {
          setMacroHashPos(lastHash);
          setMacroSearch(afterHash);
          setShowMacroDropdown(true);
          return;
        }
      }
    }

    // # 조건 아니면 드롭다운 닫기
    if (showMacroDropdown) {
      setShowMacroDropdown(false);
    }

    // @ 감지: 내부대화 모드에서만, 마지막 @ 위치가 줄시작/공백 뒤일 때 picker 표시
    if (internalMode && cursorPos > 0) {
      const beforeCursor = val.substring(0, cursorPos);
      const lastAt = beforeCursor.lastIndexOf("@");
      if (lastAt >= 0 && (lastAt === 0 || /\s/.test(val[lastAt - 1]))) {
        const afterAt = beforeCursor.substring(lastAt + 1);
        if (!/\s/.test(afterAt) && afterAt.length < 16) {
          setMentionStartPos(lastAt);
          setMentionQuery(afterAt);
          // 캐럿 좌표 근사 — textarea 의 box 기준 좌측+하단
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

  // 매크로 선택
  const selectMacro = (macro: Macro) => {
    if (macroHashPos >= 0) {
      // textarea에서 #keyword 부분을 매크로 내용으로 대체
      const before = message.substring(0, macroHashPos);
      const cursorPos = textareaRef.current?.selectionStart ?? message.length;
      const after = message.substring(cursorPos);
      setMessage(before + macro.content + after);
    } else {
      // 버튼으로 열었을 때: 기존 내용 대체
      setMessage(macro.content);
    }
    setShowMacroDropdown(false);
    setMacroSearch("");
    setMacroHashPos(-1);
    textareaRef.current?.focus();
  };

  // # 버튼 클릭
  const openMacroDropdown = () => {
    setMacroHashPos(-1);
    setMacroSearch("");
    setShowMacroDropdown(!showMacroDropdown);
  };

  // 매크로 필터
  const filteredMacros = macroSearch.trim()
    ? macros.filter(m => m.name.toLowerCase().includes(macroSearch.toLowerCase()))
    : macros;

  // 카테고리별 그룹핑
  const groupedMacros: Record<string, Macro[]> = {};
  for (const m of filteredMacros) {
    if (!groupedMacros[m.category]) groupedMacros[m.category] = [];
    groupedMacros[m.category].push(m);
  }

  // 키보드 네비게이션용 플랫 리스트
  const flatMacroList = Object.values(groupedMacros).flat();

  // 매크로 키보드 네비게이션 핸들러
  const handleMacroKeyDown = (e: React.KeyboardEvent) => {
    if (!showMacroDropdown || flatMacroList.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(focusedMacroIndex + 1, flatMacroList.length - 1);
      setFocusedMacroIndex(next);
      macroItemRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max(focusedMacroIndex - 1, 0);
      setFocusedMacroIndex(prev);
      macroItemRefs.current[prev]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flatMacroList[focusedMacroIndex]) {
        selectMacro(flatMacroList[focusedMacroIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowMacroDropdown(false);
    }
  };

  // 이미지 압축 (Canvas 리사이즈)
  const compressImage = (file: File, maxWidth = 1600, quality = 0.82): Promise<File> => {
    return new Promise((resolve) => {
      // 이미 작으면 그대로 반환
      if (file.size < 500 * 1024) { resolve(file); return; }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  // 이미지 선택
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("파일 크기가 20MB를 초과합니다");
      return;
    }
    // 압축 후 저장
    const compressed = await compressImage(file);
    setImageFile(compressed);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(compressed);
  };

  // 이미지 업로드 + 전송 (send-image API에서 업로드+전송 한번에 처리)
  const handleImageSend = async () => {
    if (!imageFile) return;
    setIsUploadingSending(true);
    try {
      const formData = new FormData();
      formData.append("file", imageFile);

      const res = await fetch(`/api/conversations/${sessionId}/send-image`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        let errorMsg = "이미지 전송 실패";
        try { const d = await res.json(); errorMsg = d.error ?? errorMsg; } catch { errorMsg = `이미지 전송 실패 (${res.status})`; }
        throw new Error(errorMsg);
      }

      toast.success("이미지 전송 완료");
      setImageFile(null);
      setImagePreview(null);
      onSent();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "이미지 전송 실패");
    } finally {
      setIsUploadingSending(false);
    }
  };

  const cancelImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 파일 선택
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast.error("파일 크기가 50MB를 초과합니다"); return; }
    setPendingFile(file);
  };

  // 파일 전송
  const handleFileSend = async () => {
    if (!pendingFile) return;
    setIsSendingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const res = await fetch(`/api/conversations/${sessionId}/send-file`, { method: "POST", body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "파일 전송 실패"); }
      toast.success(`파일 전송 완료: ${pendingFile.name}`);
      setPendingFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = "";
      onSent();
    } catch (e) { toast.error(e instanceof Error ? e.message : "파일 전송 실패"); }
    finally { setIsSendingFile(false); }
  };

  const cancelFile = () => { setPendingFile(null); if (docFileInputRef.current) docFileInputRef.current.value = ""; };

  // 드래그 핸들러
  const onDragStart = (e: React.MouseEvent) => {
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setModalPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 리사이즈 핸들러
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget.parentElement as HTMLElement);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: el.offsetWidth, origH: el.offsetHeight };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setModalSize({ w: Math.max(380, resizeRef.current.origW + dw), h: Math.max(300, resizeRef.current.origH + dh) });
    };
    const onUp = () => { resizeRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const bf = bookingForm;
  const setBf = (k: string, v: unknown) => setBookingForm((p) => ({ ...p, [k]: v }));

  /** 전화번호 자동 하이픈: 01012345678 → 010-1234-5678 */
  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 11);
    let formatted = digits;
    if (digits.length > 3 && digits.length <= 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
    else if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    setBf("phone", formatted);
  };

  const quoteItems = conv?.quote?.items ?? [];
  // 빈 필드 감지
  const emptyFields = showBookingConfirm ? [
    !bf.name && "고객명",
    !bf.phone && "연락처",
    !bf.address && "주소",
    !bf.date && "날짜",
  ].filter(Boolean) : [];

  // 예약 확정 경고 (블로킹 아님, 실수 방지용 주의)
  const bookingWarnings = (() => {
    if (!showBookingConfirm) return { date: null as string | null, time: null as string | null };
    const todayStr = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    let dateWarn: string | null = null;
    if (bf.date) {
      if (bf.date < todayStr) dateWarn = `지난 날짜입니다 (오늘: ${todayStr}). 확인해주세요`;
      else if (bf.date === todayStr) dateWarn = "오늘 날짜입니다. 당일 예약이 맞는지 확인해주세요";
    }

    const to24 = (ampm: string, hour: string): number | null => {
      const h = parseInt(hour, 10);
      if (isNaN(h)) return null;
      if (ampm === "오전") return h === 12 ? 0 : h;
      return h === 12 ? 12 : h + 12;
    };
    const startH = to24(bf.timeAmPm, bf.timeHour);
    const endH = to24(bf.timeEndAmPm, bf.timeEndHour);
    const warnings: string[] = [];
    if (startH !== null && (startH < 9 || startH >= 20)) warnings.push(`시작 ${bf.timeAmPm} ${bf.timeHour}시`);
    if (endH !== null && (endH > 20 || endH < 9)) warnings.push(`종료 ${bf.timeEndAmPm} ${bf.timeEndHour}시`);
    const timeWarn = warnings.length > 0
      ? `운영시간(오전 9시~오후 8시) 외 시간입니다: ${warnings.join(", ")}`
      : null;

    return { date: dateWarn, time: timeWarn };
  })();

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "6px 10px", fontSize: 13, border: "1px solid var(--app-border)",
    borderRadius: 6, outline: "none", boxSizing: "border-box", backgroundColor: "var(--app-surface)",
    color: "var(--app-text-primary)",
  };
  const emptyInputStyle: React.CSSProperties = { ...inputStyle, borderColor: "#E8344E", backgroundColor: "#FFF5F5" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", whiteSpace: "nowrap" };

  return (
    <div style={{ borderTop: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)", position: "relative" }}>
      {/* 예약확정 확인 모달 — 드래그/리사이즈/편집 가능 */}
      {showBookingConfirm && (
        <div
          style={{
            position: "fixed", zIndex: 9999,
            ...(modalPos.x < 0
              ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
              : { top: modalPos.y, left: modalPos.x, transform: "none" }),
            width: modalSize.w,
            ...(modalSize.h > 0 ? { height: modalSize.h } : {}),
            maxHeight: "85vh",
            backgroundColor: "var(--app-surface)", borderRadius: 14,
            boxShadow: "0 8px 40px rgba(0,0,0,0.25), 0 0 0 1px var(--app-border)",
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* 타이틀바 — 드래그 핸들 */}
          <div
            onMouseDown={onDragStart}
            style={{
              padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid var(--app-border)", cursor: "grab",
              backgroundColor: "var(--app-bg)", userSelect: "none", flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle style={{ width: 18, height: 18, color: "var(--app-accent)" }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>예약 확정 확인</span>
              {emptyFields.length > 0 && (
                <span style={{ fontSize: 11, color: "#E8344E", fontWeight: 600 }}>
                  ({emptyFields.join(", ")} 미입력)
                </span>
              )}
            </div>
            <button onClick={() => setShowBookingConfirm(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
              <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
            </button>
          </div>

          {/* 스크롤 본문 */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {/* 고객 정보 */}
            <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "8px 10px", alignItems: "center" }}>
              <span style={labelStyle}>고객명</span>
              <input value={bf.name} onChange={(e) => setBf("name", e.target.value)} placeholder="고객 성함"
                style={!bf.name ? emptyInputStyle : inputStyle} />
              <span style={labelStyle}>연락처</span>
              <input value={bf.phone} onChange={(e) => handlePhoneChange(e.target.value)} placeholder="010-0000-0000"
                style={!bf.phone ? emptyInputStyle : inputStyle} />
              <span style={labelStyle}>주소</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={bf.address} onChange={(e) => { setBf("address", e.target.value); setAddressNormState("idle"); }} placeholder="수거 주소"
                    style={{ ...(!bf.address ? emptyInputStyle : inputStyle), flex: 1 }} />
                  <button type="button" disabled={addressNormState === "loading" || !bf.address.trim()}
                    onClick={async () => {
                      const addr = bf.address.trim();
                      if (addr.length < 4) return;
                      setAddressOriginal(addr);
                      setAddressNormState("loading");
                      try {
                        const res = await fetch("/api/address/normalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: addr }) });
                        const data = await res.json();
                        if (res.ok && data.matched) {
                          const combined = data.detail ? `${data.fullAddress} ${data.detail}`.trim() : data.fullAddress;
                          setBf("address", combined);
                          if (data.sigungu) setBf("district", data.sigungu);
                          setAddressNormState("success");
                        } else {
                          setAddressNormState("failed");
                        }
                      } catch {
                        setAddressNormState("failed");
                      }
                    }}
                    style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, border: "1px solid var(--app-border)", borderRadius: 6, backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)", cursor: (addressNormState === "loading" || !bf.address.trim()) ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                    {addressNormState === "loading" ? "..." : "정규화"}
                  </button>
                </div>
                {addressNormState === "success" && addressOriginal && addressOriginal !== bf.address && (
                  <span style={{ fontSize: 11, color: "#059669" }} title={`원문: ${addressOriginal}`}>
                    ✓ 정규화됨 · 원문: {addressOriginal.length > 40 ? addressOriginal.slice(0, 40) + "..." : addressOriginal}
                  </span>
                )}
                {addressNormState === "failed" && (
                  <span style={{ fontSize: 11, color: "#D97706" }}>⚠ 매칭 실패 — 주소 확인 후 재시도 또는 수동 입력</span>
                )}
              </div>
              <span style={labelStyle}>층수</span>
              <input value={bf.floor} onChange={(e) => setBf("floor", e.target.value)} placeholder="예: 3"
                style={inputStyle} />
              <span style={labelStyle}>날짜</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <input type="date" value={bf.date} onChange={(e) => {
                  setBf("date", e.target.value);
                  if (e.target.value) fetchSchedule(e.target.value);
                }} style={!bf.date ? emptyInputStyle : inputStyle} />
                {bookingWarnings.date && (
                  <div style={{
                    fontSize: 11, fontWeight: 600, color: "#92400E",
                    backgroundColor: "#FFFBEB", border: "1px solid #FDE68A",
                    padding: "5px 8px", borderRadius: 6,
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
                    {bookingWarnings.date}
                  </div>
                )}
              </div>
              <span style={labelStyle}>지역</span>
              <input value={bf.district} onChange={(e) => setBf("district", e.target.value)} placeholder="예: 강남구"
                style={inputStyle} />
              <span style={labelStyle}>금액</span>
              <input value={bf.totalPrice} onChange={(e) => setBf("totalPrice", e.target.value)} placeholder="예: 150000"
                style={inputStyle} />
            </div>

            {/* 수거시간 — ABC 블록 우선 + 수동 */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 6 }}>수거시간</div>
              {/* ABC 블록 라디오 */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                {(["A", "B", "C"] as const).map((block) => {
                  const active = bf.timeBlock === block;
                  const colors = {
                    A: { bg: "#E3F2FD", text: "#1565C0", border: "#90CAF9" },
                    B: { bg: "#FFF3E0", text: "#E65100", border: "#FFCC80" },
                    C: { bg: "#EDE9FE", text: "#6D28D9", border: "#C4B5FD" },
                  }[block];
                  return (
                    <button type="button" key={block}
                      onClick={() => {
                        const r = BLOCK_RANGES[block];
                        setBookingForm((p) => ({
                          ...p,
                          timeBlock: block,
                          timeAmPm: r.startH < 12 ? "오전" : "오후",
                          timeHour: String(r.startH < 12 ? r.startH : r.startH - 12),
                          timeMinute: "00",
                          timeEndAmPm: r.endH >= 12 ? "오후" : "오전",
                          timeEndHour: String(r.endH === 12 ? 12 : r.endH > 12 ? r.endH - 12 : r.endH),
                          timeEndMinute: "00",
                        }));
                      }}
                      style={{
                        padding: "6px 12px", fontSize: 13, fontWeight: 700, borderRadius: 6, cursor: "pointer",
                        backgroundColor: active ? colors.bg : "var(--app-surface)",
                        color: active ? colors.text : "var(--app-text-secondary)",
                        border: `1.5px solid ${active ? colors.text : "var(--app-border)"}`,
                      }}>
                      {block} {BLOCK_RANGES[block].label}
                    </button>
                  );
                })}
                <button type="button"
                  onClick={() => setBookingForm((p) => ({ ...p, timeBlock: null }))}
                  style={{
                    padding: "6px 12px", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                    backgroundColor: bf.timeBlock === null ? "#F3F4F6" : "var(--app-surface)",
                    color: bf.timeBlock === null ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                    border: `1.5px solid ${bf.timeBlock === null ? "var(--app-text-secondary)" : "var(--app-border)"}`,
                  }}>
                  수동
                </button>
              </div>
              {/* 블록 선택 시 자동 설정 표시, 수동 선택 시 기존 필드 */}
              {bf.timeBlock ? (
                <div style={{ fontSize: 12, color: "#059669", padding: "6px 10px", backgroundColor: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 6 }}>
                  ✓ 자동 설정: {BLOCK_RANGES[bf.timeBlock].slot}
                </div>
              ) : (
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <select value={bf.timeAmPm} onChange={(e) => setBf("timeAmPm", e.target.value)}
                  style={{
                    width: 68, padding: "6px 4px", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                    backgroundColor: bf.timeAmPm === "오전" ? "#E3F2FD" : "#FFF3E0",
                    color: bf.timeAmPm === "오전" ? "#1565C0" : "#E65100",
                    border: `1.5px solid ${bf.timeAmPm === "오전" ? "#90CAF9" : "#FFCC80"}`,
                  }}>
                  <option value="오전" style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}>오전</option>
                  <option value="오후" style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}>오후</option>
                </select>
                <input type="number" value={bf.timeHour} onChange={(e) => setBf("timeHour", e.target.value)}
                  placeholder="시" min={1} max={12}
                  style={{ width: 44, padding: "6px 2px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 6, textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)", fontSize: 13 }}>:</span>
                <input type="number" value={bf.timeMinute} onChange={(e) => setBf("timeMinute", e.target.value)}
                  placeholder="분" min={0} max={59}
                  style={{ width: 44, padding: "6px 2px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 6, textAlign: "center" }} />
                <span style={{ color: "var(--app-text-tertiary)", margin: "0 2px", fontSize: 13 }}>~</span>
                <select value={bf.timeEndAmPm} onChange={(e) => setBf("timeEndAmPm", e.target.value)}
                  style={{
                    width: 68, padding: "6px 4px", fontSize: 13, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                    backgroundColor: bf.timeEndAmPm === "오전" ? "#E3F2FD" : "#FFF3E0",
                    color: bf.timeEndAmPm === "오전" ? "#1565C0" : "#E65100",
                    border: `1.5px solid ${bf.timeEndAmPm === "오전" ? "#90CAF9" : "#FFCC80"}`,
                  }}>
                  <option value="오전" style={{ backgroundColor: "#E3F2FD", color: "#1565C0" }}>오전</option>
                  <option value="오후" style={{ backgroundColor: "#FFF3E0", color: "#E65100" }}>오후</option>
                </select>
                <input type="number" value={bf.timeEndHour} onChange={(e) => setBf("timeEndHour", e.target.value)}
                  placeholder="시" min={1} max={12}
                  style={{ width: 44, padding: "6px 2px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 6, textAlign: "center" }} />
                <span style={{ color: "var(--app-text-secondary)", fontSize: 13 }}>:</span>
                <input type="number" value={bf.timeEndMinute} onChange={(e) => setBf("timeEndMinute", e.target.value)}
                  placeholder="분" min={0} max={59}
                  style={{ width: 44, padding: "6px 2px", fontSize: 13, border: "1px solid var(--app-border)", borderRadius: 6, textAlign: "center" }} />
              </div>
              )}
              {!bf.timeBlock && (
                <div style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginTop: 3 }}>종료시간은 선택사항 (예: 오후 2:00 ~ 오후 4:30)</div>
              )}
              {!bf.timeBlock && bookingWarnings.time && (
                <div style={{
                  marginTop: 6, fontSize: 11, fontWeight: 600, color: "#92400E",
                  backgroundColor: "#FFFBEB", border: "1px solid #FDE68A",
                  padding: "6px 8px", borderRadius: 6,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />
                  {bookingWarnings.time}
                </div>
              )}
            </div>

            {/* 예약 현황 */}
            {bf.date && (
              <div style={{ marginTop: 12, padding: "10px 12px", backgroundColor: "var(--app-bg)", borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-primary)" }}>
                    {bf.date.replace(/-/g, ".")} 예약 현황
                  </div>
                  <ScheduleSummaryBadge data={scheduleData} loading={scheduleLoading} />
                </div>
                <SchedulePreview
                  scheduleData={scheduleData}
                  abcData={abcData}
                  loading={scheduleLoading}
                  mode="compact"
                />
              </div>
            )}

            {/* 조건 토글 */}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {[
                { key: "elevator", label: "엘리베이터" },
                { key: "parking", label: "주차" },
                { key: "groundAccess", label: "지상출입" },
                { key: "ladder", label: "사다리차" },
              ].map(({ key, label }) => {
                const val = bf[key as "elevator" | "parking" | "groundAccess" | "ladder"];
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", fontWeight: 600 }}>{label}</span>
                    {(["O", "X", "?"] as const).map((opt) => {
                      const isActive = opt === "O" ? val === true : opt === "X" ? val === false : val === null;
                      return (
                        <button key={opt} onClick={() => setBf(key, opt === "O" ? true : opt === "X" ? false : null)}
                          style={{
                            padding: "2px 8px", fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                            border: isActive ? "none" : "1px solid var(--app-border)",
                            backgroundColor: isActive ? (opt === "O" ? "var(--app-tag-green-bg)" : opt === "X" ? "var(--app-tag-orange-bg)" : "var(--app-surface-secondary)") : "transparent",
                            color: isActive ? (opt === "O" ? "var(--app-tag-green-text)" : opt === "X" ? "var(--app-tag-orange-text)" : "var(--app-text-tertiary)") : "var(--app-text-tertiary)",
                          }}
                        >{opt === "?" ? "미확인" : opt}</button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* 품목 (편집 가능) */}
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--app-border-light)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)" }}>
                  품목 ({bf.items.length}건)
                </div>
                <button onClick={() => setBf("items", [...bf.items, { category: "", name: "", quantity: 1, unitPrice: 0 }])}
                  style={{ fontSize: 11, fontWeight: 600, color: "var(--app-accent)", backgroundColor: "var(--app-tag-blue-bg)", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
                  + 추가
                </button>
              </div>
              {bf.items.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {bf.items.map((item: { category: string; name: string; quantity: number; unitPrice: number }, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input value={item.category} placeholder="카테고리"
                        onChange={(e) => { const items = [...bf.items]; items[i] = { ...items[i], category: e.target.value }; setBf("items", items); }}
                        style={{ flex: 1, padding: "4px 6px", fontSize: 11, border: "1px solid var(--app-border)", borderRadius: 4, outline: "none" }} />
                      <input value={item.name} placeholder="품목명"
                        onChange={(e) => { const items = [...bf.items]; items[i] = { ...items[i], name: e.target.value }; setBf("items", items); }}
                        style={{ flex: 1, padding: "4px 6px", fontSize: 11, border: "1px solid var(--app-border)", borderRadius: 4, outline: "none" }} />
                      <input type="number" value={item.quantity} min={1}
                        onChange={(e) => { const items = [...bf.items]; items[i] = { ...items[i], quantity: parseInt(e.target.value) || 1 }; setBf("items", items); }}
                        style={{ width: 36, padding: "4px 2px", fontSize: 11, border: "1px solid var(--app-border)", borderRadius: 4, textAlign: "center" }} />
                      <span style={{ fontSize: 11, color: "var(--app-text-secondary)", whiteSpace: "nowrap" }}>
                        {(item.unitPrice * item.quantity).toLocaleString()}원
                      </span>
                      <button onClick={() => { const items = bf.items.filter((_: unknown, idx: number) => idx !== i); setBf("items", items); }}
                        style={{ width: 20, height: 20, borderRadius: 4, border: "none", backgroundColor: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>품목 없음</div>
              )}
            </div>

            {/* 특이사항/메모 */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 4 }}>특이사항</div>
              <textarea value={bf.memo} onChange={(e) => setBf("memo", e.target.value)}
                rows={2} placeholder="해체 필요, 현장 주의사항 등"
                style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: "1px solid var(--app-border)", borderRadius: 6, outline: "none", resize: "vertical", boxSizing: "border-box", backgroundColor: "var(--app-input-bg, var(--app-surface))" }} />
            </div>
          </div>

          {/* 하단 버튼 */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--app-border)", display: "flex", gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => setShowBookingConfirm(false)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid var(--app-border)",
                backgroundColor: "var(--app-surface)", color: "var(--app-text-secondary)",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >취소</button>
            <button
              onClick={doSend}
              disabled={isSending}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 8, border: "none",
                backgroundColor: isSending ? "var(--app-border)" : "var(--app-btn-primary-bg)",
                color: isSending ? "var(--app-text-placeholder)" : "var(--app-btn-primary-text)",
                fontSize: 14, fontWeight: 600, cursor: isSending ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {isSending ? (
                <><Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} /> 처리 중...</>
              ) : (
                <><CheckCircle style={{ width: 15, height: 15 }} /> 예약 확정</>
              )}
            </button>
          </div>

          {/* 리사이즈 핸들 */}
          <div
            onMouseDown={onResizeStart}
            style={{
              position: "absolute", bottom: 0, right: 0, width: 16, height: 16, cursor: "nwse-resize",
              background: "linear-gradient(135deg, transparent 50%, var(--app-text-tertiary) 50%)",
              opacity: 0.3, borderRadius: "0 0 14px 0",
            }}
          />
        </div>
      )}

      {/* 이미지 미리보기 */}
      {imagePreview && (
        <div style={{
          padding: "12px 24px", borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <div style={{ position: "relative" }}>
            <img
              src={imagePreview}
              alt="미리보기"
              style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--app-border)" }}
            />
            <button
              onClick={cancelImage}
              style={{
                position: "absolute", top: -6, right: -6,
                width: 20, height: 20, borderRadius: "50%",
                backgroundColor: "#E8344E", color: "white",
                border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13,
              }}
            ><X style={{ width: 12, height: 12 }} /></button>
          </div>
          <button
            onClick={handleImageSend}
            disabled={isUploadingSending}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              backgroundColor: isUploadingSending ? "var(--app-border)" : "var(--app-btn-primary-bg)",
              color: isUploadingSending ? "var(--app-text-placeholder)" : "var(--app-btn-primary-text)",
              fontSize: 15, fontWeight: 600, cursor: isUploadingSending ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {isUploadingSending ? (
              <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 전송 중...</>
            ) : (
              <><Send style={{ width: 14, height: 14 }} /> 이미지 전송</>
            )}
          </button>
        </div>
      )}

      {/* 파일 미리보기 */}
      {pendingFile && (
        <div style={{
          padding: "12px 24px", borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
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
            backgroundColor: isSendingFile ? "var(--app-border)" : "var(--app-btn-primary-bg)",
            color: isSendingFile ? "var(--app-text-placeholder)" : "var(--app-btn-primary-text)",
            fontSize: 15, fontWeight: 600, cursor: isSendingFile ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}>
            {isSendingFile ? <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> 전송 중...</> : <><Send style={{ width: 14, height: 14 }} /> 파일 전송</>}
          </button>
        </div>
      )}

      {/* 매크로 드롭다운 */}
      {showMacroDropdown && (
        <div
          ref={macroDropdownRef}
          style={{
            position: "absolute", bottom: "100%", left: 24, right: 24,
            maxHeight: 360, backgroundColor: "var(--app-surface)",
            borderRadius: "12px 12px 0 0", border: "1px solid var(--app-border)",
            borderBottom: "none",
            boxShadow: "var(--app-shadow-lg)",
            display: "flex", flexDirection: "column",
            zIndex: 100,
          }}
        >
          {/* 검색 */}
          <div style={{
            padding: "10px 14px", borderBottom: "1px solid var(--app-border-light)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <Hash style={{ width: 16, height: 16, color: "var(--app-accent)" }} />
            <input
              ref={macroSearchRef}
              value={macroSearch}
              onChange={e => { setMacroSearch(e.target.value); setFocusedMacroIndex(0); }}
              onKeyDown={handleMacroKeyDown}
              placeholder="매크로 검색..."
              style={{
                flex: 1, border: "none", outline: "none",
                fontSize: 15, color: "var(--app-text-primary)", backgroundColor: "transparent",
              }}
            />
            <button
              onClick={() => setShowMacroDropdown(false)}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
            >
              <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
            </button>
          </div>

          {/* 목록 */}
          <div style={{ flex: 1, overflow: "auto", maxHeight: 300 }}>
            {Object.keys(groupedMacros).length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--app-text-tertiary)", fontSize: 15 }}>
                {macroSearch ? "검색 결과 없음" : "등록된 매크로 없음"}
              </div>
            ) : (
              (() => {
                let globalIdx = 0;
                macroItemRefs.current = [];
                return Object.entries(groupedMacros).map(([cat, items]) => (
                  <div key={cat}>
                    <div style={{
                      padding: "6px 14px", fontSize: 12, fontWeight: 600,
                      color: "var(--app-text-tertiary)", backgroundColor: "var(--app-bg)",
                      textTransform: "uppercase",
                    }}>{cat}</div>
                    {items.map(macro => {
                      const idx = globalIdx++;
                      const isFocused = idx === focusedMacroIndex;
                      return (
                        <button
                          key={macro.id}
                          ref={el => { macroItemRefs.current[idx] = el; }}
                          onClick={() => selectMacro(macro)}
                          onMouseEnter={() => setFocusedMacroIndex(idx)}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "8px 14px", border: "none",
                            backgroundColor: isFocused ? "var(--app-selected-bg)" : "transparent",
                            cursor: "pointer", fontSize: 15, color: "var(--app-text-primary)",
                          }}
                        >
                          <div style={{ fontWeight: 500 }}>{macro.name}</div>
                          <div style={{
                            fontSize: 13, color: "var(--app-text-tertiary)", marginTop: 2,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{macro.content.substring(0, 60)}...</div>
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

      {/* 채널톡식 외부/내부 탭 — textarea 윗부분에 부착 */}
      <div style={{
        display: "flex",
        margin: "0 24px",
        borderBottom: "1px solid var(--app-border)",
      }}>
        {([
          { key: false, label: "외부", desc: "고객 답변" },
          { key: true, label: "내부", desc: "상담사 메모" },
        ] as const).map((t) => {
          const active = internalMode === t.key;
          const isInternal = t.key;
          return (
            <button
              key={String(t.key)}
              type="button"
              onClick={() => setInternalMode(t.key)}
              disabled={isSending}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px",
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: active ? 700 : 500,
                color: active
                  ? (isInternal ? "#7B1FA2" : "var(--app-accent)")
                  : "var(--app-text-tertiary)",
                borderBottom: active
                  ? `2px solid ${isInternal ? "#7B1FA2" : "var(--app-accent)"}`
                  : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {isInternal && <Lock style={{ width: 13, height: 13 }} />}
              <span>{t.label}</span>
              <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>{t.desc}</span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: "12px 24px 8px" }}>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextareaChange}
          onKeyDown={(e) => {
            if (showMacroDropdown) {
              handleMacroKeyDown(e);
              return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { handleSend(); return; }
            // ⌘+1 = AI 답변, ⌘+2 = 말다듬기 (Windows: Ctrl). 내부대화 모드에선 비활성.
            if (!internalMode && (e.metaKey || e.ctrlKey) && e.key === "1") {
              e.preventDefault();
              if (!isRegenerating && !isSending) handleRegenerate();
              return;
            }
            if (!internalMode && (e.metaKey || e.ctrlKey) && e.key === "2") {
              e.preventDefault();
              if (!isPolishing && !isSending && message.trim()) handlePolish();
              return;
            }
          }}
          placeholder={internalMode ? "내부대화 (@이름 으로 멘션)..." : "AI 초안을 수정하거나 직접 작성하세요..."}
          disabled={isSending}
          rows={3}
          style={{
            width: "100%", resize: "vertical", minHeight: 60, maxHeight: 300,
            fontSize: 16,
            color: internalMode ? "#5D4037" : "var(--app-text-primary)",
            backgroundColor: internalMode ? "#FFF8E1" : "var(--app-bg)",
            borderRadius: 12, padding: "12px 16px",
            border: internalMode ? "1px solid #FFD54F" : "1px solid var(--app-border)",
            outline: "none", lineHeight: 1.6,
            opacity: isSending ? 0.5 : 1,
            boxSizing: "border-box",
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
          <span style={{ fontSize: 13, color: "var(--app-text-placeholder)" }}>⌘+Enter로 바로 전송</span>
          {sentStatus === "sent" && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#20C997", fontWeight: 500 }}>
              <CheckCircle style={{ width: 14, height: 14 }} /> 전송 완료
            </span>
          )}
        </div>
      </div>
      {mentionQuery !== null && (
        <MentionPicker
          query={mentionQuery}
          counselors={counselors}
          anchorRect={pickerAnchor}
          onSelect={(c) => {
            // DOM 직접 읽기 — React state 가 IME 합성 중일 때 stale 인 경우 방어.
            const el = textareaRef.current;
            const liveValue = el?.value ?? message;
            const liveCaret = el?.selectionStart ?? liveValue.length;
            const before = liveValue.slice(0, mentionStartPos);
            const after = liveValue.slice(liveCaret);
            const next = `${before}@${c.name} ${after}`;
            setMessage(next);
            setMentionQuery(null);
            setMentionStartPos(-1);
            requestAnimationFrame(() => {
              const t = textareaRef.current;
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

      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 24px 16px" }}>
        <button
          onClick={handleSend}
          disabled={isSending || !message.trim()}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            height: 42,
            backgroundColor: (isSending || !message.trim())
              ? "var(--app-border)"
              : (internalMode ? "#7B1FA2" : "var(--app-btn-primary-bg)"),
            color: (isSending || !message.trim())
              ? "var(--app-text-placeholder)"
              : (internalMode ? "white" : "var(--app-btn-primary-text)"),
            borderRadius: 8, border: "none", fontSize: 16, fontWeight: 600,
            cursor: (isSending || !message.trim()) ? "default" : "pointer",
          }}
        >
          <Send style={{ width: 16, height: 16 }} />
          {isSending ? "전송 중..." : (internalMode ? "내부 전송" : "전송")}
        </button>

        <button
          onClick={handleRegenerate}
          disabled={isRegenerating || isSending || internalMode}
          title={internalMode ? "내부대화 모드에선 비활성" : undefined}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            height: 42, padding: "0 16px",
            backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
            borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
            cursor: (isRegenerating || isSending || internalMode) ? "default" : "pointer",
            opacity: (isRegenerating || isSending || internalMode) ? 0.4 : 1,
          }}
        >
          <RefreshCw style={{ width: 15, height: 15, animation: isRegenerating ? "spin 1s linear infinite" : "none" }} />
          {isRegenerating ? "생성 중" : "AI 답변"}
          <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 2 }}>{modKey}1</span>
        </button>

        {/* 말다듬기 버튼 */}
        <button
          onClick={handlePolish}
          disabled={isPolishing || isSending || !message.trim() || internalMode}
          title={internalMode ? "내부대화 모드에선 비활성" : "말다듬기 — 고객친화적 톤으로 다듬기"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            height: 42, padding: "0 14px",
            backgroundColor: "var(--app-tag-orange-bg)",
            color: "var(--app-tag-orange-text)",
            borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
            cursor: (isPolishing || isSending || !message.trim() || internalMode) ? "default" : "pointer",
            opacity: (isPolishing || isSending || !message.trim() || internalMode) ? 0.4 : 1,
          }}
        >
          <Sparkles style={{ width: 15, height: 15, animation: isPolishing ? "spin 1s linear infinite" : "none" }} />
          {isPolishing ? "다듬는 중" : "말다듬기"}
          <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 2 }}>{modKey}2</span>
        </button>

        <button
          onClick={() => { setMessage(""); localStorage.removeItem(`chatbot-draft-${sessionId}`); isUserEditing.current = false; }}
          disabled={isSending}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            height: 42, padding: "0 16px",
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
            borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
            cursor: isSending ? "default" : "pointer",
            opacity: isSending ? 0.5 : 1,
          }}
        >
          <PenLine style={{ width: 15, height: 15 }} />
          직접작성
        </button>

        {/* # 매크로 버튼 */}
        <button
          onClick={openMacroDropdown}
          disabled={isSending}
          title="매크로 (#)"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 42, height: 42,
            backgroundColor: showMacroDropdown ? "var(--app-btn-primary-bg)" : "var(--app-surface-secondary)",
            color: showMacroDropdown ? "var(--app-btn-primary-text)" : "var(--app-text-secondary)",
            borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
            cursor: isSending ? "default" : "pointer",
            opacity: isSending ? 0.5 : 1,
          }}
        >
          <Hash style={{ width: 18, height: 18 }} />
        </button>

        {/* 파일 전송 버튼 */}
        <button
          onClick={() => docFileInputRef.current?.click()}
          disabled={isSending}
          title="파일 전송"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 42, height: 42,
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
            borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
            cursor: isSending ? "default" : "pointer",
            opacity: isSending ? 0.5 : 1,
          }}
        >
          <Paperclip style={{ width: 18, height: 18 }} />
        </button>
        <input
          ref={docFileInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.doc,.docx,.hwp,.zip,.ppt,.pptx,.csv,.txt"
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />

        {/* 이미지 전송 버튼 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isSending}
          title="이미지 전송"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 42, height: 42,
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
            borderRadius: 8, border: "none", fontSize: 15, fontWeight: 500,
            cursor: isSending ? "default" : "pointer",
            opacity: isSending ? 0.5 : 1,
          }}
        >
          <ImageIcon style={{ width: 18, height: 18 }} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
