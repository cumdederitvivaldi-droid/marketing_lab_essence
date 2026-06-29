"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Search, ChevronDown, ChevronRight, Pencil, Trash2, X, Check, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import AuditLogPanel from "@/components/AuditLogPanel";

interface Macro {
  id: number;
  name: string;
  content: string;
  category: string;
  sort_order: number;
  is_active: boolean;
}

export default function TemplatesPage() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", content: "", category: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", content: "", category: "" });
  const [categories, setCategories] = useState<string[]>([]);

  // 이력 조회
  const [auditMacroId, setAuditMacroId] = useState<number | null>(null);

  const fetchMacros = useCallback(async () => {
    try {
      const res = await fetch("/api/macros");
      const data = await res.json();
      setMacros(data.macros ?? []);
      setCategories(data.categories ?? []);
      // 처음 로드 시 모든 카테고리 펼치기
      if (expandedCategories.size === 0 && data.categories?.length) {
        setExpandedCategories(new Set(data.categories));
      }
    } catch {
      toast.error("매크로 목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMacros(); }, [fetchMacros]);

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const startEdit = (macro: Macro) => {
    setEditingId(macro.id);
    setEditForm({ name: macro.name, content: macro.content, category: macro.category });
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async () => {
    if (!editingId || !editForm.name.trim() || !editForm.content.trim()) return;
    try {
      const res = await fetch("/api/macros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editForm }),
      });
      if (!res.ok) throw new Error();
      toast.success("매크로 수정 완료");
      setEditingId(null);
      fetchMacros();
    } catch {
      toast.error("매크로 수정 실패");
    }
  };

  const deleteMacro = async (id: number, name: string) => {
    if (!confirm(`"${name}" 매크로를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch("/api/macros", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast.success("매크로 삭제 완료");
      fetchMacros();
    } catch {
      toast.error("매크로 삭제 실패");
    }
  };

  const addMacro = async () => {
    if (!addForm.name.trim() || !addForm.content.trim()) {
      toast.error("이름과 내용을 입력해주세요");
      return;
    }
    try {
      const res = await fetch("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) throw new Error();
      toast.success("매크로 추가 완료");
      setShowAddForm(false);
      setAddForm({ name: "", content: "", category: "" });
      fetchMacros();
    } catch {
      toast.error("매크로 추가 실패");
    }
  };

  // 검색 필터
  const filtered = search.trim()
    ? macros.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.content.toLowerCase().includes(search.toLowerCase())
      )
    : macros;

  // 카테고리별 그룹핑
  const grouped: Record<string, Macro[]> = {};
  for (const m of filtered) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push(m);
  }

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
        backgroundColor: "var(--app-surface)", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>템플릿 관리</h1>
          <p style={{ fontSize: 13, color: "var(--app-text-tertiary)", margin: "4px 0 0" }}>
            상담에서 자주 사용하는 답변 템플릿을 관리합니다 ({macros.length}개)
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* 검색 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 12px", backgroundColor: "var(--app-surface-secondary)",
            borderRadius: 8, border: "1px solid var(--app-border)",
          }}>
            <Search style={{ width: 16, height: 16, color: "var(--app-text-tertiary)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="검색..."
              style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: 14, color: "var(--app-text-primary)", width: 180,
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                <X style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
              </button>
            )}
          </div>
          {/* 추가 버튼 */}
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", backgroundColor: "var(--app-accent)", color: "var(--app-btn-primary-text)",
              borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus style={{ width: 16, height: 16 }} />
            새 템플릿
          </button>
        </div>
      </div>

      {/* 추가 폼 */}
      {showAddForm && (
        <div style={{
          margin: "16px 32px 0", padding: 20, backgroundColor: "var(--app-surface)",
          borderRadius: 12, border: "1px solid var(--app-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--app-text-primary)" }}>새 템플릿 추가</span>
            <button onClick={() => setShowAddForm(false)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>
              <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <input
              value={addForm.name}
              onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
              placeholder="매크로명"
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 6,
                border: "1px solid var(--app-border)", fontSize: 14, outline: "none",
              }}
            />
            <select
              value={addForm.category}
              onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))}
              style={{
                padding: "8px 12px", borderRadius: 6,
                border: "1px solid var(--app-border)", fontSize: 14, outline: "none",
                backgroundColor: "var(--app-surface)", minWidth: 150,
              }}
            >
              <option value="">카테고리 선택</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <textarea
            value={addForm.content}
            onChange={e => setAddForm(p => ({ ...p, content: e.target.value }))}
            placeholder="템플릿 내용..."
            rows={4}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 6,
              border: "1px solid var(--app-border)", fontSize: 14, outline: "none",
              resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                padding: "8px 16px", borderRadius: 6, border: "1px solid var(--app-border)",
                backgroundColor: "var(--app-surface)", fontSize: 14, cursor: "pointer", color: "var(--app-text-secondary)",
              }}
            >취소</button>
            <button
              onClick={addMacro}
              style={{
                padding: "8px 16px", borderRadius: 6, border: "none",
                backgroundColor: "var(--app-accent)", color: "var(--app-btn-primary-text)", fontSize: 14,
                fontWeight: 600, cursor: "pointer",
              }}
            >추가</button>
          </div>
        </div>
      )}

      {/* 매크로 목록 */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 32px 32px" }}>
        {Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--app-text-tertiary)" }}>
            {search ? "검색 결과가 없습니다" : "등록된 템플릿이 없습니다"}
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              {/* 카테고리 헤더 */}
              <button
                onClick={() => toggleCategory(cat)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "10px 16px", backgroundColor: "var(--app-surface)",
                  borderRadius: expandedCategories.has(cat) ? "10px 10px 0 0" : 10,
                  border: "1px solid var(--app-border)", borderBottom: expandedCategories.has(cat) ? "none" : "1px solid var(--app-border)",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                {expandedCategories.has(cat) ? (
                  <ChevronDown style={{ width: 16, height: 16, color: "var(--app-text-secondary)" }} />
                ) : (
                  <ChevronRight style={{ width: 16, height: 16, color: "var(--app-text-secondary)" }} />
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)" }}>{cat}</span>
                <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>({items.length}개)</span>
              </button>

              {/* 카테고리 아이템 */}
              {expandedCategories.has(cat) && (
                <div style={{
                  backgroundColor: "var(--app-surface)", borderRadius: "0 0 10px 10px",
                  border: "1px solid var(--app-border)", borderTop: "none",
                }}>
                  {items.map((macro, idx) => (
                    <div key={macro.id} style={{
                      padding: "12px 16px",
                      borderTop: idx > 0 ? "1px solid var(--app-border-light)" : "none",
                    }}>
                      {editingId === macro.id ? (
                        /* 수정 모드 */
                        <div>
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <input
                              value={editForm.name}
                              onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                              style={{
                                flex: 1, padding: "6px 10px", borderRadius: 6,
                                border: "1px solid #1AA3FF", fontSize: 14, outline: "none",
                              }}
                            />
                            <select
                              value={editForm.category}
                              onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))}
                              style={{
                                padding: "6px 10px", borderRadius: 6,
                                border: "1px solid var(--app-border)", fontSize: 13,
                                outline: "none", backgroundColor: "var(--app-surface)",
                              }}
                            >
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <textarea
                            value={editForm.content}
                            onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))}
                            rows={5}
                            style={{
                              width: "100%", padding: "6px 10px", borderRadius: 6,
                              border: "1px solid #1AA3FF", fontSize: 13, outline: "none",
                              resize: "vertical", lineHeight: 1.5, boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
                            <button
                              onClick={cancelEdit}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "5px 12px", borderRadius: 6, border: "1px solid var(--app-border)",
                                backgroundColor: "var(--app-surface)", fontSize: 13, cursor: "pointer", color: "var(--app-text-secondary)",
                              }}
                            ><X style={{ width: 14, height: 14 }} /> 취소</button>
                            <button
                              onClick={saveEdit}
                              style={{
                                display: "flex", alignItems: "center", gap: 4,
                                padding: "5px 12px", borderRadius: 6, border: "none",
                                backgroundColor: "var(--app-accent)", color: "var(--app-btn-primary-text)", fontSize: 13,
                                fontWeight: 600, cursor: "pointer",
                              }}
                            ><Check style={{ width: 14, height: 14 }} /> 저장</button>
                          </div>
                        </div>
                      ) : (
                        /* 보기 모드 */
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--app-text-primary)", marginBottom: 4 }}>
                              {macro.name}
                            </div>
                            <div style={{
                              fontSize: 13, color: "var(--app-text-secondary)", lineHeight: 1.5,
                              whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden",
                            }}>
                              {macro.content}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            <button
                              onClick={() => startEdit(macro)}
                              style={{
                                padding: "6px 8px", borderRadius: 6, border: "1px solid var(--app-border)",
                                backgroundColor: "var(--app-surface)", cursor: "pointer",
                              }}
                              title="수정"
                            >
                              <Pencil style={{ width: 14, height: 14, color: "var(--app-text-secondary)" }} />
                            </button>
                            <button
                              onClick={() => setAuditMacroId(macro.id)}
                              style={{
                                padding: "6px 8px", borderRadius: 6, border: "1px solid var(--app-border)",
                                backgroundColor: "var(--app-surface)", cursor: "pointer",
                              }}
                              title="수정 이력"
                            >
                              <History style={{ width: 14, height: 14, color: "#7C3AED" }} />
                            </button>
                            <button
                              onClick={() => deleteMacro(macro.id, macro.name)}
                              style={{
                                padding: "6px 8px", borderRadius: 6, border: "1px solid var(--app-border)",
                                backgroundColor: "var(--app-surface)", cursor: "pointer",
                              }}
                              title="삭제"
                            >
                              <Trash2 style={{ width: 14, height: 14, color: "#E8344E" }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 이력 조회 패널 */}
      {auditMacroId && (
        <AuditLogPanel
          entityType="macro"
          entityId={String(auditMacroId)}
          isOpen={!!auditMacroId}
          onClose={() => setAuditMacroId(null)}
          title="템플릿 수정 이력"
        />
      )}
    </div>
  );
}
