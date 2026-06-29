"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Quote, QuoteItem, ExtraFee, ProductSuggestion } from "@/lib/store/conversations";
import { formatPrice } from "@/lib/utils/format";
import { toast } from "sonner";
import { Trash2, Save, Search, X, Package, DatabaseBackup, Bot, Check, Pencil, MapPin, ChevronDown, ChevronUp, Plus, Minus } from "lucide-react";
import { getRegionPrices, getAllRegions, calcVat, ceilTo1000 } from "@/lib/utils/trip-fee";

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮"];
const BADGE_COLORS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981",
  "#6366F1", "#EF4444", "#14B8A6", "#F97316", "#06B6D4",
  "#84CC16", "#A855F7", "#E11D48", "#0EA5E9", "#D946EF",
];

interface Product {
  id?: number;
  category: string;
  name: string;
  display_name: string;
  width: number;
  depth: number;
  height: number;
  volume: number;
  unit_price: number;
  weight: number;
}

interface Props {
  sessionId: string;
  quote: Quote | null;
  district: string | null;
  onDistrictChange?: (district: string) => void;
  onRefresh: () => void;
}

export function QuoteEditor({ sessionId, quote, district, onDistrictChange, onRefresh }: Props) {
  const [items, setItems] = useState<QuoteItem[]>(quote?.items ?? []);
  const [ladderFee, setLadderFee] = useState(quote?.ladderFee ?? 0);
  const [tripFee, setTripFee] = useState(quote?.tripFee ?? 0);
  const [workerCount, setWorkerCount] = useState(quote?.workerCount ?? 1);
  const [extraFees, setExtraFees] = useState<ExtraFee[]>(quote?.extraFees ?? []);
  const [isSaving, startSave] = useTransition();

  // 지역별 출장비 데이터
  const regionPrices = getRegionPrices(district);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [regionSearch, setRegionSearch] = useState("");

  // 사다리차 요금표
  interface LadderFeeRow { type: string; under1h: number; h1: number; h2: number; h3: number; h4: number; h5: number; h6: number; h7: number }
  const [ladderFees, setLadderFees] = useState<LadderFeeRow[]>([]);
  const [showLadderPicker, setShowLadderPicker] = useState(false);

  useEffect(() => {
    fetch("/api/ladder-fees")
      .then(r => r.json())
      .then(d => {
        const raw = d.fees ?? [];
        // DB (under_1h) / 로컬 JSON (under1h) 양쪽 호환
        const normalized: LadderFeeRow[] = raw.map((r: Record<string, unknown>) => ({
          type: r.type as string,
          under1h: (r.under1h ?? r.under_1h ?? 0) as number,
          h1: (r.h1 ?? 0) as number,
          h2: (r.h2 ?? 0) as number,
          h3: (r.h3 ?? 0) as number,
          h4: (r.h4 ?? 0) as number,
          h5: (r.h5 ?? 0) as number,
          h6: (r.h6 ?? 0) as number,
          h7: (r.h7 ?? 0) as number,
        }));
        setLadderFees(normalized);
      })
      .catch(() => {});
  }, []);

  // 미등록 품목 DB 등록
  const [registeringIndex, setRegisteringIndex] = useState<number | null>(null);
  const [regForm, setRegForm] = useState({ category: "", name: "", width: 0, depth: 0, height: 0, volume: 0, unit_price: 0, weight: 0 });

  // 품목 수정 모달
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ category: "", name: "", item_group: "", aliases: "", width: 0, depth: 0, height: 0, volume: 0, unit_price: 0, weight: 0 });
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditSaving, setIsEditSaving] = useState(false);

  // 품목 검색
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchDone, setSearchDone] = useState(false); // DB 검색 완료 여부
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // AI 품목 제안
  const [aiLookupLoading, setAiLookupLoading] = useState(false);
  const [aiSuggestionModal, setAiSuggestionModal] = useState<{
    keyword: string;
    suggestion: ProductSuggestion;
  } | null>(null);
  const [aiRegForm, setAiRegForm] = useState({
    category: "", name: "", item_group: "", aliases: "",
    width: 0, depth: 0, height: 0, volume: 0, unit_price: 0, weight: 0,
  });
  const [aiRegSaving, setAiRegSaving] = useState(false);

  // 변형 태그 (siblings)
  interface SiblingProduct { id: number; name: string; category: string; unitPrice: number; volume: number; weight: number; displayName: string; }
  const [siblingsCache, setSiblingsCache] = useState<Record<number, SiblingProduct[]>>({});
  const [expandedSiblings, setExpandedSiblings] = useState<Set<number>>(new Set());
  const [loadingSiblings, setLoadingSiblings] = useState<Set<number>>(new Set());

  const toggleSiblings = async (index: number, productId?: number) => {
    if (expandedSiblings.has(index)) {
      setExpandedSiblings((prev) => { const n = new Set(prev); n.delete(index); return n; });
      return;
    }
    // 열기
    setExpandedSiblings((prev) => new Set(prev).add(index));
    if (!productId || siblingsCache[productId]) return;
    // fetch siblings
    setLoadingSiblings((prev) => new Set(prev).add(index));
    try {
      const res = await fetch(`/api/products/siblings?id=${productId}`);
      const data = await res.json();
      setSiblingsCache((prev) => ({ ...prev, [productId]: data.siblings ?? [] }));
    } catch { /* ignore */ }
    setLoadingSiblings((prev) => { const n = new Set(prev); n.delete(index); return n; });
  };

  const swapToSibling = (index: number, sibling: SiblingProduct) => {
    const oldItem = items[index];
    const newItems = items.map((it, i) => i === index ? {
      ...it,
      name: `${sibling.category} - ${sibling.name}`,
      category: sibling.category,
      unitPrice: sibling.unitPrice,
      volumeM3: sibling.volume,
      note: `${sibling.displayName}`,
      productId: sibling.id,
    } : it);
    setItems(newItems);
    setExpandedSiblings((prev) => { const n = new Set(prev); n.delete(index); return n; });
    // 기존 제품을 siblingsCache에서 교체: 새 제품 빼고 기존 제품 넣기
    if (oldItem.productId && sibling.id) {
      setSiblingsCache((prev) => {
        const oldSiblings = prev[oldItem.productId!] ?? [];
        const newSiblings = [
          { id: oldItem.productId!, name: oldItem.name.replace(/^.+?\s*-\s*/, ""), category: oldItem.category, unitPrice: oldItem.unitPrice, volume: oldItem.volumeM3, weight: 0, displayName: oldItem.note || "" },
          ...oldSiblings.filter(s => s.id !== sibling.id && s.id !== oldItem.productId),
        ].sort((a, b) => a.unitPrice - b.unitPrice);
        const updated = { ...prev };
        delete updated[oldItem.productId!];
        updated[sibling.id] = newSiblings;
        return updated;
      });
    }
    // 자동 저장
    saveQuoteToServer(newItems, ladderFee);
  };

  // quote 변경 시 동기화
  useEffect(() => {
    setItems(quote?.items ?? []);
    setLadderFee(quote?.ladderFee ?? 0);
    setTripFee(quote?.tripFee ?? 0);
    setWorkerCount(quote?.workerCount ?? 1);
    setExtraFees(quote?.extraFees ?? []);
  }, [quote]);

  // 견적 서버 저장 (삭제 등 즉시 반영용)
  const saveQuoteToServer = async (
    updatedItems: QuoteItem[],
    updatedLadderFee: number,
    updatedTripFee?: number,
    updatedWorkerCount?: number,
    updatedExtraFees?: ExtraFee[]
  ) => {
    const itemsPrice = updatedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const vol = updatedItems.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0);
    const tf = updatedTripFee ?? tripFee;
    const wc = updatedWorkerCount ?? workerCount;
    const ef = updatedExtraFees ?? extraFees;
    const efTotal = ef.reduce((sum, f) => sum + f.amount, 0);
    const subtotal = itemsPrice + updatedLadderFee + tf + efTotal;
    const vat = calcVat(subtotal);
    const updatedQuote: Quote = {
      items: updatedItems,
      subtotalVolume: vol,
      basePrice: itemsPrice,
      ladderFee: updatedLadderFee,
      tripFee: tf,
      workerCount: wc,
      extraFees: ef,
      vatAmount: vat,
      totalPrice: ceilTo1000(subtotal + vat),
      createdAt: quote?.createdAt ?? Date.now(),
      sentAt: quote?.sentAt ?? null,
      editLog: quote?.editLog ?? [],
    };
    try {
      await fetch(`/api/conversations/${sessionId}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: updatedQuote }),
      });
      onRefresh();
    } catch {
      // 자동 저장 실패는 무시 (수동 저장으로 복구 가능)
    }
  };

  // 바깥 클릭 시 검색 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 품목 검색 (디바운스)
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setSearchDone(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.products ?? []);
        }
      } catch {
        // ignore
      }
      setIsSearching(false);
      setSearchDone(true);
    }, 300);
  };

  // AI 품목 제안 요청
  const handleAiLookup = async () => {
    const keyword = searchQuery.trim();
    if (!keyword) return;
    setAiLookupLoading(true);
    try {
      const res = await fetch("/api/products/ai-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      if (!res.ok) {
        toast.error("AI 제안을 가져오지 못했습니다.");
        return;
      }
      const { suggestion } = await res.json();
      setAiSuggestionModal({ keyword, suggestion });
      setAiRegForm({
        category: suggestion.category || "",
        name: suggestion.name || "",
        item_group: suggestion.item_group || "",
        aliases: (suggestion.aliases || []).join(", "),
        width: suggestion.width || 0,
        depth: suggestion.depth || 0,
        height: suggestion.height || 0,
        volume: suggestion.volume || 0,
        unit_price: suggestion.unit_price || 0,
        weight: suggestion.weight || 0,
      });
      setShowSearch(false);
    } catch {
      toast.error("AI 제안 요청 실패");
    } finally {
      setAiLookupLoading(false);
    }
  };

  // AI 제안 처리: "quote" = 견적만 추가, "db" = DB만 등록, "both" = DB등록 + 견적추가
  const handleAiAction = async (mode: "quote" | "db" | "both") => {
    setAiRegSaving(true);
    try {
      const f = aiRegForm;

      // 견적만 추가 (DB 등록 안 함)
      if (mode === "quote") {
        const newItem: QuoteItem = {
          name: `${f.item_group || f.category} - ${f.name}`,
          category: f.item_group || f.category,
          quantity: 1,
          volumeM3: f.volume,
          unitPrice: f.unit_price,
          note: `${f.width}x${f.depth}x${f.height}cm ${f.weight}kg`,
        };
        const updatedItems = [...items, newItem];
        setItems(updatedItems);
        saveQuoteToServer(updatedItems, ladderFee);
        setAiSuggestionModal(null);
        setSearchQuery(""); setSearchResults([]);
        toast.success(`"${f.item_group || f.category} - ${f.name}" 견적에 추가`);
        return;
      }

      // DB 등록
      const res = await fetch("/api/products/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: f.category, name: f.name, item_group: f.item_group,
          aliases: f.aliases.split(",").map(a => a.trim()).filter(Boolean),
          width: f.width, depth: f.depth, height: f.height,
          volume: f.volume, unit_price: f.unit_price, weight: f.weight,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const p = data.product;

      if (mode === "both") {
        const newItem: QuoteItem = {
          name: `${p.item_group ?? p.category} - ${p.name}`,
          category: p.item_group ?? p.category,
          quantity: 1, volumeM3: p.volume, unitPrice: p.unit_price,
          note: `${p.width}x${p.depth}x${p.height}cm ${p.weight}kg`,
          productId: p.id,
        };
        const updatedItems = [...items, newItem];
        setItems(updatedItems);
        saveQuoteToServer(updatedItems, ladderFee);
        toast.success(`"${p.item_group} - ${p.name}" DB 등록 + 견적 추가 완료`);
      } else {
        toast.success(`"${p.item_group} - ${p.name}" DB에 등록 완료`);
      }
      setAiSuggestionModal(null);
      setSearchQuery(""); setSearchResults([]);
    } catch {
      toast.error("처리 실패");
    } finally {
      setAiRegSaving(false);
    }
  };

  const addProduct = (product: Product) => {
    const existing = items.find(
      (item) => item.name === product.name && item.category === product.category
    );
    let updatedItems: QuoteItem[];
    if (existing) {
      updatedItems = items.map((item) =>
        item.name === product.name && item.category === product.category
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      updatedItems = [
        ...items,
        {
          name: `${product.category} - ${product.name}`,
          category: product.category,
          quantity: 1,
          volumeM3: product.volume,
          unitPrice: product.unit_price,
          note: `${product.width}x${product.depth}x${product.height}cm ${product.weight}kg`,
          productId: product.id,
        },
      ];
    }
    setItems(updatedItems);
    saveQuoteToServer(updatedItems, ladderFee);
    setSearchQuery("");
    setSearchResults([]);
    setShowSearch(false);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    // 삭제 즉시 서버 저장 → 템플릿 자동 반영
    saveQuoteToServer(newItems, ladderFee);
  };

  const updateItem = (index: number, field: keyof QuoteItem, value: number | string) => {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const totalItemsPrice = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalVolume = items.reduce((sum, item) => sum + item.volumeM3 * item.quantity, 0);
  const totalExtraFees = extraFees.reduce((sum, f) => sum + f.amount, 0);
  const subtotal = totalItemsPrice + ladderFee + tripFee + totalExtraFees;
  const vatAmount = calcVat(subtotal);
  const totalPrice = ceilTo1000(subtotal + vatAmount);

  const handleSave = () => {
    startSave(async () => {
      try {
        const updatedQuote: Quote = {
          items,
          subtotalVolume: totalVolume,
          basePrice: totalItemsPrice,
          ladderFee,
          tripFee,
          workerCount,
          extraFees,
          vatAmount,
          totalPrice,
          createdAt: quote?.createdAt ?? Date.now(),
          sentAt: quote?.sentAt ?? null,
          editLog: quote?.editLog ?? [],
        };

        const res = await fetch(`/api/conversations/${sessionId}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quote: updatedQuote }),
        });
        if (!res.ok) throw new Error();
        toast.success("견적이 저장되었습니다.");
        onRefresh();
      } catch {
        toast.error("견적 저장에 실패했습니다.");
      }
    });
  };

  return (
    <div>
      {/* 품목 검색 추가 */}
      <div ref={searchRef} style={{ position: "relative", marginBottom: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          backgroundColor: "var(--app-bg)", borderRadius: 8,
          padding: "8px 10px", border: "1px solid var(--app-border)",
        }}>
          <Search style={{ width: 14, height: 14, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(e) => { handleSearch(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="품목 검색 (예: 장롱, 침대, 냉장고...)"
            style={{
              flex: 1, fontSize: 14, color: "var(--app-text-primary)",
              border: "none", outline: "none", backgroundColor: "transparent",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(""); setSearchResults([]); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <X style={{ width: 14, height: 14, color: "var(--app-text-placeholder)" }} />
            </button>
          )}
        </div>

        {/* 검색 결과 드롭다운 */}
        {showSearch && (searchResults.length > 0 || isSearching || (searchDone && searchResults.length === 0 && searchQuery.trim())) && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            backgroundColor: "var(--app-surface)", borderRadius: 8,
            border: "1px solid var(--app-border)", boxShadow: "var(--app-shadow-lg)",
            maxHeight: 280, overflowY: "auto", zIndex: 100, marginTop: 4,
          }}>
            {isSearching ? (
              <div style={{ padding: "12px", fontSize: 14, color: "var(--app-text-tertiary)", textAlign: "center" }}>
                검색 중...
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map((product, i) => (
                <button
                  key={i}
                  onClick={() => addProduct(product)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "10px 12px",
                    border: "none", borderBottom: i < searchResults.length - 1 ? "1px solid var(--app-border-light)" : "none",
                    backgroundColor: "var(--app-surface)", cursor: "pointer",
                    textAlign: "left", fontSize: 13,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-surface)"; }}
                >
                  <Package style={{ width: 14, height: 14, color: "var(--app-text-tertiary)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--app-text-primary)", fontWeight: 500, marginBottom: 2 }}>
                      {product.category} - {product.name}
                    </div>
                    <div style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>
                      {product.width}x{product.depth}x{product.height}cm · {product.volume}m³ · {product.weight}kg
                    </div>
                  </div>
                  <span style={{ color: "var(--app-tag-blue-text)", fontWeight: 600, flexShrink: 0 }}>
                    {formatPrice(product.unit_price)}
                  </span>
                </button>
              ))
            ) : (
              /* DB 검색 결과 없음 → AI 제안 버튼 */
              <div style={{ padding: "14px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "var(--app-text-tertiary)", marginBottom: 10 }}>
                  &quot;{searchQuery}&quot; 검색 결과가 없습니다
                </div>
                <button
                  onClick={handleAiLookup}
                  disabled={aiLookupLoading}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 8,
                    backgroundColor: aiLookupLoading ? "var(--app-border)" : "var(--app-tag-blue-bg)",
                    color: aiLookupLoading ? "var(--app-text-tertiary)" : "var(--app-accent)",
                    border: `1px solid ${aiLookupLoading ? "var(--app-border)" : "var(--app-accent)"}`,
                    fontSize: 14, fontWeight: 600, cursor: aiLookupLoading ? "not-allowed" : "pointer",
                  }}
                >
                  <Bot style={{ width: 14, height: 14 }} />
                  {aiLookupLoading ? "AI 검색 중..." : "AI 제안 받기"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 품목 목록 */}
      {items.length === 0 ? (
        <div style={{
          padding: "20px 0", textAlign: "center", fontSize: 14, color: "var(--app-text-tertiary)",
        }}>
          품목을 검색하여 추가하세요
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, i) => (
            <div key={i} style={{
              padding: "10px 12px",
              backgroundColor: item.confidence === "low" ? "#FFF8F0" : item.confidence === "medium" ? "#FFFDF5" : "var(--app-bg)",
              border: item.confidence === "low" ? "1px solid #FFB74D" : item.confidence === "medium" ? "1px solid #FFD54F" : undefined,
              borderRadius: 8, fontSize: 13,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ color: "var(--app-text-primary)", fontWeight: 500, fontSize: 14, flex: 1 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 18, height: 18, borderRadius: "50%", fontSize: 11, fontWeight: 700,
                    color: "#fff", backgroundColor: BADGE_COLORS[i % BADGE_COLORS.length],
                    marginRight: 6, verticalAlign: "middle", lineHeight: 1,
                  }}>
                    {i + 1}
                  </span>
                  {item.name}
                  {item.sourceKeyword && item.sourceKeyword !== item.name.replace(/^.+?\s*-\s*/, "") && (
                    <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginLeft: 6 }}>
                      {"\u2190"} &quot;{item.sourceKeyword}&quot;
                    </span>
                  )}
                  {item.sizeUnconfirmed && (
                    <span style={{ color: "var(--app-btn-danger-text)", fontSize: 12, fontWeight: 600, marginLeft: 6 }}>
                      *사이즈 확인필요
                    </span>
                  )}
                  {item.confidence === "low" && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 2,
                      marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      backgroundColor: "#FFF3E0", border: "1px solid #FFB74D",
                      fontSize: 11, fontWeight: 600, color: "#E65100",
                    }}>
                      [low] 리스트에 없음. 부피·가격 추정
                    </span>
                  )}
                  {item.confidence === "medium" && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 2,
                      marginLeft: 6, padding: "1px 6px", borderRadius: 4,
                      backgroundColor: "#FFF8E1", border: "1px solid #FFD54F",
                      fontSize: 11, fontWeight: 600, color: "#F57F17",
                    }}>
                      [medium] 유사매칭
                    </span>
                  )}
                </span>
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    onClick={async () => {
                      const parts = item.note?.match(/^(\d+)x(\d+)x(\d+)cm\s+(\d+(?:\.\d+)?)kg$/);
                      let itemGroup = item.category || "";
                      let aliases = "";
                      // DB에 등록된 품목이면 item_group, aliases 조회
                      if (item.productId) {
                        try {
                          const res = await fetch(`/api/products/search?id=${item.productId}`);
                          if (res.ok) {
                            const data = await res.json();
                            const p = data.products?.[0];
                            if (p) {
                              itemGroup = p.item_group ?? item.category ?? "";
                              aliases = Array.isArray(p.aliases) ? p.aliases.join(", ") : "";
                            }
                          }
                        } catch { /* ignore */ }
                      }
                      setEditingIndex(i);
                      setEditForm({
                        category: item.category || "",
                        name: item.name.replace(/^.+?\s*-\s*/, ""),
                        item_group: itemGroup,
                        aliases,
                        width: parts ? Number(parts[1]) : 0,
                        depth: parts ? Number(parts[2]) : 0,
                        height: parts ? Number(parts[3]) : 0,
                        volume: item.volumeM3,
                        unit_price: item.unitPrice,
                        weight: parts ? Number(parts[4]) : 0,
                      });
                      setShowEditModal(true);
                    }}
                    title="품목 수정"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                  >
                    <Pencil style={{ width: 13, height: 13, color: "var(--app-tag-blue-text)" }} />
                  </button>
                  <button
                    onClick={() => removeItem(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                  >
                    <Trash2 style={{ width: 13, height: 13, color: "var(--app-btn-danger-text)" }} />
                  </button>
                </div>
              </div>

              {/* 부피/무게 정보 */}
              {item.note && (
                <div style={{ color: "var(--app-text-tertiary)", fontSize: 12, marginBottom: 6 }}>
                  {item.note} · 부피: {item.volumeM3}m³
                </div>
              )}

              {/* AI 추천 스펙 카드 (미등록 + aiSuggestion 있음) */}
              {item.aiSuggestion && registeringIndex !== i && (
                <AiSuggestionCard
                  suggestion={item.aiSuggestion}
                  itemIndex={i}
                  onRegisterDirect={async () => {
                    const s = item.aiSuggestion!;
                    try {
                      const res = await fetch("/api/products/list", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          category: s.category,
                          name: s.name,
                          item_group: s.item_group,
                          width: s.width,
                          depth: s.depth,
                          height: s.height,
                          volume: s.volume,
                          unit_price: s.unit_price,
                          weight: s.weight,
                          aliases: s.aliases,
                        }),
                      });
                      if (!res.ok) throw new Error();
                      const data = await res.json();
                      const p = data.product;
                      const updatedItems = items.map((it, idx) => idx === i ? {
                        ...it,
                        name: `${p.item_group ?? p.category} - ${p.name}`,
                        category: p.item_group ?? p.category,
                        volumeM3: p.volume,
                        unitPrice: p.unit_price,
                        note: `${p.width}x${p.depth}x${p.height}cm ${p.weight}kg`,
                        aiSuggestion: undefined,
                        productId: p.id,
                      } : it);
                      setItems(updatedItems);
                      saveQuoteToServer(updatedItems, ladderFee);
                      toast.success("AI 추천 스펙으로 DB에 등록되었습니다.");
                    } catch {
                      toast.error("품목 등록에 실패했습니다.");
                    }
                  }}
                  onEditRegister={() => {
                    const s = item.aiSuggestion!;
                    setRegisteringIndex(i);
                    setRegForm({
                      category: s.category,
                      name: s.name,
                      width: s.width,
                      depth: s.depth,
                      height: s.height,
                      volume: s.volume,
                      unit_price: s.unit_price,
                      weight: s.weight,
                    });
                  }}
                  onDismiss={() => {
                    setItems(items.map((it, idx) => idx === i ? {
                      ...it,
                      aiSuggestion: undefined,
                      note: "DB 미등록 품목 - 가격 확인 필요",
                    } : it));
                  }}
                />
              )}

              {/* 미등록 품목 → DB 등록 (AI 추천 없는 경우) */}
              {item.note?.includes("미등록") && !item.aiSuggestion && registeringIndex !== i && (
                <button
                  onClick={() => {
                    setRegisteringIndex(i);
                    setRegForm({
                      category: item.category || "기타",
                      name: item.name.replace(/^기타\s*-\s*/, ""),
                      width: 0, depth: 0, height: 0, volume: 0,
                      unit_price: item.unitPrice || 0,
                      weight: 0,
                    });
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "4px 8px", marginBottom: 6,
                    backgroundColor: "var(--app-tag-orange-bg)", color: "var(--app-tag-orange-text)",
                    borderRadius: 4, border: "1px solid #FFCC80",
                    fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}
                >
                  <DatabaseBackup style={{ width: 12, height: 12 }} />
                  DB에 품목 등록
                </button>
              )}

              {/* 미등록 품목 등록 폼 */}
              {registeringIndex === i && (
                <div style={{
                  padding: 8, marginBottom: 6,
                  backgroundColor: "var(--app-tag-yellow-bg)", borderRadius: 6,
                  border: "1px solid #FFF59D", fontSize: 12,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--app-tag-yellow-text)" }}>품목 DB 등록</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <label style={regLabelStyle}>
                      카테고리
                      <input value={regForm.category} onChange={(e) => setRegForm({ ...regForm, category: e.target.value })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      품목명
                      <input value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      가로(cm)
                      <input type="number" value={regForm.width} onChange={(e) => setRegForm({ ...regForm, width: Number(e.target.value) })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      세로(cm)
                      <input type="number" value={regForm.depth} onChange={(e) => setRegForm({ ...regForm, depth: Number(e.target.value) })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      높이(cm)
                      <input type="number" value={regForm.height} onChange={(e) => setRegForm({ ...regForm, height: Number(e.target.value) })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      부피(m³)
                      <input type="number" step="0.01" value={regForm.volume} onChange={(e) => setRegForm({ ...regForm, volume: Number(e.target.value) })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      단가(원)
                      <input type="number" value={regForm.unit_price} onChange={(e) => setRegForm({ ...regForm, unit_price: Number(e.target.value) })} style={regInputStyle} />
                    </label>
                    <label style={regLabelStyle}>
                      무게(kg)
                      <input type="number" value={regForm.weight} onChange={(e) => setRegForm({ ...regForm, weight: Number(e.target.value) })} style={regInputStyle} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/products/list", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(regForm),
                          });
                          if (!res.ok) throw new Error();
                          const data = await res.json();
                          const p = data.product;
                          const updatedItems = items.map((it, idx) => idx === i ? {
                            ...it,
                            name: `${p.item_group ?? p.category} - ${p.name}`,
                            category: p.item_group ?? p.category,
                            volumeM3: p.volume,
                            unitPrice: p.unit_price,
                            note: `${p.width}x${p.depth}x${p.height}cm ${p.weight}kg`,
                            aiSuggestion: undefined,
                            productId: p.id,
                          } : it);
                          setItems(updatedItems);
                          saveQuoteToServer(updatedItems, ladderFee);
                          setRegisteringIndex(null);
                          toast.success("품목이 DB에 등록되었습니다.");
                        } catch {
                          toast.error("품목 등록에 실패했습니다.");
                        }
                      }}
                      style={{
                        flex: 1, padding: "5px 0",
                        backgroundColor: "var(--app-btn-primary-bg)", color: "var(--app-btn-primary-text)",
                        border: "none", borderRadius: 4, fontSize: 12,
                        fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      등록
                    </button>
                    <button
                      onClick={() => setRegisteringIndex(null)}
                      style={{
                        padding: "5px 12px",
                        backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-tertiary)",
                        border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer",
                      }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* 수량 */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: "var(--app-text-tertiary)" }}>수량</span>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                      width: 44, fontSize: 13, padding: "3px 6px",
                      border: "1px solid var(--app-border)", borderRadius: 4,
                      outline: "none", textAlign: "center", color: "var(--app-text-primary)",
                    }}
                  />
                </div>

                {/* 단가 */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: "var(--app-text-tertiary)" }}>단가</span>
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", Math.max(0, parseInt(e.target.value) || 0))}
                    style={{
                      width: 72, fontSize: 13, padding: "3px 6px",
                      border: "1px solid var(--app-border)", borderRadius: 4,
                      outline: "none", textAlign: "right", color: "var(--app-text-primary)",
                    }}
                  />
                </div>

                {/* 소계 */}
                <span style={{ color: "var(--app-tag-blue-text)", fontWeight: 600, marginLeft: "auto" }}>
                  {formatPrice(item.unitPrice * item.quantity)}
                </span>
              </div>

              {/* 변형 태그 토글 */}
              {item.productId && (
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => toggleSiblings(i, item.productId)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                      border: "none", cursor: "pointer",
                      backgroundColor: expandedSiblings.has(i) ? "var(--app-tag-blue-bg)" : "var(--app-surface-secondary)",
                      color: expandedSiblings.has(i) ? "var(--app-accent)" : "var(--app-text-tertiary)",
                    }}
                  >
                    <span style={{ fontSize: 9, transition: "transform 0.15s", transform: expandedSiblings.has(i) ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    {loadingSiblings.has(i) ? "로딩..." : "변형"}
                  </button>
                  {expandedSiblings.has(i) && item.productId && siblingsCache[item.productId] && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                      {siblingsCache[item.productId].length === 0 ? (
                        <span style={{ fontSize: 11, color: "var(--app-text-placeholder)" }}>다른 변형이 없습니다</span>
                      ) : (
                        siblingsCache[item.productId].map((s) => (
                          <button
                            key={s.id}
                            onClick={() => swapToSibling(i, s)}
                            style={{
                              padding: "2px 7px", borderRadius: 10, fontSize: 11, fontWeight: 500,
                              border: "1px solid #D8E0E8", backgroundColor: "var(--app-bg)",
                              color: "var(--app-text-primary)", cursor: "pointer", whiteSpace: "nowrap",
                              transition: "all 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-tag-blue-bg)"; e.currentTarget.style.borderColor = "var(--app-accent)"; e.currentTarget.style.color = "var(--app-accent)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-bg)"; e.currentTarget.style.borderColor = "var(--app-border)"; e.currentTarget.style.color = "var(--app-text-primary)"; }}
                          >
                            {s.name} ₩{s.unitPrice.toLocaleString()}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* 사다리차 요금 */}
          <div style={{
            padding: "10px 12px", backgroundColor: "var(--app-tag-orange-bg)",
            borderRadius: 8, fontSize: 13,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "var(--app-text-primary)", fontWeight: 500 }}>사다리차 요금</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontWeight: 600, color: ladderFee > 0 ? "var(--app-tag-orange-text)" : "var(--app-text-tertiary)" }}>
                  {ladderFee > 0 ? formatPrice(ladderFee) : "미선택"}
                </span>
                <button
                  onClick={() => setShowLadderPicker(!showLadderPicker)}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    padding: 2, display: "flex", alignItems: "center",
                  }}
                >
                  {showLadderPicker
                    ? <ChevronUp style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
                    : <ChevronDown style={{ width: 14, height: 14, color: "var(--app-text-tertiary)" }} />
                  }
                </button>
              </div>
            </div>

            {showLadderPicker && ladderFees.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {ladderFees.map((row) => (
                  <div key={row.type} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3 }}>{row.type}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {[
                        { label: "기본", price: row.under1h },
                        { label: "1h", price: row.h1 },
                        { label: "2h", price: row.h2 },
                        { label: "3h", price: row.h3 },
                        { label: "4h", price: row.h4 },
                        { label: "5h", price: row.h5 },
                        { label: "6h", price: row.h6 },
                        { label: "7h", price: row.h7 },
                      ].map(({ label, price }) => {
                        const isActive = ladderFee === price;
                        return (
                          <button
                            key={`${row.type}-${label}`}
                            onClick={() => {
                              setLadderFee(isActive ? 0 : price);
                              setShowLadderPicker(false);
                            }}
                            style={{
                              padding: "3px 6px", borderRadius: 4,
                              border: isActive ? "1px solid #E8890C" : "1px solid #E8EBED",
                              backgroundColor: isActive ? "var(--app-tag-orange-bg)" : "var(--app-surface)",
                              color: isActive ? "var(--app-tag-orange-text)" : "var(--app-text-primary)",
                              fontSize: 11, cursor: "pointer", fontWeight: isActive ? 600 : 400,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {label} {formatPrice(price)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {ladderFee > 0 && (
                  <button
                    onClick={() => { setLadderFee(0); setShowLadderPicker(false); }}
                    style={{
                      width: "100%", padding: "4px 0", marginTop: 2,
                      border: "1px solid var(--app-border)", borderRadius: 4,
                      backgroundColor: "var(--app-surface)", color: "var(--app-text-tertiary)",
                      fontSize: 11, cursor: "pointer",
                    }}
                  >
                    사다리차 없음 (제거)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 출장비 */}
          <div style={{
            padding: "10px 12px", backgroundColor: "var(--app-info-box-bg)",
            borderRadius: 8, fontSize: 13,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: regionPrices ? 6 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin style={{ width: 13, height: 13, color: "var(--app-tag-blue-text)" }} />
                <span style={{ color: "var(--app-text-primary)", fontWeight: 500 }}>
                  출장비{district ? ` (${district})` : ""}
                </span>
                <Pencil
                  onClick={() => setShowRegionPicker(true)}
                  style={{ width: 12, height: 12, color: "var(--app-text-placeholder)", cursor: "pointer", marginLeft: 2 }}
                />
              </div>
              <input
                type="number"
                value={tripFee}
                onChange={(e) => setTripFee(Math.max(0, parseInt(e.target.value) || 0))}
                style={{
                  width: 90, fontSize: 13, padding: "3px 6px",
                  border: "1px solid var(--app-border)", borderRadius: 4,
                  outline: "none", textAlign: "right", color: "var(--app-text-primary)",
                }}
              />
            </div>
            {regionPrices && (
              <div style={{ display: "flex", gap: 4 }}>
                {[1, 2, 3].map((count) => {
                  const price = count === 1 ? regionPrices.price1 : count === 2 ? regionPrices.price2 : regionPrices.price3;
                  const isActive = workerCount === count;
                  const isBase = count === 1;
                  return (
                    <button
                      key={count}
                      onClick={() => {
                        setWorkerCount(count);
                        setTripFee(price);
                      }}
                      style={{
                        flex: 1, padding: "4px 0",
                        backgroundColor: isBase
                          ? (isActive ? "var(--app-accent)" : "var(--app-accent)")
                          : (isActive ? "var(--app-accent)" : "var(--app-tag-blue-bg)"),
                        color: isBase
                          ? "var(--app-surface)"
                          : (isActive ? "var(--app-surface)" : "var(--app-text-primary)"),
                        border: "none", borderRadius: 4,
                        fontSize: 12, cursor: isBase ? "default" : "pointer",
                        fontWeight: isActive ? 600 : 400,
                        opacity: isBase && !isActive ? 0.6 : 1,
                      }}
                    >
                      {count}명 {formatPrice(price)}{isBase ? " (기본)" : ""}
                    </button>
                  );
                })}
              </div>
            )}
            {!district && (
              <div
                onClick={() => setShowRegionPicker(true)}
                style={{ fontSize: 11, color: "var(--app-accent)", marginTop: 4, cursor: "pointer", fontWeight: 500 }}
              >
                지역 미설정 — 클릭하여 지역 선택
              </div>
            )}
          </div>

          {/* 추가요금 */}
          <div style={{ marginTop: 6 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 0",
            }}>
              <span style={{ color: "var(--app-text-primary)", fontWeight: 500, fontSize: 14 }}>추가요금</span>
              <span style={{ fontWeight: 600, color: totalExtraFees > 0 ? "var(--app-tag-orange-text)" : "var(--app-text-tertiary)", fontSize: 14 }}>
                {totalExtraFees > 0 ? `+${formatPrice(totalExtraFees)}` : "없음"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {[10000, 50000, 100000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => {
                    const newFee: ExtraFee = {
                      type: "추가요금",
                      description: `추가요금 +${formatPrice(amount)}`,
                      amount,
                    };
                    const updated = [...extraFees, newFee];
                    setExtraFees(updated);
                    saveQuoteToServer(items, ladderFee, undefined, undefined, updated);
                  }}
                  style={{
                    padding: "4px 10px", borderRadius: 6,
                    border: "1px solid var(--app-border)", backgroundColor: "var(--app-bg)",
                    fontSize: 12, color: "var(--app-text-primary)", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                >
                  <Plus style={{ width: 10, height: 10 }} />
                  {formatPrice(amount)}
                </button>
              ))}
            </div>
            {extraFees.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {extraFees.map((fee, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "3px 0", fontSize: 12, color: "var(--app-text-secondary)",
                    }}
                  >
                    <span>{fee.description || `추가요금 ${i + 1}`}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--app-tag-orange-text)", fontWeight: 500 }}>+{formatPrice(fee.amount)}</span>
                      <button
                        onClick={() => {
                          const updated = extraFees.filter((_, idx) => idx !== i);
                          setExtraFees(updated);
                          saveQuoteToServer(items, ladderFee, undefined, undefined, updated);
                        }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          padding: 2, display: "flex", alignItems: "center",
                        }}
                      >
                        <X style={{ width: 12, height: 12, color: "var(--app-text-placeholder)" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 합계 */}
          <div style={{
            borderTop: "1px solid var(--app-border)", marginTop: 4, paddingTop: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
              <span>총 부피</span>
              <span>{totalVolume.toFixed(2)}m³</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
              <span>품목 합계</span>
              <span>{formatPrice(totalItemsPrice)}</span>
            </div>
            {ladderFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
                <span>사다리차</span>
                <span>+{formatPrice(ladderFee)}</span>
              </div>
            )}
            {tripFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
                <span>출장비</span>
                <span>+{formatPrice(tripFee)}</span>
              </div>
            )}
            {totalExtraFees > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
                <span>추가요금</span>
                <span>+{formatPrice(totalExtraFees)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--app-text-tertiary)", marginBottom: 4 }}>
              <span>부가세 (10%)</span>
              <span>+{formatPrice(vatAmount)}</span>
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 16, fontWeight: 700, color: "var(--app-text-primary)", marginTop: 4,
            }}>
              <span>총 견적</span>
              <span style={{ color: "var(--app-tag-blue-text)" }}>{formatPrice(totalPrice)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 저장 + 초기화 버튼 */}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={async () => {
            if (!confirm("견적을 초기화하시겠습니까? 품목과 금액이 모두 삭제됩니다.")) return;
            setItems([]);
            setExtraFees([]);
            setLadderFee(0);
            saveQuoteToServer([], 0);
            toast.success("견적이 초기화되었습니다.");
          }}
          style={{
            height: 38, padding: "0 14px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            backgroundColor: "var(--app-surface)", color: "var(--app-btn-danger-text)",
            borderRadius: 8, border: "1px solid #FFCDD2", fontSize: 13, fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <Trash2 style={{ width: 13, height: 13 }} />
          초기화
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            flex: 1, height: 38,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            backgroundColor: "var(--app-btn-primary-bg)", color: "var(--app-btn-primary-text)",
            borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600,
            cursor: isSaving ? "default" : "pointer",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          <Save style={{ width: 14, height: 14 }} />
          {isSaving ? "저장 중..." : "견적 저장"}
        </button>
      </div>

      {/* 지역 선택 모달 */}
      {showRegionPicker && (
        <div
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => { setShowRegionPicker(false); setRegionSearch(""); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 340, maxHeight: "70vh", backgroundColor: "var(--app-surface)",
              borderRadius: 12, boxShadow: "var(--app-shadow-lg)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--app-border)" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)", marginBottom: 8 }}>
                지역 선택
              </div>
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 8, top: 7, width: 14, height: 14, color: "var(--app-text-placeholder)" }} />
                <input
                  value={regionSearch}
                  onChange={(e) => setRegionSearch(e.target.value)}
                  placeholder="지역 검색 (예: 강남, 수원...)"
                  autoFocus
                  style={{
                    width: "100%", padding: "6px 8px 6px 28px", fontSize: 13,
                    border: "1px solid var(--app-border)", borderRadius: 6,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {(() => {
                const allRegions = getAllRegions();
                const filtered = regionSearch.trim()
                  ? allRegions.filter(r => r.region.includes(regionSearch.trim()))
                  : allRegions;
                return filtered.map((r) => (
                  <button
                    key={r.region}
                    onClick={() => {
                      if (onDistrictChange) {
                        onDistrictChange(r.region);
                      }
                      setTripFee(r.price1);
                      setWorkerCount(1);
                      setShowRegionPicker(false);
                      setRegionSearch("");
                    }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", marginBottom: 2, borderRadius: 6, border: "none",
                      backgroundColor: r.region === district ? "#E3F2FD" : "transparent",
                      cursor: "pointer", fontSize: 13, textAlign: "left",
                    }}
                  >
                    <span style={{
                      fontWeight: r.region === district ? 700 : 400,
                      color: r.region === district ? "#1565C0" : "var(--app-text-primary)",
                    }}>
                      {r.region}
                      {r.region === district && " ✓"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
                      {r.price1.toLocaleString()} / {r.price2.toLocaleString()} / {r.price3.toLocaleString()}
                    </span>
                  </button>
                ));
              })()}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--app-border)", textAlign: "right" }}>
              <button
                onClick={() => { setShowRegionPicker(false); setRegionSearch(""); }}
                style={{
                  padding: "6px 16px", fontSize: 13, fontWeight: 500,
                  border: "1px solid var(--app-border)", borderRadius: 6,
                  backgroundColor: "var(--app-surface)", cursor: "pointer",
                }}
              >닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 품목 수정 모달 */}
      {showEditModal && editingIndex !== null && (
        <div
          style={{
            position: "fixed", inset: 0,
            backgroundColor: "var(--app-modal-backdrop)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => { setShowEditModal(false); setEditingIndex(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "var(--app-surface)", borderRadius: 16,
              padding: "24px 28px", width: 420,
              boxShadow: "var(--app-shadow-lg)",
            }}
          >
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 16,
            }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)", margin: 0 }}>
                품목 수정
              </h2>
              <button
                onClick={() => { setShowEditModal(false); setEditingIndex(null); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
              >
                <X style={{ width: 18, height: 18, color: "var(--app-text-placeholder)" }} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <EditModalField label="카테고리" value={editForm.category} onChange={(v) => setEditForm({ ...editForm, category: v })} />
              <EditModalField label="품목명" value={editForm.item_group} onChange={(v) => setEditForm({ ...editForm, item_group: v })} />
              <EditModalField label="사양" value={editForm.name} onChange={(v) => setEditForm({ ...editForm, name: v })} />
              <EditModalField label="동의어 (쉼표 구분)" value={editForm.aliases} onChange={(v) => setEditForm({ ...editForm, aliases: v })} />
              <EditModalField label="가로 (cm)" type="number" value={editForm.width} onChange={(v) => setEditForm({ ...editForm, width: Number(v) })} />
              <EditModalField label="세로 (cm)" type="number" value={editForm.depth} onChange={(v) => setEditForm({ ...editForm, depth: Number(v) })} />
              <EditModalField label="높이 (cm)" type="number" value={editForm.height} onChange={(v) => setEditForm({ ...editForm, height: Number(v) })} />
              <EditModalField label="부피 (m³)" type="number" step="0.01" value={editForm.volume} onChange={(v) => setEditForm({ ...editForm, volume: Number(v) })} />
              <EditModalField label="단가 (원)" type="number" value={editForm.unit_price} onChange={(v) => setEditForm({ ...editForm, unit_price: Number(v) })} />
              <EditModalField label="무게 (kg)" type="number" value={editForm.weight} onChange={(v) => setEditForm({ ...editForm, weight: Number(v) })} />
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button
                onClick={() => { setShowEditModal(false); setEditingIndex(null); }}
                style={{
                  flex: 1, height: 40,
                  backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-primary)",
                  borderRadius: 8, border: "none", fontSize: 14, fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={async () => {
                  setIsEditSaving(true);
                  try {
                    const item = items[editingIndex!];
                    const aliasesArray = editForm.aliases
                      ? editForm.aliases.split(",").map((s) => s.trim()).filter(Boolean)
                      : [];
                    if (item.productId) {
                      // DB에 등록된 품목 → DB도 업데이트
                      const res = await fetch("/api/products/list", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: item.productId,
                          category: editForm.category,
                          name: editForm.name,
                          item_group: editForm.item_group || editForm.category,
                          aliases: aliasesArray,
                          width: editForm.width,
                          depth: editForm.depth,
                          height: editForm.height,
                          volume: editForm.volume,
                          unit_price: editForm.unit_price,
                          weight: editForm.weight,
                        }),
                      });
                      if (!res.ok) throw new Error();
                      const data = await res.json();
                      const p = data.product;
                      const newItems = items.map((it, idx) => idx === editingIndex ? {
                        ...it,
                        name: `${p.item_group ?? p.category} - ${p.name}`,
                        category: p.item_group ?? p.category,
                        volumeM3: p.volume,
                        unitPrice: p.unit_price,
                        note: `${p.width}x${p.depth}x${p.height}cm ${p.weight}kg`,
                      } : it);
                      setItems(newItems);
                      saveQuoteToServer(newItems, ladderFee);
                    } else {
                      // DB 미등록 품목 → 견적 내에서만 업데이트
                      const newItems = items.map((it, idx) => idx === editingIndex ? {
                        ...it,
                        name: `${editForm.category} - ${editForm.name}`,
                        category: editForm.category,
                        volumeM3: editForm.volume,
                        unitPrice: editForm.unit_price,
                        note: `${editForm.width}x${editForm.depth}x${editForm.height}cm ${editForm.weight}kg`,
                      } : it);
                      setItems(newItems);
                      saveQuoteToServer(newItems, ladderFee);
                    }
                    setShowEditModal(false);
                    setEditingIndex(null);
                    toast.success("품목이 수정되었습니다.");
                  } catch {
                    toast.error("품목 수정에 실패했습니다.");
                  } finally {
                    setIsEditSaving(false);
                  }
                }}
                disabled={isEditSaving}
                style={{
                  flex: 1, height: 40,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  backgroundColor: "var(--app-btn-primary-bg)", color: "var(--app-btn-primary-text)",
                  borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600,
                  cursor: isEditSaving ? "default" : "pointer",
                  opacity: isEditSaving ? 0.6 : 1,
                }}
              >
                <Check style={{ width: 14, height: 14 }} />
                {isEditSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 품목 제안 모달 */}
      {aiSuggestionModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "var(--app-modal-backdrop)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 9999,
        }} onClick={() => setAiSuggestionModal(null)}>
          <div style={{
            backgroundColor: "var(--app-surface)", borderRadius: 16, width: 420, maxHeight: "80vh",
            overflowY: "auto", padding: 24,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bot style={{ width: 18, height: 18, color: "var(--app-tag-purple-text)" }} />
                <span style={{ fontSize: 17, fontWeight: 700, color: "var(--app-text-primary)" }}>AI 품목 제안</span>
              </div>
              <button onClick={() => setAiSuggestionModal(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X style={{ width: 18, height: 18, color: "var(--app-text-tertiary)" }} />
              </button>
            </div>

            {/* 신뢰도 표시 */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 16,
              padding: "8px 12px", borderRadius: 8,
              backgroundColor: aiSuggestionModal.suggestion.confidence === "high" ? "var(--app-tag-green-bg)"
                : aiSuggestionModal.suggestion.confidence === "medium" ? "var(--app-tag-yellow-bg)" : "var(--app-btn-danger-bg)",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color:
                aiSuggestionModal.suggestion.confidence === "high" ? "var(--app-tag-green-text)"
                : aiSuggestionModal.suggestion.confidence === "medium" ? "var(--app-tag-yellow-text)" : "var(--app-btn-danger-text)"
              }}>
                신뢰도: {{ high: "높음 (공식 스펙)", medium: "보통 (유사 제품 기반)", low: "낮음 (AI 추정)" }[aiSuggestionModal.suggestion.confidence]}
              </span>
              <span style={{ fontSize: 12, color: "var(--app-text-tertiary)", marginLeft: "auto" }}>
                {aiSuggestionModal.suggestion.source === "web_search" ? "웹 검색" : "AI 추정"}
              </span>
            </div>

            {/* 수정 가능한 폼 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>카테고리</label>
                <input value={aiRegForm.category} onChange={(e) => setAiRegForm({ ...aiRegForm, category: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>품목명</label>
                <input value={aiRegForm.name} onChange={(e) => setAiRegForm({ ...aiRegForm, name: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>품목그룹 (고객 호칭)</label>
                <input value={aiRegForm.item_group} onChange={(e) => setAiRegForm({ ...aiRegForm, item_group: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>동의어 (쉼표 구분)</label>
                <input value={aiRegForm.aliases} onChange={(e) => setAiRegForm({ ...aiRegForm, aliases: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>가로(cm)</label>
                <input type="number" value={aiRegForm.width} onChange={(e) => setAiRegForm({ ...aiRegForm, width: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>세로(cm)</label>
                <input type="number" value={aiRegForm.depth} onChange={(e) => setAiRegForm({ ...aiRegForm, depth: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>높이(cm)</label>
                <input type="number" value={aiRegForm.height} onChange={(e) => setAiRegForm({ ...aiRegForm, height: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>부피(m³)</label>
                <input type="number" step="0.01" value={aiRegForm.volume} onChange={(e) => setAiRegForm({ ...aiRegForm, volume: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>무게(kg)</label>
                <input type="number" value={aiRegForm.weight} onChange={(e) => setAiRegForm({ ...aiRegForm, weight: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-secondary)", display: "block", marginBottom: 4 }}>단가(원)</label>
                <input type="number" value={aiRegForm.unit_price} onChange={(e) => setAiRegForm({ ...aiRegForm, unit_price: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--app-border)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setAiSuggestionModal(null)}
                style={{
                  height: 42, borderRadius: 8, padding: "0 14px",
                  border: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
                  fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)", cursor: "pointer",
                }}
              >
                취소
              </button>
              <button
                onClick={() => handleAiAction("quote")}
                disabled={aiRegSaving || !aiRegForm.name}
                style={{
                  flex: 1, height: 42, borderRadius: 8,
                  border: "1px solid #B3DBFF", backgroundColor: "var(--app-info-box-bg)",
                  fontSize: 13, fontWeight: 600, color: "var(--app-tag-blue-text)",
                  cursor: aiRegSaving ? "not-allowed" : "pointer",
                  opacity: aiRegSaving ? 0.6 : 1,
                }}
              >
                견적만 추가
              </button>
              <button
                onClick={() => handleAiAction("db")}
                disabled={aiRegSaving || !aiRegForm.category || !aiRegForm.name}
                style={{
                  flex: 1, height: 42, borderRadius: 8,
                  border: "1px solid #C8E6C9", backgroundColor: "var(--app-tag-green-bg)",
                  fontSize: 13, fontWeight: 600, color: "var(--app-tag-green-text)",
                  cursor: aiRegSaving ? "not-allowed" : "pointer",
                  opacity: aiRegSaving ? 0.6 : 1,
                }}
              >
                DB만 등록
              </button>
              <button
                onClick={() => handleAiAction("both")}
                disabled={aiRegSaving || !aiRegForm.category || !aiRegForm.name}
                style={{
                  flex: 1, height: 42, borderRadius: 8,
                  border: "none", backgroundColor: aiRegSaving ? "var(--app-accent)" : "var(--app-accent)",
                  fontSize: 13, fontWeight: 600, color: "var(--app-surface)",
                  cursor: aiRegSaving ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                }}
              >
                <Check style={{ width: 13, height: 13 }} />
                {aiRegSaving ? "처리 중..." : "DB + 견적"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** AI 추천 스펙 카드 */
function AiSuggestionCard({
  suggestion,
  itemIndex,
  onRegisterDirect,
  onEditRegister,
  onDismiss,
}: {
  suggestion: ProductSuggestion;
  itemIndex: number;
  onRegisterDirect: () => void;
  onEditRegister: () => void;
  onDismiss: () => void;
}) {
  const [isRegistering, setIsRegistering] = useState(false);
  const confidenceLabel = { high: "높음", medium: "보통", low: "낮음" }[suggestion.confidence];
  const confidenceColor = { high: "var(--app-tag-green-text)", medium: "var(--app-tag-yellow-text)", low: "var(--app-btn-danger-text)" }[suggestion.confidence];
  const confidenceDots = { high: 3, medium: 2, low: 1 }[suggestion.confidence];

  return (
    <div style={{
      padding: 8, marginBottom: 6,
      backgroundColor: "var(--app-ai-spec-bg)", borderRadius: 6,
      border: "1px solid #B39DDB", fontSize: 12,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        fontWeight: 600, marginBottom: 6, color: "var(--app-ai-spec-text)",
      }}>
        <Bot style={{ width: 13, height: 13 }} />
        AI가 인터넷에서 찾은 스펙
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 6 }}>
        <div style={{ color: "var(--app-ai-spec-text)" }}>
          <span style={{ color: "var(--app-tag-purple-text)" }}>카테고리: </span>{suggestion.category}
        </div>
        <div style={{ color: "var(--app-ai-spec-text)" }}>
          <span style={{ color: "var(--app-tag-purple-text)" }}>품목그룹: </span>{suggestion.item_group}
        </div>
        <div style={{ color: "var(--app-ai-spec-text)" }}>
          <span style={{ color: "var(--app-tag-purple-text)" }}>크기: </span>
          {suggestion.width}x{suggestion.depth}x{suggestion.height}cm
        </div>
        <div style={{ color: "var(--app-ai-spec-text)" }}>
          <span style={{ color: "var(--app-tag-purple-text)" }}>무게: </span>{suggestion.weight}kg
        </div>
        <div style={{ color: "var(--app-ai-spec-text)" }}>
          <span style={{ color: "var(--app-tag-purple-text)" }}>부피: </span>{suggestion.volume}m³
        </div>
        <div style={{ color: "var(--app-ai-spec-text)" }}>
          <span style={{ color: "var(--app-tag-purple-text)" }}>단가: </span>{formatPrice(suggestion.unit_price)}
        </div>
      </div>

      {/* 신뢰도 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        marginBottom: 6, fontSize: 11,
      }}>
        <span style={{ color: "var(--app-tag-purple-text)" }}>신뢰도:</span>
        <span style={{ display: "flex", gap: 2 }}>
          {[1, 2, 3].map((dot) => (
            <span
              key={dot}
              style={{
                width: 6, height: 6, borderRadius: "50%",
                backgroundColor: dot <= confidenceDots ? confidenceColor : "var(--app-border)",
                display: "inline-block",
              }}
            />
          ))}
        </span>
        <span style={{ color: confidenceColor, fontWeight: 500 }}>{confidenceLabel}</span>
      </div>

      {/* 동의어 */}
      {suggestion.aliases.length > 0 && (
        <div style={{ fontSize: 11, color: "var(--app-tag-purple-text)", marginBottom: 6 }}>
          동의어: {suggestion.aliases.join(", ")}
        </div>
      )}

      {/* 버튼들 */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={async () => {
            setIsRegistering(true);
            await onRegisterDirect();
            setIsRegistering(false);
          }}
          disabled={isRegistering}
          style={{
            flex: 1, padding: "5px 0",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
            backgroundColor: "var(--app-ai-spec-text)", color: "var(--app-surface)",
            border: "none", borderRadius: 4, fontSize: 12,
            fontWeight: 600, cursor: isRegistering ? "default" : "pointer",
            opacity: isRegistering ? 0.6 : 1,
          }}
        >
          <Check style={{ width: 11, height: 11 }} />
          {isRegistering ? "등록 중..." : "이 스펙으로 DB 등록"}
        </button>
        <button
          onClick={onEditRegister}
          style={{
            padding: "5px 8px",
            display: "flex", alignItems: "center", gap: 3,
            backgroundColor: "var(--app-tag-purple-bg)", color: "var(--app-tag-purple-text)",
            border: "1px solid #CE93D8", borderRadius: 4,
            fontSize: 12, cursor: "pointer", fontWeight: 500,
          }}
        >
          <Pencil style={{ width: 11, height: 11 }} />
          수정
        </button>
        <button
          onClick={onDismiss}
          style={{
            padding: "5px 8px",
            backgroundColor: "var(--app-surface-secondary)", color: "var(--app-text-tertiary)",
            border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer",
          }}
        >
          무시
        </button>
      </div>
    </div>
  );
}

const regLabelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 2,
  color: "var(--app-text-secondary)", fontSize: 11, fontWeight: 500,
};

const regInputStyle: React.CSSProperties = {
  width: "100%", padding: "4px 6px", fontSize: 12,
  border: "1px solid var(--app-border)", borderRadius: 4,
  outline: "none", color: "var(--app-text-primary)",
};

/** 수정 모달 필드 */
function EditModalField({ label, value, onChange, type = "text", step, placeholder }: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; step?: string; placeholder?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "var(--app-text-primary)", fontWeight: 500 }}>
      {label}
      <input
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", fontSize: 14,
          border: "1px solid var(--app-border)", borderRadius: 6,
          outline: "none", color: "var(--app-text-primary)",
        }}
      />
    </label>
  );
}
