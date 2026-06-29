"use client";

import { useState, useEffect } from "react";
import { ChatMessage, QuoteItem } from "@/lib/store/conversations";
import { formatTime } from "@/lib/utils/format";
import { Bot, User, Download, Plus, Loader2, Check, Package, ChevronLeft, ChevronRight, X } from "lucide-react";

const BADGE_COLORS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981",
  "#6366F1", "#EF4444", "#14B8A6", "#F97316", "#06B6D4",
  "#84CC16", "#A855F7", "#E11D48", "#0EA5E9", "#D946EF",
];

interface KeywordMatch {
  keyword: string;
  index: number; // quote item index (0-based)
  color: string;
}

/** 키워드에서 핵심 단어 추출 (띄어쓰기·접미사 무시 매칭용) */
// 흔한 오타/변형 매핑 (원문 → 정규화)
const TYPO_VARIANTS: Record<string, string[]> = {
  "사이즈": ["싸이즈", "사이스", "싸이스"],
  "매트리스": ["메트리스", "매트리스", "메트레스"],
  "냉장고": ["냉장꼬"],
  "세탁기": ["세탁끼"],
  "장롱": ["장농"],
};

/** 동의어 매핑 (정규화 후 keyword ↔ 고객이 쓸 수 있는 다른 표현) */
const SYNONYM_MAP: Record<string, string[]> = {
  "장롱": ["옷장"],
  "옷장": ["장롱"],
  "식탁": ["밥상", "테이블"],
  "화장대": ["드레서"],
  "서랍장": ["서럽장"],
};

function extractCoreWords(keyword: string): string[] {
  // "침대 퀸 SET" → ["침대", "퀸"], "장롱 4자" → ["장롱"], "서랍장 3단이하" → ["서랍장"]
  const stripped = keyword
    .replace(/\s*SET$/i, "")
    .replace(/\s*\d+단.*$/, "")
    .replace(/\s*\d+자.*$/, "")
    .replace(/\s*\(.*?\)/, "")
    .replace(/\d+개?$/, "")  // "옷장1개", "서랍장2" 등 뒤의 숫자+개 제거
    .trim();
  // 공백 기준 분리 후 한글 1자 이상인 것만 (퀸, 킹 등 1글자도 포함)
  const words = stripped.split(/\s+/).filter((w) => /[가-힣]/.test(w));

  // 공백 제거 후 전체 합친 것도 추가 (띄어쓰기 무시 매칭용)
  const collapsed = words.join("");
  if (collapsed.length >= 2 && !words.includes(collapsed)) {
    words.push(collapsed);
  }

  // 오타 변형도 추가 (예: "퀸사이즈침대" → "퀸싸이즈침대"도 매칭)
  const expanded: string[] = [...words];
  for (const word of words) {
    // 오타 변형
    for (const [standard, variants] of Object.entries(TYPO_VARIANTS)) {
      if (word.includes(standard)) {
        for (const v of variants) {
          expanded.push(word.replace(standard, v));
        }
      }
      for (const v of variants) {
        if (word.includes(v)) {
          expanded.push(word.replace(v, standard));
        }
      }
    }
    // 동의어 추가
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
      if (word === key || word.includes(key)) {
        for (const syn of synonyms) {
          expanded.push(word.replace(key, syn));
        }
      }
    }
  }
  return [...new Set(expanded)];
}

/** 텍스트에서 키워드를 찾아 하이라이트된 React 노드 배열 반환 */
function highlightKeywords(text: string, matches: KeywordMatch[]): React.ReactNode[] {
  if (matches.length === 0) return [text];

  // 모든 매칭 위치 찾기
  const segments: { start: number; end: number; match: KeywordMatch }[] = [];

  for (const m of matches) {
    // 1차: 원본 키워드 전체 매칭
    const kwLower = m.keyword.toLowerCase();
    let found = false;
    let pos = 0;
    while (true) {
      const idx = text.toLowerCase().indexOf(kwLower, pos);
      if (idx === -1) break;
      const overlaps = segments.some((s) => idx < s.end && idx + kwLower.length > s.start);
      if (!overlaps) {
        segments.push({ start: idx, end: idx + kwLower.length, match: m });
        found = true;
      }
      pos = idx + 1;
    }

    // 2차: 핵심 단어로 부분 매칭 (붙어있는 텍스트에서도 찾기)
    if (!found) {
      const coreWords = extractCoreWords(m.keyword);
      // 사이즈/수식어 단어는 단독 매칭 제외 (다른 품목과 혼동 방지)
      const MODIFIER_WORDS = new Set(["소형", "중형", "대형", "일반", "미니", "특대", "양문형", "킹", "퀸", "싱글", "더블", "슈퍼싱글"]);
      // 긴 단어부터 먼저 매칭 (더 정확한 매칭 우선)
      const sorted = [...coreWords].sort((a, b) => b.length - a.length);
      for (const word of sorted) {
        if (word.length < 2) continue; // 1글자 단독 매칭은 너무 광범위
        if (MODIFIER_WORDS.has(word)) continue; // 수식어 단독 매칭 제외
        const wLower = word.toLowerCase();
        pos = 0;
        while (true) {
          const idx = text.toLowerCase().indexOf(wLower, pos);
          if (idx === -1) break;
          const overlaps = segments.some((s) => idx < s.end && idx + wLower.length > s.start);
          if (!overlaps) {
            segments.push({ start: idx, end: idx + wLower.length, match: m });
            found = true;
          }
          pos = idx + 1;
        }
      }
    }
  }

  if (segments.length === 0) return [text];
  segments.sort((a, b) => a.start - b.start);

  // 겹치는 세그먼트 제거 (먼저 나온 것 우선)
  const filtered: typeof segments = [];
  for (const seg of segments) {
    if (filtered.length === 0 || seg.start >= filtered[filtered.length - 1].end) {
      filtered.push(seg);
    }
  }

  const result: React.ReactNode[] = [];
  let lastEnd = 0;
  for (const seg of filtered) {
    if (seg.start > lastEnd) {
      result.push(text.slice(lastEnd, seg.start));
    }
    result.push(
      <span key={`hl-${seg.start}`} style={{
        backgroundColor: `${seg.match.color}18`,
        borderBottom: `2px solid ${seg.match.color}`,
        borderRadius: 2, padding: "0 1px",
      }}>
        {text.slice(seg.start, seg.end)}
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: "50%", fontSize: 9, fontWeight: 700,
          color: "#fff", backgroundColor: seg.match.color,
          marginLeft: 2, verticalAlign: "middle", lineHeight: 1,
        }}>
          {seg.match.index + 1}
        </span>
      </span>
    );
    lastEnd = seg.end;
  }
  if (lastEnd < text.length) {
    result.push(text.slice(lastEnd));
  }
  return result;
}

interface Props {
  message: ChatMessage;
  /** 연속 이미지 그룹: 첫 번째 메시지의 MessageBubble에 전달, 나머지는 건너뜀 */
  groupedImages?: ChatMessage[];
  /** 견적추가 콜백: 고객 텍스트 메시지에서 품목 추출 */
  onExtractToQuote?: (content: string) => Promise<number>;
  /** 견적 품목 목록 — 고객 메시지에서 키워드 하이라이트용 */
  quoteItems?: QuoteItem[];
}

/** 내부 메시지의 @멘션 highlight (퍼플 굵게). */
function renderInternalContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@([가-힣]{2,5}|[a-zA-Z][a-zA-Z0-9_]{1,15})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} style={{ color: "#7B1FA2", fontWeight: 700 }}>
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

export function MessageBubble({ message, groupedImages, onExtractToQuote, quoteItems }: Props) {
  const [extractState, setExtractState] = useState<"idle" | "loading" | "done">("idle");
  const [extractCount, setExtractCount] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // ── 라이트박스 ──────────────────────────────
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState(0);

  const lightboxImages: string[] = groupedImages
    ? groupedImages.map((img) => img.imageUrl!).filter(Boolean)
    : message.imageUrl
    ? [message.imageUrl]
    : [];

  const openLightbox = (idx: number) => { setLightboxIdx(idx); setLightboxOpen(true); };
  const closeLightbox = () => setLightboxOpen(false);
  const goPrev = () => setLightboxIdx((i) => Math.max(0, i - 1));
  const goNext = () => setLightboxIdx((i) => Math.min(lightboxImages.length - 1, i + 1));

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen]);

  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isInternal = message.isInternal === true;
  const isTextMessage = !message.imageUrl && message.messageType !== "image";
  const showExtractButton = isUser && isTextMessage && onExtractToQuote && message.content.length > 2;

  const handleExtract = async () => {
    if (!onExtractToQuote || extractState === "loading") return;
    setExtractState("loading");
    try {
      const count = await onExtractToQuote(message.content);
      setExtractCount(count);
      setExtractState("done");
      setTimeout(() => setExtractState("idle"), 3000);
    } catch {
      setExtractState("idle");
    }
  };
  const isAutoGenerated = !isUser && (
    !message.sentBy ||
    message.sentBy.includes("자동생성") ||
    message.sentBy.includes("자동") ||
    message.sentBy === "AI" ||
    message.sentBy === "상담사"
  );
  const counselorInitial = !isUser && !isAutoGenerated && message.sentBy
    ? message.sentBy.replace(/\(.*\)/, "").charAt(0)
    : null;

  const downloadImages = async (urls: string[]) => {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        // 서버 프록시로 다운로드 시도
        const proxyUrl = `/api/download-image?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const blob = await res.blob();
          const ext = (res.headers.get("content-type") ?? "").includes("png") ? "png" : "jpg";
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `image_${Date.now()}_${i + 1}.${ext}`;
          a.click();
          URL.revokeObjectURL(blobUrl);
        } else {
          // 프록시 실패 → 새 탭에서 열기 (브라우저가 직접 접근)
          window.open(url, "_blank");
        }
      } catch {
        window.open(url, "_blank");
      }
      if (i < urls.length - 1) await new Promise((r) => setTimeout(r, 300));
    }
  };

  if (isSystem) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
        <span style={{
          fontSize: 14, color: "var(--app-text-tertiary)",
          backgroundColor: "var(--app-border)", padding: "4px 12px", borderRadius: 12,
        }}>
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <>
    <div
      style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 아바타 */}
      {isUser ? (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          backgroundColor: "var(--app-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <User style={{ width: 16, height: 16, color: "var(--app-text-secondary)" }} />
        </div>
      ) : counselorInitial ? (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          backgroundColor: "#1AA3FF",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontSize: 14, fontWeight: 700, color: "white",
        }}>
          {counselorInitial}
        </div>
      ) : (
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          backgroundColor: "#EBF4FF",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <Bot style={{ width: 16, height: 16, color: "#1AA3FF" }} />
        </div>
      )}

      <div style={{ maxWidth: "80%" }}>
        {/* 발신자 + 시간 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>
            {isUser ? "고객" : (message.sentBy ?? "상담사")}
          </span>
          <span style={{ fontSize: 13, color: "var(--app-text-placeholder)" }}>
            {formatTime(message.timestamp)}
          </span>
        </div>

        {/* 이미지 메시지 (그룹 또는 단일) */}
        {groupedImages && groupedImages.length > 0 ? (
          <div>
            <div style={{
              display: "grid",
              gridTemplateColumns: groupedImages.length === 1 ? "1fr" : groupedImages.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
              gap: 6,
              maxWidth: groupedImages.length === 1 ? 420 : 680,
            }}>
              {groupedImages.map((img, idx) => (
                <div key={img.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--app-border)", cursor: "zoom-in" }}
                  onClick={() => openLightbox(idx)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.imageUrl}
                    alt="첨부 이미지"
                    style={{ width: "100%", height: groupedImages.length === 1 ? "auto" : 200, objectFit: "cover", display: "block" }}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => downloadImages(groupedImages.map((img) => img.imageUrl!).filter(Boolean))}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                marginTop: 6, padding: "4px 10px", borderRadius: 6,
                border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
                fontSize: 13, color: "var(--app-text-secondary)", cursor: "pointer",
              }}
            >
              <Download style={{ width: 12, height: 12 }} />
              {groupedImages.length === 1 ? "저장" : `${groupedImages.length}장 저장`}
            </button>
          </div>
        ) : message.messageType === "file" && message.imageUrl ? (
          <a href={message.imageUrl} target="_blank" rel="noopener noreferrer" style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
            borderRadius: 12, backgroundColor: "var(--app-bg)", border: "1px solid var(--app-border)",
            textDecoration: "none", maxWidth: 380,
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>FILE</span>
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {message.content.replace("[파일] ", "") || "파일"}
              </div>
              <div style={{ fontSize: 12, color: "var(--app-accent)" }}>다운로드</div>
            </div>
          </a>
        ) : message.messageType === "image" && message.imageUrl ? (
          <div>
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--app-border)", cursor: "zoom-in", display: "inline-block" }}
              onClick={() => openLightbox(0)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={message.imageUrl} alt="첨부 이미지" style={{ maxWidth: 420, borderRadius: 12, display: "block" }} />
            </div>
            <button
              onClick={() => downloadImages([message.imageUrl!])}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                marginTop: 6, padding: "4px 10px", borderRadius: 6,
                border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
                fontSize: 13, color: "var(--app-text-secondary)", cursor: "pointer",
              }}
            >
              <Download style={{ width: 12, height: 12 }} />
              저장
            </button>
          </div>
        ) : (
          (() => {
            const kwMatches = isUser && quoteItems && quoteItems.length > 0
              ? quoteItems
                  .map((item, idx) => {
                    const keyword = item.sourceKeyword
                      || item.name.replace(/^.+?\s*-\s*/, "").replace(/\(.*?\)/g, "").trim();
                    return keyword ? { keyword, index: idx, color: BADGE_COLORS[idx % BADGE_COLORS.length] } : null;
                  })
                  .filter((m): m is KeywordMatch => m !== null)
              : [];
            // 디버그: 하이라이트 매칭 확인 (브라우저 콘솔에서 확인)
            if (isUser && quoteItems && quoteItems.length > 0 && kwMatches.length > 0) {
              console.log("[HL-DEBUG]", message.content.slice(0, 40), {
                items: quoteItems.map((q, i) => ({
                  i,
                  name: q.name,
                  srcKw: q.sourceKeyword,
                  kw: kwMatches[i]?.keyword,
                })),
                coreWords: kwMatches.map(m => ({ kw: m.keyword, cores: extractCoreWords(m.keyword) })),
              });
            }
            const matchedCount = kwMatches.filter((m) => {
              if (message.content.toLowerCase().includes(m.keyword.toLowerCase())) return true;
              return extractCoreWords(m.keyword).some((w) =>
                message.content.toLowerCase().includes(w.toLowerCase())
              );
            }).length;

            return (
              <div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <div style={{
                    padding: "10px 16px",
                    borderRadius: "18px 18px 18px 4px",
                    fontSize: 16, lineHeight: 1.6,
                    backgroundColor: isInternal ? "#FFF8E1" : (isUser ? "var(--app-bubble-user-bg)" : "var(--app-bubble-manager-bg)"),
                    color: isInternal ? "#5D4037" : (isUser ? "var(--app-bubble-user-text)" : "var(--app-bubble-manager-text)"),
                    border: isInternal ? "1px solid #FFD54F" : (isUser ? "var(--app-bubble-user-border)" : "none"),
                    boxShadow: "var(--app-shadow)",
                    wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "pre-wrap",
                  }}>
                    {isInternal
                      ? renderInternalContent(message.content)
                      : (kwMatches.length > 0 ? highlightKeywords(message.content, kwMatches) : message.content)}
                  </div>
                  {showExtractButton && (isHovered || extractState !== "idle") && (
                    <button
                      onClick={handleExtract}
                      disabled={extractState === "loading"}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "4px 8px", borderRadius: 6,
                        border: "1px solid var(--app-border)",
                        backgroundColor: extractState === "done" ? "#E6FAF2" : "var(--app-bg)",
                        fontSize: 12, fontWeight: 500,
                        color: extractState === "done" ? "#20C997" : "var(--app-text-secondary)",
                        cursor: extractState === "loading" ? "wait" : "pointer",
                        whiteSpace: "nowrap", flexShrink: 0, marginTop: 2,
                        transition: "all 0.15s",
                      }}
                    >
                      {extractState === "loading" ? (
                        <><Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />추출중</>
                      ) : extractState === "done" ? (
                        <><Check style={{ width: 11, height: 11 }} />{extractCount}개 추가</>
                      ) : (
                        <><Plus style={{ width: 11, height: 11 }} />견적추가</>
                      )}
                    </button>
                  )}
                </div>
                {isUser && matchedCount > 0 && (
                  <div style={{ marginTop: 4, marginLeft: 2 }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: 10,
                      backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE",
                      fontSize: 11, fontWeight: 500, color: "#3B82F6",
                    }}>
                      <Package style={{ width: 11, height: 11 }} />
                      {matchedCount}개 품목 감지
                    </span>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </div>

    {/* ── 라이트박스 오버레이 ── */}
    {lightboxOpen && lightboxImages.length > 0 && (
      <div
        onClick={closeLightbox}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          backgroundColor: "rgba(0,0,0,0.92)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {/* 닫기 */}
        <button onClick={closeLightbox} style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
          width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", cursor: "pointer",
        }}>
          <X style={{ width: 20, height: 20 }} />
        </button>

        {/* 인덱스 표시 */}
        {lightboxImages.length > 1 && (
          <div style={{
            position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600,
            backgroundColor: "rgba(0,0,0,0.4)", padding: "4px 12px", borderRadius: 20,
          }}>
            {lightboxIdx + 1} / {lightboxImages.length}
          </div>
        )}

        {/* 이전 */}
        {lightboxIdx > 0 && (
          <button onClick={(e) => { e.stopPropagation(); goPrev(); }} style={{
            position: "absolute", left: 16,
            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", cursor: "pointer",
          }}>
            <ChevronLeft style={{ width: 28, height: 28 }} />
          </button>
        )}

        {/* 다음 */}
        {lightboxIdx < lightboxImages.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); goNext(); }} style={{
            position: "absolute", right: 16,
            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%",
            width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", cursor: "pointer",
          }}>
            <ChevronRight style={{ width: 28, height: 28 }} />
          </button>
        )}

        {/* 이미지 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightboxImages[lightboxIdx]}
          alt="이미지"
          onClick={(e) => e.stopPropagation()}
          style={{
            maxWidth: "calc(100vw - 140px)",
            maxHeight: "calc(100vh - 80px)",
            objectFit: "contain",
            borderRadius: 8,
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
        />

        {/* 하단 썸네일 (3장 이상일 때) */}
        {lightboxImages.length > 2 && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 8,
          }}>
            {lightboxImages.map((url, i) => (
              <div
                key={i}
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(i); }}
                style={{
                  width: 48, height: 48, borderRadius: 6, overflow: "hidden",
                  border: i === lightboxIdx ? "2px solid #fff" : "2px solid transparent",
                  opacity: i === lightboxIdx ? 1 : 0.5,
                  cursor: "pointer", flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    )}
    </>
  );
}
