"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Search } from "lucide-react";

interface HeadingInfo {
  level: number;
  text: string;
  slug: string;
}

interface PolicyPayload {
  text: string;
  headings: HeadingInfo[];
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣\-]/g, "")
    .slice(0, 80);
}

/** 초간단 마크다운 → HTML 변환 (정책 문서 포맷 전용) */
function renderMarkdown(text: string, highlightQuery: string): { html: string; matches: number } {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  let matches = 0;

  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const highlight = (s: string): string => {
    if (!highlightQuery) return s;
    const q = highlightQuery.trim();
    if (!q) return s;
    try {
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      return s.replace(re, (m) => {
        matches++;
        return `<mark style="background-color:#FEF08A;padding:1px 2px;border-radius:2px">${m}</mark>`;
      });
    } catch {
      return s;
    }
  };

  const inline = (s: string): string => {
    let r = escape(s);
    r = r.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    r = r.replace(/`([^`]+)`/g, '<code style="background:#F3F4F6;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:12px">$1</code>');
    return highlight(r);
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const hm = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (hm) {
      if (inList) { out.push("</ul>"); inList = false; }
      const level = hm[1].length;
      const txt = hm[2];
      const slug = slugify(txt);
      const sizes = [22, 18, 15, 14];
      const mts = [20, 18, 14, 12];
      const borders = [2, 1, 0, 0];
      out.push(
        `<h${level} id="section-${slug}" data-heading="${escape(txt)}" style="font-size:${sizes[level - 1]}px;font-weight:700;margin:${mts[level - 1]}px 0 8px;${borders[level - 1] ? `border-bottom:${borders[level - 1]}px solid #E5E7EB;padding-bottom:4px;` : ""}color:#0F172A">${highlight(escape(txt))}</h${level}>`
      );
      continue;
    }
    const lm = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (lm) {
      if (!inList) { out.push('<ul style="margin:4px 0 10px;padding-left:22px;line-height:1.7">'); inList = true; }
      out.push(`<li>${inline(lm[2])}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (!line.trim()) { out.push(""); continue; }
    out.push(`<p style="margin:6px 0;line-height:1.7">${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");

  return { html: out.join("\n"), matches };
}

export function PolicyModal({
  open,
  onClose,
  targetSection,
}: {
  open: boolean;
  onClose: () => void;
  targetSection?: string | null;
}) {
  const [data, setData] = useState<PolicyPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    if (data) return;
    setLoading(true);
    fetch("/api/policies/pickup")
      .then((r) => r.json())
      .then((d) => { if (d.text) setData(d); })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, [open, data]);

  const rendered = useMemo(() => {
    if (!data) return { html: "", matches: 0 };
    return renderMarkdown(data.text, query);
  }, [data, query]);

  // targetSection으로 스크롤
  useEffect(() => {
    if (!open || !data || !contentRef.current || !targetSection) return;
    const targetSlug = slugify(targetSection.replace(/^#+\s*/, ""));
    const el = contentRef.current.querySelector(`#section-${CSS.escape(targetSlug)}`) as HTMLElement | null;
    if (el) {
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.style.backgroundColor = "#FEF9C3";
        el.style.transition = "background-color 1.2s ease-out";
        setTimeout(() => { el.style.backgroundColor = ""; }, 50);
        setTimeout(() => { el.style.backgroundColor = ""; }, 2500);
      }, 80);
      return () => clearTimeout(t);
    }
  }, [open, data, targetSection, rendered.html]);

  const scrollToHeading = (slug: string) => {
    const el = contentRef.current?.querySelector(`#section-${CSS.escape(slug)}`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // 검색 결과에 매칭되는 heading들
  const filteredHeadings = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data.headings;
    const q = query.trim().toLowerCase();
    return data.headings.filter((h) => h.text.toLowerCase().includes(q));
  }, [data, query]);

  if (!open || typeof window === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 10000, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(1080px, 95vw)", height: "min(85vh, 860px)", display: "flex", flexDirection: "column", backgroundColor: "white", borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #E5E7EB", flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>📘 방문수거 정책 가이드</span>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", border: "1px solid #E5E7EB", borderRadius: 8, backgroundColor: "#F9FAFB" }}>
            <Search style={{ width: 14, height: 14, color: "#6B7280" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="정책 내용 검색 (예: 할인, 공휴일, 결제)"
              style={{ flex: 1, border: "none", outline: "none", fontSize: 13, backgroundColor: "transparent" }}
            />
            {query && (
              <button onClick={() => setQuery("")} style={{ border: "none", background: "none", cursor: "pointer", color: "#6B7280", fontSize: 14 }}>×</button>
            )}
            {query && rendered.matches > 0 && (
              <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 600 }}>{rendered.matches}건</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X style={{ width: 20, height: 20, color: "#6B7280" }} />
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* 좌측 TOC */}
          <nav style={{ width: 240, flexShrink: 0, overflow: "auto", padding: "14px 10px 20px", borderRight: "1px solid #E5E7EB", backgroundColor: "#F9FAFB" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", padding: "0 10px 8px", textTransform: "uppercase", letterSpacing: 0.5 }}>
              목차{query && ` (${filteredHeadings.length})`}
            </div>
            {filteredHeadings.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 12, color: "#9CA3AF" }}>검색 결과 없음</div>
            )}
            {filteredHeadings.map((h) => (
              <button
                key={h.slug}
                onClick={() => scrollToHeading(h.slug)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: `6px 10px 6px ${10 + (h.level - 1) * 12}px`,
                  fontSize: h.level === 1 ? 13 : h.level === 2 ? 12 : 11,
                  fontWeight: h.level <= 2 ? 600 : 400,
                  color: h.level === 1 ? "#0F172A" : "#475569",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  lineHeight: 1.4,
                  borderRadius: 4,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#EFF6FF"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                {h.text}
              </button>
            ))}
          </nav>

          {/* 본문 */}
          <div ref={contentRef} style={{ flex: 1, overflow: "auto", padding: "20px 28px 40px", backgroundColor: "white" }}>
            {loading && !data ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>정책 문서 불러오는 중...</div>
            ) : !data ? (
              <div style={{ textAlign: "center", padding: 40, color: "#EF4444" }}>정책 문서를 불러오지 못했습니다.</div>
            ) : (
              <div style={{ fontSize: 13, color: "#1F2937" }} dangerouslySetInnerHTML={{ __html: rendered.html }} />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
