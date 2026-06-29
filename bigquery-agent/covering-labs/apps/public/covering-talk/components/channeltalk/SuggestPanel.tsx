"use client";

import { useState } from "react";
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from "lucide-react";

interface Suggestion {
  id: number;
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  category: string | null;
  similarity: number;
  similarityScore: number;
  tagScore: number;
  categoryScore: number;
  totalScore: number;
  validation: {
    isValid: boolean;
    confidence: number;
    issues: string[];
    suggestedFix?: string;
  };
}

export interface SuggestDebugData {
  normalizedMessage: string;
  classifiedCategory: string;
  inputTags: string[];
  embeddingDimension: number;
  matchCount: number;
  processingTimeMs: number;
  allCandidates: Array<{
    id: number;
    chatId: string;
    questionText: string;
    answerText: string;
    tag: string | null;
    category: string | null;
    similarity: number;
    similarityScore: number;
    tagScore: number;
    categoryScore: number;
    totalScore: number;
  }>;
  suggestions: Suggestion[];
}

interface SuggestPanelProps {
  chatId: string;
  chatTags: string[];
  messages: Array<{ role: string; content: string; senderName?: string }>;
  onInsertText: (text: string) => void;
  onDirectSend: (text: string, suggestionId: number) => void;
  onDebugData?: (data: SuggestDebugData | null) => void;
}

export default function SuggestPanel({
  chatId,
  chatTags,
  messages,
  onInsertText,
  onDirectSend,
  onDebugData,
}: SuggestPanelProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [normalizedMsg, setNormalizedMsg] = useState("");
  const [classifiedCat, setClassifiedCat] = useState("");
  const [simMode, setSimMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSuggestions = async () => {
    // 마지막 고객 메시지 추출
    const userMessages = messages
      .filter((m) => m.role === "user" && m.content)
      .slice(-3);

    if (userMessages.length === 0) {
      setError("고객 메시지가 없습니다");
      return;
    }

    const lastMessage = userMessages[userMessages.length - 1].content;

    // 최근 턴 구성 (senderName 포함하여 백엔드에서 인사 판단)
    const recentTurns = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "manager") &&
          m.content
      )
      .slice(-6)
      .map((m) => ({
        role: m.role as "user" | "manager",
        text: m.content,
        senderName: m.senderName || undefined,
      }));

    setLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const res = await fetch("/api/channeltalk-ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          message: lastMessage,
          tags: chatTags,
          recentTurns,
          debug: true,
        }),
      });

      if (!res.ok) throw new Error("추천 API 오류");

      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setNormalizedMsg(data.normalizedMessage || "");
      setClassifiedCat(data.classifiedCategory || "");

      // 디버그 데이터 전달
      if (onDebugData) {
        onDebugData({
          normalizedMessage: data.normalizedMessage || "",
          classifiedCategory: data.classifiedCategory || "",
          inputTags: chatTags,
          embeddingDimension: data.debug?.embeddingDimension || 0,
          matchCount: data.debug?.matchCount || 0,
          processingTimeMs: data.debug?.processingTimeMs || 0,
          allCandidates: data.debug?.allCandidates || [],
          suggestions: data.suggestions || [],
        });
      }
    } catch {
      setError("답변 추천에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleDirectSend = async (suggestion: Suggestion) => {
    onDirectSend(suggestion.answerText, suggestion.id);
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "#22C55E";
    if (score >= 60) return "#F59E0B";
    return "#EF4444";
  };

  return (
    <div
      style={{
        borderTop: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface-secondary)",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap
            style={{ width: 16, height: 16, color: "var(--app-tag-purple-text)" }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--app-text-secondary)",
            }}
          >
            AI 답변 추천
          </span>
          {suggestions.length > 0 && (
            <span
              style={{
                fontSize: 12,
                backgroundColor: "var(--app-tag-purple-bg)",
                color: "var(--app-tag-purple-text)",
                padding: "1px 6px",
                borderRadius: 10,
              }}
            >
              {suggestions.length}건
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* 시뮬레이션 모드 토글 */}
          <label
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--app-text-tertiary)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={simMode}
              onChange={(e) => setSimMode(e.target.checked)}
              style={{ width: 12, height: 12 }}
            />
            상세
          </label>
          {/* 추천 요청 버튼 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchSuggestions();
            }}
            disabled={loading}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              backgroundColor: loading
                ? "var(--app-surface-hover)"
                : "var(--app-tag-purple-text)",
              color: "var(--app-surface)",
              cursor: loading ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {loading ? (
              <Loader2
                style={{
                  width: 12,
                  height: 12,
                  animation: "spin 1s linear infinite",
                }}
              />
            ) : (
              <Zap style={{ width: 12, height: 12 }} />
            )}
            {loading ? "분석 중..." : "추천"}
          </button>
          {expanded ? (
            <ChevronUp
              style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }}
            />
          ) : (
            <ChevronDown
              style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }}
            />
          )}
        </div>
      </div>

      {/* 본문 */}
      {expanded && (
        <div style={{ padding: "0 16px 12px", maxHeight: 400, overflowY: "auto" }}>
          {/* 시뮬레이션 모드 정보 */}
          {simMode && normalizedMsg && (
            <div
              style={{
                fontSize: 12,
                color: "var(--app-text-tertiary)",
                marginBottom: 8,
                padding: "6px 8px",
                backgroundColor: "var(--app-surface)",
                borderRadius: 6,
              }}
            >
              <div>
                <strong>정제된 메시지:</strong> {normalizedMsg}
              </div>
              <div>
                <strong>분류 카테고리:</strong> {classifiedCat}
              </div>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div
              style={{
                fontSize: 13,
                color: "#EF4444",
                padding: "8px 0",
              }}
            >
              {error}
            </div>
          )}

          {/* 결과 없음 */}
          {!loading && suggestions.length === 0 && !error && (
            <div
              style={{
                fontSize: 13,
                color: "var(--app-text-tertiary)",
                padding: "8px 0",
                textAlign: "center",
              }}
            >
              고객 메시지가 들어오면 자동으로 추천됩니다
            </div>
          )}

          {/* 추천 카드 목록 */}
          {suggestions.map((s, i) => {
            const isPolicyGenerated = s.chatId === "policy-generated";
            return (
            <div
              key={s.id}
              style={{
                border: isPolicyGenerated
                  ? "1px solid #3B82F6"
                  : "1px solid var(--app-border)",
                borderRadius: 8,
                marginBottom: 8,
                backgroundColor: isPolicyGenerated
                  ? "#3B82F608"
                  : "var(--app-surface)",
                overflow: "hidden",
              }}
            >
              {/* 카드 헤더 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setExpandedCard(expandedCard === i ? null : i)
                }
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  {/* 순위 */}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--app-text-tertiary)",
                    }}
                  >
                    #{i + 1}
                  </span>
                  {/* 유형 뱃지 */}
                  {isPolicyGenerated ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#3B82F6",
                        backgroundColor: "#3B82F615",
                        padding: "2px 8px",
                        borderRadius: 10,
                      }}
                    >
                      정책 답변
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: scoreColor(s.totalScore),
                        backgroundColor: `${scoreColor(s.totalScore)}15`,
                        padding: "2px 8px",
                        borderRadius: 10,
                      }}
                    >
                      {s.totalScore}점
                    </span>
                  )}
                  {/* 태그 */}
                  {s.tag && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--app-text-tertiary)",
                        backgroundColor: "var(--app-surface-hover)",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {s.tag}
                    </span>
                  )}
                  {/* 카테고리 */}
                  {isPolicyGenerated && s.category && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#3B82F6",
                        backgroundColor: "#3B82F610",
                        padding: "1px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {s.category}
                    </span>
                  )}
                  {/* 검증 상태 */}
                  {s.validation.isValid ? (
                    <CheckCircle2
                      style={{ width: 14, height: 14, color: "#22C55E" }}
                    />
                  ) : (
                    <AlertTriangle
                      style={{ width: 14, height: 14, color: "#F59E0B" }}
                    />
                  )}
                </div>
                {/* 액션 버튼 */}
                <div
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onInsertText(s.answerText)}
                    title="입력창에 복사"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--app-text-tertiary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Copy style={{ width: 14, height: 14 }} />
                  </button>
                  <button
                    onClick={() => handleDirectSend(s)}
                    title="바로 전송"
                    style={{
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 6,
                      border: "none",
                      backgroundColor: "var(--app-tag-purple-text)",
                      color: "var(--app-surface)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Send style={{ width: 12, height: 12 }} />
                    전송
                  </button>
                </div>
              </div>

              {/* 답변 내용 (항상 전문 표시) */}
              {expandedCard !== i && (
                <div
                  style={{
                    padding: "0 12px 8px",
                    fontSize: 13,
                    color: "var(--app-text-secondary)",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {s.answerText}
                </div>
              )}

              {/* 답변 전문 (펼친 상태) */}
              {expandedCard === i && (
                <div style={{ padding: "0 12px 10px" }}>
                  {/* 매칭된 원본 질문 */}
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--app-text-tertiary)",
                      marginBottom: 6,
                    }}
                  >
                    <strong>매칭 질문:</strong>{" "}
                    {s.questionText.substring(0, 150)}
                  </div>
                  {/* 답변 전문 */}
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--app-text-primary)",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      backgroundColor: "var(--app-surface-secondary)",
                      padding: "8px 10px",
                      borderRadius: 6,
                    }}
                  >
                    {s.answerText}
                  </div>

                  {/* 시뮬레이션 모드 상세 점수 */}
                  {simMode && (
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 6,
                        fontSize: 12,
                        color: "var(--app-text-tertiary)",
                      }}
                    >
                      <span>유사도: {s.similarityScore}점 ({(s.similarity * 100).toFixed(1)}%)</span>
                      <span>태그: {s.tagScore}점</span>
                      <span>카테고리: {s.categoryScore}점</span>
                    </div>
                  )}

                  {/* 검증 이슈 */}
                  {s.validation.issues.length > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#F59E0B",
                      }}
                    >
                      {s.validation.issues.map((issue, j) => (
                        <div key={j}>⚠️ {issue}</div>
                      ))}
                    </div>
                  )}

                  {/* 수정 제안 */}
                  {s.validation.suggestedFix && (
                    <div style={{ marginTop: 6 }}>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#22C55E",
                          marginBottom: 2,
                        }}
                      >
                        수정 제안:
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--app-text-secondary)",
                          backgroundColor: "#22C55E10",
                          padding: "6px 8px",
                          borderRadius: 4,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {s.validation.suggestedFix}
                      </div>
                      <button
                        onClick={() =>
                          onInsertText(s.validation.suggestedFix!)
                        }
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "#22C55E",
                          backgroundColor: "transparent",
                          border: "none",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        수정본 사용
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}
    </div>
  );
}
