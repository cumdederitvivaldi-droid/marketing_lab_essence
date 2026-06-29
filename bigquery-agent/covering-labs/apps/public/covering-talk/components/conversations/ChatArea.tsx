"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { Conversation, STATUS_LABELS } from "@/lib/store/conversations";
import { MessageBubble } from "./MessageBubble";
import { MessageInput, type MessageInputHandle } from "./MessageInput";
import { Bot, User, CheckCircle, Link2, BookOpen, CalendarCheck, Receipt } from "lucide-react";
import { toast } from "sonner";
import type { PresenceState } from "@/lib/hooks/useCounselorPresence";
import { useInternalMode } from "@/lib/hooks/useInternalMode";
import { PickupInvoiceModal } from "./PickupInvoiceModal";

interface Props {
  conv: Conversation;
  onRefresh: () => void;
  onExtractToQuote?: (content: string) => Promise<number>;
  presenceViewers?: PresenceState[];
  onTypingChange?: (typing: boolean) => void;
}

const STATUS_DOT_COLORS: Record<string, string> = {
  pending: "#FF5B5B",
  needs_check: "#FF9F43",
  quote_sent_nudge: "#1AA3FF",
  quote_sent_no_nudge: "#1AA3FF",
  booked: "#20C997",
  completed: "#ADB5BD",
  no_response: "#ADB5BD",
  wrong_inbound: "#ADB5BD",
  night_pickup: "#845EF7",
  payment_check: "#1AA3FF",
};

const CLOSED_STATUSES = ["completed", "no_response", "wrong_inbound", "cancelled"];

export function ChatArea({ conv, onRefresh, onExtractToQuote, presenceViewers, onTypingChange }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const messageInputRef = useRef<MessageInputHandle>(null);
  const [internalMode] = useInternalMode(conv.sessionId);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const messageCount = conv.messages.length;
    const prevCount = prevMessageCountRef.current;
    const isNewMessage = messageCount > prevCount;
    prevMessageCountRef.current = messageCount;

    // 메시지가 처음 대량 로드된 경우 (클릭 시 1개→전체) → 즉시 하단으로
    if (isNewMessage && prevCount <= 1 && messageCount > 1) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      return;
    }

    // 새 메시지가 도착했을 때만 자동 스크롤 판단
    if (!isNewMessage && !conv.aiDraft) return;

    // 스크롤이 하단 근처(150px 이내)에 있을 때만 자동 스크롤
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conv.messages, conv.aiDraft]);

  // 세션이 바뀌면 항상 하단으로 스크롤 + 메시지 카운트 초기화
  useEffect(() => {
    prevMessageCountRef.current = conv.messages.length;
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [conv.sessionId]);

  const handleComplete = useCallback(async () => {
    try {
      await fetch(`/api/conversations/${conv.sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      onRefresh();
    } catch {}
  }, [conv.sessionId, onRefresh]);

  const [isSendingGuide, setIsSendingGuide] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  const handleSendGuide = useCallback(async () => {
    if (isSendingGuide) return;
    setIsSendingGuide(true);
    try {
      const res = await fetch(`/api/conversations/${conv.sessionId}/send-guide`, { method: "POST" });
      if (!res.ok) throw new Error("가이드 발송 실패");
      toast.success("가이드 발송 완료");
      onRefresh();
    } catch {
      toast.error("가이드 발송 실패");
    } finally {
      setIsSendingGuide(false);
    }
  }, [conv.sessionId, isSendingGuide, onRefresh]);

  const dotColor = STATUS_DOT_COLORS[conv.status] ?? "#ADB5BD";
  const isClosed = CLOSED_STATUSES.includes(conv.status);

  // 드래그 & 드랍 이미지
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (file.size > 20 * 1024 * 1024) { toast.error("이미지 크기가 20MB를 초과합니다"); return; }
      setDroppedFile(file);
    } else {
      // 파일 드랍 → 바로 전송
      if (file.size > 50 * 1024 * 1024) { toast.error("파일 크기가 50MB를 초과합니다"); return; }
      setDroppedFile(file);
    }
  }, []);

  return (
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, backgroundColor: "var(--app-surface)", position: "relative" }}
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
      {/* 좁은 너비 반응형: 버튼은 아이콘만, 패딩 축소 */}
      <style>{`
        @media (max-width: 1280px) {
          .chat-action-label { display: none; }
          .chat-action-btn { padding: 7px 10px !important; gap: 0 !important; }
        }
      `}</style>
      {/* 헤더 */}
      <div style={{
        height: 64, borderBottom: "1px solid var(--app-border)",
        padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            backgroundColor: "var(--app-border)", display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <User style={{ width: 20, height: 20, color: "var(--app-text-secondary)" }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontSize: 17, fontWeight: 600, color: "var(--app-text-primary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220,
              }}>
                {conv.name ?? conv.userKey}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 14, fontWeight: 500, color: "var(--app-text-secondary)",
                backgroundColor: "var(--app-surface-secondary)", borderRadius: 4, padding: "2px 8px",
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: dotColor }} />
                {STATUS_LABELS[conv.status]}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 0" }}>
              <p style={{ fontSize: 14, color: "var(--app-text-placeholder)", margin: 0 }}>세션 {conv.sessionId}</p>
              {presenceViewers && presenceViewers.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {presenceViewers.map((v) => (
                    <span key={v.name} style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 12, fontWeight: 600, padding: "1px 8px", borderRadius: 10,
                      backgroundColor: v.typing ? "#DBEAFE" : "#F0FDF4",
                      color: v.typing ? "#1D4ED8" : "#15803D",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: v.typing ? "#1D4ED8" : "#22C55E" }} />
                      {v.name}{v.typing ? " 입력 중..." : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <button
            className="chat-action-btn"
            title="주소복사"
            onClick={() => {
              const url = `${window.location.origin}/covering-talk/conversations?id=${conv.sessionId}`;
              navigator.clipboard.writeText(url);
              toast.success("채팅 주소가 복사되었습니다");
            }}
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
            <span className="chat-action-label">주소복사</span>
          </button>
          {!isClosed && (
            <button
              className="chat-action-btn"
              title="가이드발송"
              onClick={handleSendGuide}
              disabled={isSendingGuide}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 14, fontWeight: 600,
                color: isSendingGuide ? "var(--app-text-tertiary)" : "var(--app-accent)",
                backgroundColor: "var(--app-tag-blue-bg)", border: "1px solid var(--app-border)",
                borderRadius: 8, padding: "7px 14px",
                cursor: isSendingGuide ? "default" : "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { if (!isSendingGuide) e.currentTarget.style.backgroundColor = "var(--app-border)"; }}
              onMouseLeave={(e) => { if (!isSendingGuide) e.currentTarget.style.backgroundColor = "var(--app-tag-blue-bg)"; }}
            >
              <BookOpen style={{ width: 15, height: 15 }} />
              <span className="chat-action-label">{isSendingGuide ? "발송중..." : "가이드발송"}</span>
            </button>
          )}
          {!isClosed && (
            <button
              className="chat-action-btn"
              onClick={() => setShowInvoiceModal(true)}
              title="세금계산서 발행 (단건)"
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
              <Receipt style={{ width: 15, height: 15 }} />
              <span className="chat-action-label">세금계산서</span>
            </button>
          )}
          {!isClosed && (
            <button
              className="chat-action-btn"
              title="예약확정"
              onClick={() => messageInputRef.current?.triggerBookingConfirm()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 14, fontWeight: 600, color: "#E65100",
                backgroundColor: "#FFF3E0", border: "1px solid var(--app-border)",
                borderRadius: 8, padding: "7px 14px",
                cursor: "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#FFE0B2"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FFF3E0"; }}
            >
              <CalendarCheck style={{ width: 15, height: 15 }} />
              <span className="chat-action-label">예약확정</span>
            </button>
          )}
          {!isClosed && (
            <button
              className="chat-action-btn"
              title="상담완료"
              onClick={handleComplete}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 14, fontWeight: 600, color: "var(--app-btn-success-text)",
                backgroundColor: "var(--app-btn-success-bg)", border: "1px solid var(--app-border)",
                borderRadius: 8, padding: "7px 14px",
                cursor: "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-btn-success-bg)"; }}
            >
              <CheckCircle style={{ width: 15, height: 15 }} />
              <span className="chat-action-label">상담완료</span>
            </button>
          )}
        </div>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollContainerRef} style={{
        flex: 1, overflowY: "auto",
        padding: "20px 24px",
        backgroundColor: "var(--app-bg)",
      }}>
        {conv.messages.length === 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--app-text-placeholder)", fontSize: 15 }}>
            메시지가 없습니다
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(() => {
            const msgs = conv.messages;
            const skipSet = new Set<string>();
            const elements: React.ReactNode[] = [];
            let lastDateStr = "";
            msgs.forEach((msg, idx) => {
              if (skipSet.has(msg.id)) return;

              // 날짜 구분선: 이전 메시지와 날짜가 다르면 표시
              const msgDate = new Date(msg.timestamp);
              const dateStr = `${msgDate.getFullYear()}-${msgDate.getMonth()}-${msgDate.getDate()}`;
              if (dateStr !== lastDateStr) {
                lastDateStr = dateStr;
                const month = msgDate.getMonth() + 1;
                const day = msgDate.getDate();
                const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
                const weekday = weekdays[msgDate.getDay()];
                elements.push(
                  <div key={`date-${dateStr}`} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    margin: "12px 0",
                  }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: "var(--app-text-placeholder)" }} />
                    <span style={{ fontSize: 13, color: "var(--app-text-tertiary)", whiteSpace: "nowrap" }}>
                      {month}월 {day}일 ({weekday})
                    </span>
                    <div style={{ flex: 1, height: 1, backgroundColor: "var(--app-text-placeholder)" }} />
                  </div>
                );
              }

              // 연속 이미지 그룹핑: 같은 role의 이미지 메시지를 묶음
              if (msg.messageType === "image" && msg.imageUrl) {
                const group = [msg];
                for (let j = idx + 1; j < msgs.length; j++) {
                  const next = msgs[j];
                  if (next.messageType === "image" && next.imageUrl && next.role === msg.role) {
                    group.push(next);
                    skipSet.add(next.id);
                  } else break;
                }
                if (group.length > 1) {
                  elements.push(<MessageBubble key={msg.id} message={msg} groupedImages={group} onExtractToQuote={onExtractToQuote} quoteItems={conv.quote?.items} />);
                  return;
                }
              }

              elements.push(<MessageBubble key={msg.id} message={msg} onExtractToQuote={onExtractToQuote} quoteItems={conv.quote?.items} />);
            });
            return elements;
          })()}

          {/* AI 초안 — 내부대화 모드일 땐 숨김 */}
          {conv.aiDraft && !internalMode && (
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
                  {conv.aiDraft}
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <MessageInput
        sessionId={conv.sessionId}
        aiDraft={conv.aiDraft}
        isDone={conv.status === "completed"}
        onSent={onRefresh}
        onDraftUpdated={onRefresh}
        droppedFile={droppedFile}
        onDroppedFileConsumed={() => setDroppedFile(null)}
        conv={conv}
        inputRef={messageInputRef}
        onTypingChange={onTypingChange}
      />

      {/* 세금계산서 발행 모달 */}
      {showInvoiceModal && (
        <PickupInvoiceModal
          sessionId={conv.sessionId}
          customerName={conv.name ?? null}
          phone={conv.phone ?? null}
          onClose={() => setShowInvoiceModal(false)}
          onIssued={() => {
            setShowInvoiceModal(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
