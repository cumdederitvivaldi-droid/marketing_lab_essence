"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Send, Copy } from "lucide-react";
import { toast } from "sonner";

interface SuggestDebugPanelProps {
  chatId: string | null;
  chatTags: string[];
  messages: Array<{ role: string; content: string; senderName?: string }>;
  onSend?: (message: string, options?: { isInternal?: boolean }) => Promise<void>;
}

interface TabResult {
  answer: string;
  loading: boolean;
  source?: string;
  extra?: Record<string, unknown>;
}

const TABS = [
  { key: "policy", label: "AI 답변", color: "#3B82F6", mode: "policy-only" },
  { key: "human", label: "인간 답변", color: "#22C55E", mode: "ai-then-human" },
  { key: "macro", label: "매크로", color: "#8B5CF6", mode: "macro-match" },
  { key: "raw", label: "미정제", color: "#F59E0B", mode: "raw" },
] as const;

export default function SuggestDebugPanel({ chatId, chatTags, messages, onSend }: SuggestDebugPanelProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [results, setResults] = useState<TabResult[]>(TABS.map(() => ({ answer: "", loading: false })));
  const [editingTab, setEditingTab] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const lastRequestedMsgRef = useRef<string | null>(null);

  const getLastUserMessage = () => {
    const userMsgs = messages.filter((m) => m.role === "user" && m.content);
    return userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].content : "";
  };

  const getRecentTurns = () =>
    messages
      .filter((m) => (m.role === "user" || m.role === "manager") && m.content)
      .slice(-6)
      .map((m) => ({ role: m.role as "user" | "manager", text: m.content, senderName: m.senderName || undefined }));

  // 고객 메시지 변경 시 4개 모드 병렬 자동 실행
  useEffect(() => {
    const msg = getLastUserMessage();
    if (!msg || !chatId) return;
    if (lastRequestedMsgRef.current === msg) return;
    lastRequestedMsgRef.current = msg;

    // 모두 로딩 시작
    setResults(TABS.map(() => ({ answer: "", loading: true })));
    setEditingTab(null);

    const recentTurns = getRecentTurns();

    TABS.forEach((tab, i) => {
      fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message: msg,
          tags: chatTags,
          recentTurns,
          mode: tab.mode,
          ...(tab.mode === "raw" ? { debug: true, skipValidation: true } : {}),
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          let answer = "";
          if (tab.mode === "raw") {
            const top = d.suggestions?.[0] || d.debug?.allCandidates?.[0];
            answer = top?.answerText || top?.answer || "매칭 결과 없음";
          } else {
            answer = d.answer || "답변 생성 실패";
          }
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { answer, loading: false, source: d.source || tab.mode, extra: d } : r
          ));
        })
        .catch(() => {
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { answer: "오류 발생", loading: false } : r
          ));
        });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, messages]);

  // 채팅 변경 시 리셋
  useEffect(() => {
    setResults(TABS.map(() => ({ answer: "", loading: false })));
    lastRequestedMsgRef.current = null;
    setEditingTab(null);
  }, [chatId]);

  // 수동 재실행
  const handleRefresh = () => {
    lastRequestedMsgRef.current = null;
    const msg = getLastUserMessage();
    if (!msg) return;
    // trigger re-run
    lastRequestedMsgRef.current = null;
    setResults(TABS.map(() => ({ answer: "", loading: true })));
    setEditingTab(null);

    const recentTurns = getRecentTurns();
    TABS.forEach((tab, i) => {
      fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message: msg,
          tags: chatTags,
          recentTurns,
          mode: tab.mode,
          ...(tab.mode === "raw" ? { debug: true, skipValidation: true } : {}),
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          let answer = "";
          if (tab.mode === "raw") {
            const top = d.suggestions?.[0] || d.debug?.allCandidates?.[0];
            answer = top?.answerText || top?.answer || "매칭 결과 없음";
          } else {
            answer = d.answer || "답변 생성 실패";
          }
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { answer, loading: false, source: d.source || tab.mode, extra: d } : r
          ));
        })
        .catch(() => {
          setResults((prev) => prev.map((r, idx) =>
            idx === i ? { answer: "오류 발생", loading: false } : r
          ));
        });
    });
    lastRequestedMsgRef.current = msg;
  };

  const handleDirectSend = async (answer: string) => {
    if (!onSend) return;
    try {
      await onSend(answer);
      toast.success("답변이 전송되었습니다");
    } catch {
      toast.error("전송 실패");
    }
  };

  const handleEditConfirm = async () => {
    if (!onSend || !editText.trim()) return;
    try {
      await onSend(editText.trim());
      toast.success("답변이 전송되었습니다");
      setEditingTab(null);
      setEditText("");
    } catch {
      toast.error("전송 실패");
    }
  };

  const current = results[activeTab];
  const currentTab = TABS[activeTab];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* 탭 바 */}
      <div style={{
        display: "flex", gap: 0, borderBottom: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface)", flexShrink: 0,
      }}>
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(i); setEditingTab(null); }}
            style={{
              flex: 1,
              padding: "10px 0",
              fontSize: 12,
              fontWeight: activeTab === i ? 700 : 500,
              color: activeTab === i ? tab.color : "var(--app-text-tertiary)",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: activeTab === i ? `2.5px solid ${tab.color}` : "2.5px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              transition: "all 0.15s",
            }}
          >
            {results[i].loading && (
              <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
            )}
            {!results[i].loading && results[i].answer && (
              <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: tab.color }} />
            )}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 새로고침 버튼 */}
      <div style={{ padding: "8px 12px 0", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
        <button
          onClick={handleRefresh}
          disabled={results.some((r) => r.loading)}
          style={{
            fontSize: 11, color: "var(--app-text-tertiary)", cursor: "pointer",
            background: "none", border: "none", textDecoration: "underline",
          }}
        >
          새로고침
        </button>
      </div>

      {/* 답변 내용 */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "8px 12px" }}>
        {current.loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40, gap: 8 }}>
            <Loader2 style={{ width: 20, height: 20, color: currentTab.color, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>생성 중...</span>
          </div>
        ) : !current.answer ? (
          <div style={{ padding: 24, color: "var(--app-text-tertiary)", fontSize: 13, textAlign: "center" }}>
            고객 메시지가 들어오면 자동으로 답변이 생성됩니다
          </div>
        ) : editingTab === activeTab ? (
          /* 수정 모드 */
          <div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              style={{
                width: "100%", minHeight: 200, padding: "10px 12px", fontSize: 14, lineHeight: 1.6,
                border: `1.5px solid ${currentTab.color}`, borderRadius: 8, resize: "vertical",
                backgroundColor: "var(--app-surface)", color: "var(--app-text-primary)",
                fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button
                onClick={handleEditConfirm}
                style={{
                  padding: "7px 16px", borderRadius: 6, border: "none",
                  backgroundColor: currentTab.color, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <Send style={{ width: 12, height: 12 }} /> 전송
              </button>
              <button
                onClick={() => { setEditingTab(null); setEditText(""); }}
                style={{
                  padding: "7px 16px", borderRadius: 6,
                  border: "1px solid var(--app-border)", backgroundColor: "transparent",
                  color: "var(--app-text-tertiary)", fontSize: 13, cursor: "pointer",
                }}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          /* 답변 표시 */
          <div>
            <div style={{
              fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word",
              color: "var(--app-text-primary)", padding: "12px 14px",
              backgroundColor: `${currentTab.color}08`,
              border: `1px solid ${currentTab.color}25`,
              borderRadius: 8,
            }}>
              {current.answer}
            </div>

            {/* 전송 버튼 */}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={() => handleDirectSend(current.answer)}
                disabled={!onSend}
                style={{
                  padding: "7px 16px", borderRadius: 6, border: "none",
                  backgroundColor: currentTab.color, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: onSend ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 5,
                  opacity: onSend ? 1 : 0.5,
                }}
              >
                <Send style={{ width: 12, height: 12 }} /> 전송
              </button>
              <button
                onClick={() => { setEditingTab(activeTab); setEditText(current.answer); }}
                disabled={!onSend}
                style={{
                  padding: "7px 16px", borderRadius: 6,
                  border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
                  color: "var(--app-text-secondary)", fontSize: 13, fontWeight: 600,
                  cursor: onSend ? "pointer" : "default",
                  display: "flex", alignItems: "center", gap: 5,
                  opacity: onSend ? 1 : 0.5,
                }}
              >
                <Copy style={{ width: 12, height: 12 }} /> 수정 후 전송
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
