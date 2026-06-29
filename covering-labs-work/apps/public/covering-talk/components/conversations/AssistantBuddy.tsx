"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, BookOpen } from "lucide-react";
import type { Conversation } from "@/lib/store/conversations";
import { Phase, type CollectedInfo } from "@/lib/ai/phases";
import { PolicyModal } from "./PolicyModal";

/** 귀여운 마스코트 — 우측 하단(입력창 위) 고정 위치에서 세션 컨텍스트 기반 힌트 제공
 *  기본: 규칙 기반 힌트 순환 · "AI 조언" 버튼 클릭 시 정책+대화 기반 AI 코칭 한 문장 */
export function AssistantBuddy({ conv }: { conv: Conversation | null }) {
  const [mounted, setMounted] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [bob, setBob] = useState(0);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiSection, setAiSection] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyTarget, setPolicyTarget] = useState<string | null>(null);
  // 드래그 위치 (localStorage 저장)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setMounted(true), []);

  // localStorage에서 위치·dismissed 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedPos = localStorage.getItem("assistantBuddyPos");
      if (savedPos) {
        const p = JSON.parse(savedPos);
        if (typeof p?.x === "number" && typeof p?.y === "number") {
          const x = Math.max(0, Math.min(window.innerWidth - 80, p.x));
          const y = Math.max(0, Math.min(window.innerHeight - 80, p.y));
          setPos({ x, y });
        }
      }
    } catch { /* ignore */ }
    try {
      const savedDismiss = localStorage.getItem("assistantBuddyDismissed");
      if (savedDismiss === "1") setDismissed(true);
    } catch { /* ignore */ }
  }, []);

  // 위치 변경 시 localStorage 저장 (debounced)
  useEffect(() => {
    if (pos === null || typeof window === "undefined") return;
    const t = setTimeout(() => {
      try { localStorage.setItem("assistantBuddyPos", JSON.stringify(pos)); } catch { /* ignore */ }
    }, 150);
    return () => clearTimeout(t);
  }, [pos]);

  // dismissed 상태 localStorage 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("assistantBuddyDismissed", dismissed ? "1" : "0"); } catch { /* ignore */ }
  }, [dismissed]);

  // 드래그 핸들러 — document 레벨 이벤트
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const s = dragStartRef.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (!s.moved && Math.hypot(dx, dy) > 4) s.moved = true;
      if (s.moved) {
        const newX = Math.max(0, Math.min(window.innerWidth - 80, s.origX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 80, s.origY + dy));
        setPos({ x: newX, y: newY });
      }
    };
    const handleUp = () => {
      const s = dragStartRef.current;
      if (s?.moved) {
        justDraggedRef.current = true;
        setTimeout(() => { justDraggedRef.current = false; }, 150);
      }
      dragStartRef.current = null;
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos?.x ?? rect.left,
      origY: pos?.y ?? rect.top,
      moved: false,
    };
    e.preventDefault();
  };

  useEffect(() => {
    if (!mounted) return;
    let raf = 0;
    const loop = (now: number) => {
      setBob(Math.sin(now / 500) * 3);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mounted]);

  const ruleHints = useMemo(() => computeHints(conv), [conv]);
  // AI 힌트가 있으면 최우선, 없으면 규칙 힌트 순환
  const currentHint = aiHint ?? ruleHints[hintIdx % Math.max(1, ruleHints.length)];

  useEffect(() => {
    if (ruleHints.length <= 1 || aiHint) return;
    const t = setInterval(() => setHintIdx((i) => i + 1), 6000);
    return () => clearInterval(t);
  }, [ruleHints.length, aiHint]);

  // 세션 바뀌면 초기화
  useEffect(() => {
    setHintIdx(0);
    setDismissed(false);
    setAiHint(null);
    setAiSection(null);
    aiAbortRef.current?.abort();
    lastFetchKeyRef.current = null;
  }, [conv?.sessionId]);

  const askAI = async () => {
    if (!conv) return;
    aiAbortRef.current?.abort();
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    setAiLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conv.sessionId}/assistant-hint`, {
        method: "POST",
        signal: ctrl.signal,
      });
      if (!res.ok) return;
      const d = await res.json();
      if (d.hint) setAiHint(d.hint);
      setAiSection(typeof d.section === "string" && d.section.length > 0 ? d.section : null);
    } catch { /* ignore */ } finally {
      if (aiAbortRef.current === ctrl) setAiLoading(false);
    }
  };

  // 자동 갱신 — 고객 메시지(user)가 새로 들어왔을 때만 호출.
  // 상담사 답변/AI draft 생성 후에는 기존 힌트 유지 (자기 답변에 반응해 새 힌트를 만드는 루프 방지).
  useEffect(() => {
    if (!conv) return;
    const msgs = conv.messages ?? [];
    const lastMsg = msgs[msgs.length - 1];
    if (!lastMsg || lastMsg.role !== "user") return;
    const key = `${conv.sessionId}::${msgs.length}::${lastMsg.id ?? ""}`;
    if (lastFetchKeyRef.current === key) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastFetchKeyRef.current = key;
      askAI();
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.sessionId, conv?.messages?.length, conv?.updatedAt]);

  if (!mounted) return null;

  // dismissed 상태일 때: 작은 열기 버튼만 렌더
  if (dismissed) {
    const reopenChip = (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        title="커바니 다시 불러오기"
        style={{
          position: "fixed",
          right: 20,
          bottom: 80,
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "2px solid white",
          padding: 0,
          overflow: "hidden",
          boxShadow: "0 4px 14px rgba(26,163,255,0.35)",
          cursor: "pointer",
          backgroundColor: "#1AA3FF",
          zIndex: 500,
          opacity: 0.85,
        }}
      >
        <img
          src="/covering-talk/kobani.png"
          alt="커바니 열기"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </button>
    );
    return createPortal(reopenChip, document.body);
  }

  const positionStyle = pos
    ? { left: pos.x, top: pos.y }
    : { right: 340, bottom: 250 };

  const buddy = (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        ...positionStyle,
        zIndex: 500,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {(currentHint || aiLoading) && (
        <div
          style={{
            width: "max-content",
            maxWidth: 280,
            minWidth: 140,
            padding: "8px 12px",
            backgroundColor: "white",
            border: `1.5px solid #1AA3FF`,
            borderRadius: 14,
            boxShadow: aiHint
              ? "0 4px 18px rgba(26,163,255,0.38)"
              : "0 4px 16px rgba(26,163,255,0.22)",
            fontSize: 12,
            fontWeight: 500,
            color: "#0C4A6E",
            lineHeight: 1.45,
            whiteSpace: "normal",
            wordBreak: "keep-all",
            pointerEvents: "auto",
            position: "relative",
          }}
        >
          {aiHint && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#1AA3FF", marginBottom: 3 }}>
              <Sparkles style={{ width: 10, height: 10 }} /> 커바니
            </div>
          )}
          {aiLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#1AA3FF" }}>
              <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
              <span>대화를 살펴보는 중...</span>
            </div>
          ) : (
            currentHint
          )}
          <div
            style={{
              position: "absolute",
              right: -7,
              top: 14,
              width: 0,
              height: 0,
              borderTop: "6px solid transparent",
              borderBottom: "6px solid transparent",
              borderLeft: `7px solid white`,
              filter: `drop-shadow(1px 0 0 #1AA3FF)`,
            }}
          />
        </div>
      )}

      {/* 닫기 버튼 (dismissed → 오른쪽 하단에 작은 reopen chip 나옴) */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        title="커바니 숨기기"
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "1px solid var(--app-border)",
          padding: 0,
          boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          flexShrink: 0,
          backgroundColor: "white",
          color: "#6B7280",
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1,
        }}
      >
        ×
      </button>

      {/* 상시 정책 가이드 버튼 — AI 힌트 유무와 무관하게 항상 노출 */}
      <button
        type="button"
        onClick={() => {
          setPolicyTarget(aiSection);
          setPolicyOpen(true);
        }}
        title={aiSection ? `정책 가이드 — ${aiSection}` : "방문수거 정책 가이드 열기"}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid #BAE6FD",
          padding: 0,
          boxShadow: "0 2px 8px rgba(26,163,255,0.18)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          userSelect: "none",
          WebkitUserSelect: "none",
          flexShrink: 0,
          backgroundColor: aiSection ? "#DBEAFE" : "#F0F9FF",
          color: "#1AA3FF",
          position: "relative",
        }}
      >
        <BookOpen style={{ width: 16, height: 16 }} />
        {aiSection && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#F59E0B",
              border: "2px solid white",
            }}
          />
        )}
      </button>

      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseDown={startDrag}
        onClick={(e) => {
          if (justDraggedRef.current) { e.preventDefault(); e.stopPropagation(); return; }
          setHintIdx((i) => i + 1);
        }}
        title="드래그: 이동 · 클릭: 다음 힌트"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "2px solid white",
          padding: 0,
          overflow: "hidden",
          boxShadow: "0 6px 18px rgba(26,163,255,0.45)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          transform: `translateY(${bob}px) scale(${hovered ? 1.08 : 1})`,
          transition: "transform 0.12s ease-out",
          userSelect: "none",
          WebkitUserSelect: "none",
          flexShrink: 0,
          backgroundColor: "#1AA3FF",
        }}
      >
        <img
          src="/covering-talk/kobani.png"
          alt="커바니"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", userSelect: "none", pointerEvents: "none" }}
        />
      </button>
    </div>
  );

  return (
    <>
      {createPortal(buddy, document.body)}
      <PolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} targetSection={policyTarget} />
    </>
  );
}

// ─── 힌트 규칙 ───────────────────────────────────────

const CHEERS = [
  "오늘도 잘하고 계세요 :)",
  "화이팅이에요!",
  "조금만 더 힘내요 :)",
  "이 상담 잘 흘러가고 있어요!",
  "뭐든 물어봐요!",
];

function computeHints(conv: Conversation | null): string[] {
  if (!conv) return ["상담을 선택하면 도와줄게요!"];
  const ci = (conv.collectedInfo || {}) as CollectedInfo & {
    requestedDate?: string | null;
    name?: string | null;
    phone?: string | null;
  };
  const phase = conv.currentPhase as Phase | undefined;
  const hints: string[] = [];

  switch (phase) {
    case Phase.PHASE_1_INITIAL:
      hints.push("첫 인사 템플릿을 보낼 시점이에요!");
      break;
    case Phase.PHASE_2_COLLECT:
      if (!ci.address) hints.push("아직 주소가 없어요. 상세 주소 확인해 주세요.");
      if (!ci.items || ci.items.length === 0) hints.push("품목 정보가 비어있어요. 물어볼 타이밍!");
      if (ci.elevator == null) hints.push("엘리베이터 여부 확인하면 좋아요.");
      if (ci.parking == null) hints.push("주차 가능 여부도 같이 물어봐요.");
      break;
    case Phase.PHASE_3_SPEC:
      hints.push("품목 사양 확인 단계에요. 고객이 말한 그대로 접수하면 돼요!");
      break;
    case Phase.PHASE_3_1_MODIFY:
      hints.push("품목 수정 중 — 변경 후 견적 재산출 잊지 마세요.");
      break;
    case Phase.PHASE_4_QUOTE:
      hints.push("견적 발송할 타이밍이에요! 총액만 안내하세요.");
      break;
    case Phase.PHASE_5_NUDGE:
      hints.push("고객이 고민 중이에요. 자연스럽게 넛지 한 번?");
      break;
    case Phase.PHASE_6_BOOKING:
      if (!ci.name && !ci.phone) hints.push("성함·연락처 확인이 필요해요!");
      else if (!ci.name) hints.push("성함을 아직 못 받았어요.");
      else if (!ci.phone) hints.push("연락처를 아직 못 받았어요.");
      if (!ci.requestedDate) hints.push("수거 희망일을 확인해 주세요.");
      break;
    case Phase.PHASE_7_CONFIRM:
      hints.push("예약 확정 직전! 주소·시간 더블 체크하세요.");
      if (!ci.requestedDate) hints.push("희망일이 비어있어요 — 확인 필요!");
      break;
    case Phase.PHASE_8_POST:
      hints.push("사후관리 단계입니다. 추가 요청 있는지 확인해요.");
      break;
    case Phase.CLOSED:
      hints.push("상담 종료됨. 수고하셨어요 :)");
      break;
  }

  if (conv.status === "needs_check") hints.push("상담사 확인 필요 상태예요.");
  if (conv.unreadCount > 0) hints.push(`읽지 않은 메시지 ${conv.unreadCount}건 있어요.`);
  if (conv.status === "no_response") hints.push("고객 응답이 없어요. 리마인드 보낼까요?");

  if (hints.length === 0) {
    const idx = Math.floor(Math.random() * CHEERS.length);
    hints.push(CHEERS[idx]);
  }
  return hints;
}
