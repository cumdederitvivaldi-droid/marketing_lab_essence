"use client";

import { useState } from "react";
import { X, Zap, FileText, Clock, Loader2, Lightbulb, Merge } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/channeltalk-ai/category-labels";

interface CompareResult {
  answer: string;
  classifiedCategory: string;
  canAnswer: boolean;
  reason?: string;
  timings?: Record<string, number>;
  source?: string;
  suggestions?: Array<{ answerText: string; totalScore: number; source?: string }>;
  normalizedMessage?: string;
}

type CompareMode = "default" | "policy-only" | "prompt-only" | "combined";

interface AiCompareModalProps {
  open: boolean;
  onClose: () => void;
  chatId: string;
  message: string;
  tags: string[];
  recentTurns: Array<{ role: "user" | "manager"; text: string; senderName?: string }>;
  previousCategories: string[];
}

const COLUMNS: Array<{
  mode: CompareMode;
  title: string;
  subtitle: string;
  icon: "zap" | "file" | "bulb" | "merge";
  accentColor: string;
}> = [
  { mode: "default", title: "Default (RAG)", subtitle: "Sonnet 분류→RAG→정책", icon: "zap", accentColor: "#3b82f6" },
  { mode: "policy-only", title: "Policy-only", subtitle: "Sonnet 분류→정책문서", icon: "file", accentColor: "#8b5cf6" },
  { mode: "prompt-only", title: "Prompt-only", subtitle: "Sonnet 분류→규칙만 (정책 제외)", icon: "bulb", accentColor: "#f59e0b" },
  { mode: "combined", title: "Combined (1회)", subtitle: "Sonnet 1회: 분류+정책+답변 통합", icon: "merge", accentColor: "#10b981" },
];

const ICONS = {
  zap: <Zap style={{ width: 14, height: 14 }} />,
  file: <FileText style={{ width: 14, height: 14 }} />,
  bulb: <Lightbulb style={{ width: 14, height: 14 }} />,
  merge: <Merge style={{ width: 14, height: 14 }} />,
};

export default function AiCompareModal({
  open, onClose, chatId, message, tags, recentTurns, previousCategories,
}: AiCompareModalProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<CompareMode, CompareResult | null>>({
    default: null, "policy-only": null, "prompt-only": null, combined: null,
  });
  const [dones, setDones] = useState<Record<CompareMode, boolean>>({
    default: false, "policy-only": false, "prompt-only": false, combined: false,
  });

  if (!open) return null;

  const runCompare = async () => {
    setLoading(true);
    setResults({ default: null, "policy-only": null, "prompt-only": null, combined: null });
    setDones({ default: false, "policy-only": false, "prompt-only": false, combined: false });

    const body = { chatId, message, tags, recentTurns, previousCategories };

    const markDone = (mode: CompareMode, data: CompareResult) => {
      setResults((prev) => ({ ...prev, [mode]: data }));
      setDones((prev) => ({ ...prev, [mode]: true }));
    };

    const markError = (mode: CompareMode, err: unknown) => {
      markDone(mode, { answer: "오류 발생", classifiedCategory: "", canAnswer: false, reason: String(err) });
    };

    // 4개 병렬 호출
    await Promise.allSettled([
      fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mode: "default" }),
      }).then((r) => r.json()).then((d) => markDone("default", d)).catch((e) => markError("default", e)),

      fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mode: "policy-only" }),
      }).then((r) => r.json()).then((d) => markDone("policy-only", d)).catch((e) => markError("policy-only", e)),

      fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mode: "policy-only", skipPolicy: true }),
      }).then((r) => r.json()).then((d) => markDone("prompt-only", d)).catch((e) => markError("prompt-only", e)),

      fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mode: "combined" }),
      }).then((r) => r.json()).then((d) => markDone("combined", d)).catch((e) => markError("combined", e)),
    ]);

    setLoading(false);
  };

  const formatTimings = (timings?: Record<string, number>) => {
    if (!timings) return null;
    return Object.entries(timings).map(([key, val]) => (
      <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
        <span style={{ color: "var(--app-text-secondary)", fontSize: 12 }}>{key}</span>
        <span style={{ fontWeight: 600, fontSize: 12, fontFamily: "monospace" }}>
          {val >= 1000 ? `${(val / 1000).toFixed(1)}s` : `${val}ms`}
        </span>
      </div>
    ));
  };

  const getAnswerText = (result: CompareResult, mode: CompareMode): string => {
    if (mode === "default") {
      const suggestions = result.suggestions ?? [];
      if (suggestions.length > 0) return suggestions[0].answerText;
    }
    return result.answer ?? "답변 없음";
  };

  const getSourceLabel = (result: CompareResult, mode: CompareMode): string => {
    if (mode === "default") {
      const suggestions = result.suggestions ?? [];
      if (suggestions.length > 0) {
        const top = suggestions[0];
        if (top.source === "policy") return "정책 기반 생성";
        return `RAG (점수: ${top.totalScore})`;
      }
      return "답변 없음";
    }
    if (mode === "prompt-only") return "프롬프트 규칙만";
    if (mode === "combined") return "1회 통합 (분류+답변)";
    return "정책 직접 생성";
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "95vw", maxWidth: 1500, maxHeight: "85vh",
        backgroundColor: "var(--app-surface)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* 헤더 */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--app-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap style={{ width: 18, height: 18, color: "var(--app-accent)" }} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)" }}>
              AI 파이프라인 비교
            </h2>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, border: "none",
            backgroundColor: "transparent", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
          </button>
        </div>

        {/* 메시지 + 실행 버튼 */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--app-border-light)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, fontSize: 13, color: "var(--app-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong>메시지:</strong> {message}
          </div>
          <button
            onClick={runCompare}
            disabled={loading}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              backgroundColor: loading ? "var(--app-border)" : "var(--app-accent)",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
            }}
          >
            {loading ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Zap style={{ width: 14, height: 14 }} />}
            {loading ? "비교 중..." : "비교 실행"}
          </button>
        </div>

        {/* 결과 3컬럼 */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", gap: 12 }}>
          {COLUMNS.map((col) => (
            <ResultCard
              key={col.mode}
              title={col.title}
              subtitle={col.subtitle}
              icon={ICONS[col.icon]}
              accentColor={col.accentColor}
              loading={loading && !dones[col.mode]}
              done={dones[col.mode]}
              result={results[col.mode]}
              mode={col.mode}
              getAnswerText={getAnswerText}
              getSourceLabel={getSourceLabel}
              formatTimings={formatTimings}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultCard({
  title, subtitle, icon, accentColor, loading, done, result, mode,
  getAnswerText, getSourceLabel, formatTimings,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: string;
  loading: boolean;
  done: boolean;
  result: CompareResult | null;
  mode: CompareMode;
  getAnswerText: (r: CompareResult, m: CompareMode) => string;
  getSourceLabel: (r: CompareResult, m: CompareMode) => string;
  formatTimings: (t?: Record<string, number>) => React.ReactNode;
}) {
  const totalTime = result?.timings?.total;
  const category = result?.classifiedCategory;
  const categoryLabel = category ? ((CATEGORY_LABELS as Record<string, string>)[category] ?? category) : null;

  return (
    <div style={{
      flex: 1, minWidth: 0, border: `1px solid ${done ? accentColor + "40" : "var(--app-border)"}`,
      borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden",
      backgroundColor: done ? accentColor + "05" : "var(--app-surface)",
    }}>
      {/* 카드 헤더 */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${accentColor}20`,
        backgroundColor: accentColor + "10",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: accentColor, fontWeight: 600, fontSize: 13 }}>
            {icon} {title}
          </div>
          {totalTime != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: accentColor }}>
              <Clock style={{ width: 12, height: 12 }} />
              {(totalTime / 1000).toFixed(1)}s
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, color: accentColor + "99", marginTop: 2 }}>{subtitle}</div>
      </div>

      {/* 카테고리 + 소스 */}
      {done && result && (
        <div style={{ padding: "6px 12px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--app-border-light)" }}>
          {categoryLabel && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
              backgroundColor: accentColor + "15", color: accentColor,
            }}>
              {categoryLabel}
            </span>
          )}
          <span style={{
            fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 4,
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-secondary)",
          }}>
            {getSourceLabel(result, mode)}
          </span>
          {result.canAnswer === false && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
              backgroundColor: "#FEE2E2", color: "#DC2626",
            }}>
              AI답변 불가
            </span>
          )}
        </div>
      )}

      {/* 답변 본문 */}
      <div style={{ flex: 1, padding: "10px 12px", overflow: "auto", minHeight: 180 }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--app-text-tertiary)" }}>
            <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13 }}>생성 중...</span>
          </div>
        )}
        {!loading && !done && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--app-text-placeholder)", fontSize: 13 }}>
            비교 실행을 눌러주세요
          </div>
        )}
        {done && result && (
          <pre style={{
            margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontSize: 12, lineHeight: 1.6, color: "var(--app-text-primary)",
            fontFamily: "inherit",
          }}>
            {getAnswerText(result, mode)}
          </pre>
        )}
      </div>

      {/* 타이밍 */}
      {done && result?.timings && (
        <div style={{
          padding: "6px 12px", borderTop: "1px solid var(--app-border-light)",
          backgroundColor: "var(--app-surface-secondary)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 2 }}>타이밍 상세</div>
          {formatTimings(result.timings)}
        </div>
      )}
    </div>
  );
}
