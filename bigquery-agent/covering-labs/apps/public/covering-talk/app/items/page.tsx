"use client";

import { useEffect, useState } from "react";
import { Search, Package, Truck, MapPin, Plus, Pencil, Trash2, X, Check, History } from "lucide-react";
import { toast } from "sonner";
import { getCached, setCache, CACHE_KEYS } from "@/lib/cache/prefetch";
import AuditLogPanel from "@/components/AuditLogPanel";

interface Product {
  id?: number;
  category: string;
  name: string;
  display_name?: string;
  displayName?: string;
  item_group?: string;
  aliases?: string[];
  width: number;
  depth: number;
  height: number;
  volume: number;
  unit_price?: number;
  unitPrice?: number;
  weight: number;
}

interface LadderFee {
  type: string;
  under_1h?: number;
  under1h?: number;
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
  h7: number;
}

interface RegionPrice {
  region: string;
  price_1?: number;
  price_2?: number;
  price_3?: number;
  price1?: number;
  price2?: number;
  price3?: number;
}

type TabType = "products" | "ladder" | "regions";

const emptyProduct = {
  category: "", name: "", item_group: "", aliases_text: "",
  width: 0, depth: 0, height: 0, volume: 0, unit_price: 0, weight: 0,
};

export default function ItemsPage() {
  const [tab, setTab] = useState<TabType>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [itemGroups, setItemGroups] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [ladderFees, setLadderFees] = useState<LadderFee[]>([]);
  const [regionPrices, setRegionPrices] = useState<RegionPrice[]>([]);
  const [loading, setLoading] = useState(() => {
    // 프리페치된 캐시가 있으면 즉시 로딩 완료
    const cached = getCached<{ products: Product[]; categories: string[] }>(CACHE_KEYS.PRODUCTS);
    return !cached;
  });

  // 캐시에서 초기값 로드
  useEffect(() => {
    const cached = getCached<{ products: Product[]; categories: string[] }>(CACHE_KEYS.PRODUCTS);
    if (cached) {
      setProducts(cached.products ?? []);
      setCategories(cached.categories ?? [...new Set((cached.products ?? []).map((p: Product) => p.category))]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 모달 상태
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [modalForm, setModalForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 이력 조회
  const [auditProductId, setAuditProductId] = useState<number | null>(null);

  useEffect(() => {
    if (tab === "products") loadProducts();
    else if (tab === "ladder") loadLadderFees();
    else if (tab === "regions") loadRegionPrices();
  }, [tab]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products/list");
      const data = await res.json();
      setProducts(data.products ?? []);
      setCategories(data.categories ?? [...new Set((data.products ?? []).map((p: Product) => p.category))]);
      setItemGroups(data.itemGroups ?? []);
      setCache(CACHE_KEYS.PRODUCTS, data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadLadderFees = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ladder-fees");
      const data = await res.json();
      setLadderFees(data.fees ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const loadRegionPrices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/region-prices");
      const data = await res.json();
      setRegionPrices(data.prices ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const filteredProducts = products.filter((p) => {
    const matchCategory = selectedCategory === "전체" || p.category === selectedCategory || p.item_group === selectedCategory;
    const matchSearch = !searchQuery ||
      p.category.includes(searchQuery) ||
      p.name.includes(searchQuery) ||
      (p.display_name ?? p.displayName ?? "").includes(searchQuery) ||
      (p.item_group ?? "").includes(searchQuery) ||
      (p.aliases ?? []).some((a) => a.includes(searchQuery));
    return matchCategory && matchSearch;
  });

  const formatPrice = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

  const openAddModal = () => {
    setModalMode("add");
    setModalForm(emptyProduct);
    setEditingId(null);
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    setModalMode("edit");
    setModalForm({
      category: p.category,
      name: p.name,
      item_group: p.item_group ?? "",
      aliases_text: (p.aliases ?? []).join(", "),
      width: p.width,
      depth: p.depth,
      height: p.height,
      volume: p.volume,
      unit_price: p.unit_price ?? p.unitPrice ?? 0,
      weight: p.weight,
    });
    setEditingId(p.id ?? null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!modalForm.category || !modalForm.name) {
      toast.error("카테고리와 품목명은 필수입니다.");
      return;
    }
    setIsSaving(true);
    const payload = {
      ...modalForm,
      item_group: modalForm.item_group || modalForm.category,
      aliases: modalForm.aliases_text
        ? modalForm.aliases_text.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [],
    };
    // aliases_text는 서버에 보내지 않음
    delete (payload as Record<string, unknown>).aliases_text;
    try {
      if (modalMode === "add") {
        const res = await fetch("/api/products/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        toast.success("품목이 추가되었습니다.");
      } else {
        const res = await fetch("/api/products/list", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        if (!res.ok) throw new Error();
        toast.success("품목이 수정되었습니다.");
      }
      setShowModal(false);
      loadProducts();
    } catch {
      toast.error("저장에 실패했습니다.");
    }
    setIsSaving(false);
  };

  const handleDelete = async (p: Product) => {
    if (!p.id) return;
    if (!confirm(`"${p.category} - ${p.name}" 품목을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch("/api/products/list", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      if (!res.ok) throw new Error();
      toast.success("품목이 삭제되었습니다.");
      loadProducts();
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      {/* 헤더 */}
      <div style={{
        padding: "20px 32px 0", backgroundColor: "var(--app-surface)",
        borderBottom: "1px solid var(--app-border)",
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--app-text-primary)", margin: "0 0 16px" }}>
          품목 관리
        </h1>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 0 }}>
          {([
            { key: "products" as TabType, label: "품목단가", icon: Package },
            { key: "ladder" as TabType, label: "사다리차 요금", icon: Truck },
            { key: "regions" as TabType, label: "지역별 단가", icon: MapPin },
          ]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 20px", fontSize: 14,
                fontWeight: tab === key ? 600 : 400,
                color: tab === key ? "#1AA3FF" : "var(--app-text-tertiary)",
                borderBottom: tab === key ? "2px solid var(--app-tag-blue-text)" : "2px solid transparent",
                background: "none", border: "none",
                borderTop: "none", borderLeft: "none", borderRight: "none",
                cursor: "pointer",
              }}
            >
              <Icon style={{ width: 16, height: 16 }} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 32px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--app-text-tertiary)" }}>
            데이터 로딩 중...
          </div>
        ) : tab === "products" ? (
          <div>
            {/* 검색 + 카테고리 필터 + 추가 버튼 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 16, height: 16, color: "var(--app-text-placeholder)",
                }} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="품목 검색..."
                  style={{
                    width: "100%", height: 40, paddingLeft: 38, paddingRight: 12,
                    fontSize: 14, backgroundColor: "var(--app-surface)", borderRadius: 8,
                    border: "1px solid var(--app-border)", outline: "none", color: "var(--app-text-primary)",
                  }}
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  height: 40, padding: "0 12px", fontSize: 14,
                  backgroundColor: "var(--app-surface)", borderRadius: 8,
                  border: "1px solid var(--app-border)", outline: "none",
                  color: "var(--app-text-primary)", cursor: "pointer", minWidth: 120,
                }}
              >
                <option value="전체">전체 ({products.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({products.filter((p) => p.category === cat).length})
                  </option>
                ))}
              </select>
              <button
                onClick={openAddModal}
                style={{
                  height: 40, padding: "0 16px",
                  display: "flex", alignItems: "center", gap: 6,
                  backgroundColor: "var(--app-btn-primary-bg)", color: "var(--app-btn-primary-text)",
                  borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                <Plus style={{ width: 16, height: 16 }} />
                품목 추가
              </button>
            </div>

            <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 8 }}>
              {filteredProducts.length}개 품목
            </div>

            {/* 테이블 */}
            <div style={{
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--app-bg)" }}>
                    <th style={thStyle}>카테고리</th>
                    <th style={thStyle}>품목그룹</th>
                    <th style={thStyle}>품목명</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>가로(cm)</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>세로(cm)</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>높이(cm)</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>부피(m³)</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>무게(kg)</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>단가</th>
                    <th style={{ ...thStyle, textAlign: "center", width: 80 }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => (
                    <tr
                      key={i}
                      style={{ borderTop: "1px solid var(--app-border-light)", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface)"; }}
                    >
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px",
                          backgroundColor: "var(--app-tag-blue-bg)", color: "var(--app-tag-blue-text)",
                          borderRadius: 4, fontSize: 12, fontWeight: 500,
                        }}>
                          {p.category}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {p.item_group && p.item_group !== p.category ? (
                          <span style={{
                            display: "inline-block", padding: "2px 8px",
                            backgroundColor: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)",
                            borderRadius: 4, fontSize: 12, fontWeight: 500,
                          }}>
                            {p.item_group}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--app-text-placeholder)" }}>-</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: "var(--app-text-primary)" }}>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        {p.aliases && p.aliases.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                            {p.aliases.map((alias, ai) => (
                              <span key={ai} style={{
                                display: "inline-block", padding: "1px 6px",
                                backgroundColor: "var(--app-tag-green-bg)", color: "var(--app-tag-green-text)",
                                borderRadius: 3, fontSize: 10, fontWeight: 500,
                                border: "1px solid var(--app-tag-green-text)",
                              }}>
                                {alias}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-text-secondary)" }}>{p.width}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-text-secondary)" }}>{p.depth}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-text-secondary)" }}>{p.height}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-text-primary)", fontWeight: 500 }}>{p.volume}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-text-secondary)" }}>{p.weight}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-tag-blue-text)", fontWeight: 600 }}>
                        {formatPrice(p.unit_price ?? p.unitPrice ?? 0)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(p); }}
                            style={{
                              background: "none", border: "none", cursor: "pointer", padding: 4,
                              borderRadius: 4,
                            }}
                            title="수정"
                          >
                            <Pencil style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (p.id) setAuditProductId(p.id); }}
                            style={{
                              background: "none", border: "none", cursor: "pointer", padding: 4,
                              borderRadius: 4,
                            }}
                            title="수정 이력"
                          >
                            <History style={{ width: 14, height: 14, color: "var(--app-tag-purple-text)" }} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                            style={{
                              background: "none", border: "none", cursor: "pointer", padding: 4,
                              borderRadius: 4,
                            }}
                            title="삭제"
                          >
                            <Trash2 style={{ width: 14, height: 14, color: "var(--app-btn-danger-text)" }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === "ladder" ? (
          <div>
            <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 12 }}>
              사다리차 시간별 요금표
            </div>
            <div style={{
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--app-bg)" }}>
                    <th style={thStyle}>구분</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>기본(1h미만)</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>1시간</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>2시간</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>3시간</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>4시간</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>5시간</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>6시간</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>7시간</th>
                  </tr>
                </thead>
                <tbody>
                  {ladderFees.map((f, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--app-border-light)" }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: "var(--app-text-primary)" }}>{f.type}</td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-tag-blue-text)", fontWeight: 500 }}>
                        {formatPrice(f.under_1h ?? f.under1h ?? 0)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h1)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h2)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h3)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h4)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h5)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h6)}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{formatPrice(f.h7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 12 }}>
              지역별 인원수에 따른 단가 ({regionPrices.length}개 지역)
            </div>
            <div style={{
              backgroundColor: "var(--app-surface)", borderRadius: 12,
              border: "1px solid var(--app-border)", overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--app-bg)" }}>
                    <th style={thStyle}>지역</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>1명</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>2명</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>3명</th>
                  </tr>
                </thead>
                <tbody>
                  {regionPrices.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--app-border-light)" }}>
                      <td style={{ ...tdStyle, fontWeight: 500, color: "var(--app-text-primary)" }}>{r.region}</td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {formatPrice(r.price_1 ?? r.price1 ?? 0)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        {formatPrice(r.price_2 ?? r.price2 ?? 0)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "var(--app-tag-blue-text)", fontWeight: 500 }}>
                        {formatPrice(r.price_3 ?? r.price3 ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 품목 추가/수정 모달 */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--app-modal-bg)", borderRadius: 16,
              padding: "28px 32px", width: 480,
              boxShadow: "var(--app-shadow-lg)",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 20,
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
                {modalMode === "add" ? "품목 추가" : "품목 수정"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <X style={{ width: 20, height: 20, color: "var(--app-text-placeholder)" }} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ModalField label="카테고리" value={modalForm.category} onChange={(v) => setModalForm({ ...modalForm, category: v })} />
              <ModalField label="품목명" value={modalForm.name} onChange={(v) => setModalForm({ ...modalForm, name: v })} />
              <ModalField label="품목그룹" value={modalForm.item_group} onChange={(v) => setModalForm({ ...modalForm, item_group: v })} placeholder="고객이 말하는 이름 (예: 냉장고)" />
              <ModalField label="동의어 (쉼표 구분)" value={modalForm.aliases_text} onChange={(v) => setModalForm({ ...modalForm, aliases_text: v })} placeholder="통돌이, 일반세탁기" />
              <ModalField label="가로 (cm)" type="number" value={modalForm.width} onChange={(v) => setModalForm({ ...modalForm, width: Number(v) })} />
              <ModalField label="세로 (cm)" type="number" value={modalForm.depth} onChange={(v) => setModalForm({ ...modalForm, depth: Number(v) })} />
              <ModalField label="높이 (cm)" type="number" value={modalForm.height} onChange={(v) => setModalForm({ ...modalForm, height: Number(v) })} />
              <ModalField label="부피 (m³)" type="number" step="0.01" value={modalForm.volume} onChange={(v) => setModalForm({ ...modalForm, volume: Number(v) })} />
              <ModalField label="단가 (원)" type="number" value={modalForm.unit_price} onChange={(v) => setModalForm({ ...modalForm, unit_price: Number(v) })} />
              <ModalField label="무게 (kg)" type="number" value={modalForm.weight} onChange={(v) => setModalForm({ ...modalForm, weight: Number(v) })} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, height: 42,
                  backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                  borderRadius: 8, border: "none", fontSize: 14, fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                style={{
                  flex: 1, height: 42,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  backgroundColor: "var(--app-btn-primary-bg)", color: "var(--app-btn-primary-text)",
                  borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600,
                  cursor: isSaving ? "default" : "pointer",
                  opacity: isSaving ? 0.6 : 1,
                }}
              >
                <Check style={{ width: 16, height: 16 }} />
                {isSaving ? "저장 중..." : modalMode === "add" ? "추가" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이력 조회 패널 */}
      {auditProductId && (
        <AuditLogPanel
          entityType="product"
          entityId={String(auditProductId)}
          isOpen={!!auditProductId}
          onClose={() => setAuditProductId(null)}
          title="품목 수정 이력"
        />
      )}
    </div>
  );
}

function ModalField({ label, value, onChange, type = "text", step, placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; step?: string; placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--app-text-secondary)" }}>{label}</span>
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 38, padding: "0 12px", fontSize: 14,
          border: "1px solid var(--app-border)", borderRadius: 8,
          outline: "none", color: "var(--app-text-primary)",
        }}
      />
    </label>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--app-text-tertiary)",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  color: "var(--app-text-primary)",
  whiteSpace: "nowrap",
};
