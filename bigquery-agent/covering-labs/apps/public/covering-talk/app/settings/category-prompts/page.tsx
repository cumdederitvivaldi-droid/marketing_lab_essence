"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, ChevronDown, ChevronRight, FileText, Tag, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface CategoryPrompt {
  id: number;
  category_id: string;
  category_name: string;
  parent_category: string | null;
  prompt_rules: string;
  policy_sections: string[];
  ai_scope_note: string | null;
  updated_at: string;
}

const PARENT_ORDER = ["서비스이용", "구독", "배송", "미수거", "결제", null];
const PARENT_LABELS: Record<string, string> = {
  "서비스이용": "A. 서비스이용",
  "구독": "B. 구독",
  "배송": "C. 배송",
  "미수거": "D. 미수거",
  "결제": "E. 결제",
};

export default function CategoryPromptsPage() {
  const [prompts, setPrompts] = useState<CategoryPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CategoryPrompt | null>(null);
  const [editRules, setEditRules] = useState("");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(PARENT_ORDER.map(p => p ?? "독립")));

  useEffect(() => {
    fetch("/api/settings/category-prompts")
      .then((r) => r.json())
      .then((d) => {
        setPrompts(d.prompts ?? []);
        if (d.prompts?.length > 0) {
          selectPrompt(d.prompts[0]);
        }
      })
      .catch(() => toast.error("프롬프트 로드 실패"))
      .finally(() => setLoading(false));
  }, []);

  const selectPrompt = (p: CategoryPrompt) => {
    if (dirty) {
      if (!confirm("저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?")) return;
    }
    setSelected(p);
    setEditRules(p.prompt_rules);
    setEditNote(p.ai_scope_note ?? "");
    setDirty(false);
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/category-prompts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: selected.category_id,
          prompt_rules: editRules,
          ai_scope_note: editNote || null,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      setPrompts((prev) =>
        prev.map((p) => (p.category_id === selected.category_id ? data.prompt : p))
      );
      setSelected(data.prompt);
      setDirty(false);
      toast.success(`${selected.category_name} 프롬프트 저장 완료`);
    } catch {
      toast.error("저장 실패");
    } finally {
      setSaving(false);
    }
  };

  // 그룹별로 정리
  const grouped = new Map<string, CategoryPrompt[]>();
  for (const p of prompts) {
    const key = p.parent_category ?? "독립";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
        <span style={{ marginLeft: 8, color: "var(--app-text-tertiary)", fontSize: 15 }}>로딩 중...</span>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      {/* 헤더 */}
      <div style={{
        padding: "20px 32px", borderBottom: "1px solid var(--app-border)",
        backgroundColor: "var(--app-surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
              카테고리 프롬프트 관리
            </h1>
            <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "4px 0 0" }}>
              채널톡 AI 상담 — 20개 카테고리별 답변 규칙을 관리합니다
            </p>
          </div>
          <a
            href="/settings"
            style={{
              fontSize: 13, color: "var(--app-accent)", textDecoration: "none",
              padding: "6px 12px", borderRadius: 6, border: "1px solid var(--app-border)",
              backgroundColor: "var(--app-surface)",
            }}
          >
            설정으로 돌아가기
          </a>
        </div>
      </div>

      {/* 본문: 좌측 목록 + 우측 편집 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 좌측: 카테고리 목록 */}
        <div style={{
          width: 280, borderRight: "1px solid var(--app-border)",
          overflow: "auto", backgroundColor: "var(--app-surface)",
        }}>
          {PARENT_ORDER.map((parent) => {
            const key = parent ?? "독립";
            const items = grouped.get(key);
            if (!items) return null;
            const isExpanded = expandedGroups.has(key);
            return (
              <div key={key}>
                <button
                  onClick={() => toggleGroup(key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 6,
                    padding: "10px 16px", border: "none", cursor: "pointer",
                    backgroundColor: "var(--app-surface-secondary)",
                    borderBottom: "1px solid var(--app-border)",
                    fontSize: 12, fontWeight: 700, color: "var(--app-text-secondary)",
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}
                >
                  {isExpanded
                    ? <ChevronDown style={{ width: 14, height: 14 }} />
                    : <ChevronRight style={{ width: 14, height: 14 }} />
                  }
                  {PARENT_LABELS[key] ?? "F. 독립"}
                  <span style={{
                    marginLeft: "auto", fontSize: 11, fontWeight: 500,
                    color: "var(--app-text-tertiary)",
                  }}>
                    {items.length}
                  </span>
                </button>
                {isExpanded && items.map((p) => (
                  <button
                    key={p.category_id}
                    onClick={() => selectPrompt(p)}
                    style={{
                      width: "100%", display: "flex", flexDirection: "column",
                      alignItems: "flex-start", gap: 2,
                      padding: "10px 16px 10px 32px", border: "none", cursor: "pointer",
                      borderBottom: "1px solid var(--app-border-light, var(--app-border))",
                      backgroundColor: selected?.category_id === p.category_id
                        ? "var(--app-tag-blue-bg)" : "transparent",
                      transition: "background-color 0.15s",
                    }}
                  >
                    <span style={{
                      fontSize: 14, fontWeight: selected?.category_id === p.category_id ? 600 : 400,
                      color: selected?.category_id === p.category_id
                        ? "var(--app-accent)" : "var(--app-text-primary)",
                    }}>
                      {p.category_name}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
                      {p.category_id}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* 우측: 편집 영역 */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {selected ? (
            <div style={{ maxWidth: 800 }}>
              {/* 카테고리 정보 헤더 */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 20,
              }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
                    {selected.category_name}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span style={{
                      fontSize: 12, padding: "2px 8px", borderRadius: 4,
                      backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-accent)",
                      fontWeight: 600, fontFamily: "monospace",
                    }}>
                      {selected.category_id}
                    </span>
                    {selected.parent_category && (
                      <span style={{
                        fontSize: 12, padding: "2px 8px", borderRadius: 4,
                        backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-tertiary)",
                      }}>
                        {selected.parent_category}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 8, border: "none", cursor: dirty ? "pointer" : "default",
                    backgroundColor: dirty ? "var(--app-accent)" : "var(--app-surface-secondary)",
                    color: dirty ? "#fff" : "var(--app-text-tertiary)",
                    fontSize: 14, fontWeight: 600,
                    opacity: saving ? 0.6 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  {saving
                    ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    : <Save style={{ width: 16, height: 16 }} />
                  }
                  저장
                </button>
              </div>

              {/* 정책 섹션 태그 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                marginBottom: 16,
              }}>
                <Tag style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
                <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", fontWeight: 600 }}>
                  정책 섹션:
                </span>
                {selected.policy_sections.map((s) => (
                  <span key={s} style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 4,
                    backgroundColor: "var(--app-surface-secondary)",
                    color: "var(--app-text-secondary)", border: "1px solid var(--app-border)",
                  }}>
                    {s}
                  </span>
                ))}
              </div>

              {/* 프롬프트 규칙 편집 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)",
                  marginBottom: 8,
                }}>
                  <FileText style={{ width: 16, height: 16 }} />
                  프롬프트 규칙 (prompt_rules)
                </label>
                <textarea
                  value={editRules}
                  onChange={(e) => { setEditRules(e.target.value); setDirty(true); }}
                  rows={20}
                  style={{
                    width: "100%", padding: 12, borderRadius: 8,
                    border: "1px solid var(--app-input-border)",
                    backgroundColor: "var(--app-input-bg)",
                    color: "var(--app-text-primary)",
                    fontSize: 13, fontFamily: "monospace", lineHeight: 1.6,
                    resize: "vertical", outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--app-accent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--app-input-border)"; }}
                />
              </div>

              {/* AI 범위 참고사항 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)",
                  marginBottom: 8,
                }}>
                  <AlertCircle style={{ width: 16, height: 16 }} />
                  AI 범위 참고사항 (ai_scope_note)
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => { setEditNote(e.target.value); setDirty(true); }}
                  placeholder="선택사항 — 예: 금액 관련은 신중하게"
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 8,
                    border: "1px solid var(--app-input-border)",
                    backgroundColor: "var(--app-input-bg)",
                    color: "var(--app-text-primary)",
                    fontSize: 14, outline: "none",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--app-accent)"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "var(--app-input-border)"; }}
                />
              </div>

              {/* 수정일 */}
              <p style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
                마지막 수정: {new Date(selected.updated_at).toLocaleString("ko-KR")}
              </p>
            </div>
          ) : (
            <div style={{
              height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--app-text-tertiary)", fontSize: 15,
            }}>
              좌측에서 카테고리를 선택하세요
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
