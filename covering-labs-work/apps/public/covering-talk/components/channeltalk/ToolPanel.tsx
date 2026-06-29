"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, Package, Loader2, X, Truck, Phone, Hash, ExternalLink, Calendar, Plus, CheckCircle, User, MapPin, Star, ShoppingBag, MessageSquare, ChevronDown, ChevronRight, GripHorizontal, ZoomIn, ZoomOut, Maximize2, FileText, Sparkles, Ban } from "lucide-react";
import { toast } from "sonner";
import type { CTChat } from "./types";

// ─── 공통 ───

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: "예약", color: "var(--app-text-secondary)" },
  1: { label: "수거배차", color: "#F59E0B" },
  2: { label: "수거완료", color: "#3B82F6" },
  3: { label: "입고완료", color: "#8B5CF6" },
  4: { label: "출고완료", color: "#6366F1" },
  5: { label: "배송완료", color: "#10B981" },
  6: { label: "반송완료", color: "#EF4444" },
  7: { label: "분실완료", color: "#DC2626" },
  8: { label: "배송대기", color: "#F97316" },
  12: { label: "배송연기", color: "#D97706" },
};

interface Delivery {
  bookId: string;
  status: number;
  receivedDate: string | null;
  pickupScheduledDate: string | null;
  pickedupDate: string | null;
  warehousedDate: string | null;
  deliveryAllocatedDate: string | null;
  releasedDate: string | null;
  deliveredDate: string | null;
  canceledAt: string | null;
  canceledReason: string | null;
  receiverName: string | null;
  receiverAddress: string | null;
  receiverAddressDetail: string | null;
  receiverMobile: string | null;
  senderName: string | null;
  senderAddress: string | null;
  orderIdFromCorp: string | null;
  deliveryRiderMobile: string | null;
  completedLocationInfo: string | null;
  checkPageUrl: string | null;
  deliveredPageUrl: string | null;
  notReceivedImageLocation: string | null;
  signImageLocation: string | null;
  delayedDeliveries: Array<{ reason: string; delayedDate: string }> | null;
  sentBackDate: string | null;
  sentBackReason: string | null;
  lostDate: string | null;
  lostReason: string | null;
  etc1: string | null;
  etc2: string | null;
  etc3: string | null;
}

// 배송로그 타임라인 생성
function buildDeliveryLog(d: Delivery): Array<{ label: string; date: string }> {
  const log: Array<{ label: string; date: string }> = [];
  if (d.receivedDate) log.push({ label: "접수", date: d.receivedDate });
  if (d.pickupScheduledDate) log.push({ label: "수거지정", date: d.pickupScheduledDate });
  if (d.pickedupDate) log.push({ label: "수거완료", date: d.pickedupDate });
  if (d.warehousedDate) log.push({ label: "입고완료", date: d.warehousedDate });
  if (d.deliveryAllocatedDate) log.push({ label: "배송배차", date: d.deliveryAllocatedDate });
  if (d.releasedDate) log.push({ label: "배송출발", date: d.releasedDate });
  if (d.deliveredDate) log.push({ label: "배송완료", date: d.deliveredDate });
  if (d.canceledAt) log.push({ label: "취소", date: d.canceledAt });
  if (d.sentBackDate) log.push({ label: "반송", date: d.sentBackDate });
  if (d.lostDate) log.push({ label: "분실", date: d.lostDate });
  return log;
}

export interface BackofficeSummary {
  name: string;
  userId: string;
  // AI 컨텍스트용 확장 필드
  grade?: string;
  isSubscriber?: boolean;
  subscriptionDate?: string;
  address?: string;
  totalOrders?: string;
  validOrders?: string;
  recentOrders?: Array<{ date: string; orderName: string; status: string; weight: string }>;
  activeOrders?: Array<{ orderId: string; orderName: string; status: string; pickupDate: string; address: string }>;
}

interface ToolPanelProps {
  selectedChat: CTChat | null;
  visible: boolean;
  onClose: () => void;
  onBackofficeLoaded?: (summary: BackofficeSummary | null) => void;
}

const formatDate = (d: string | null) => {
  if (!d) return "-";
  return d.replace("T", " ").slice(0, 16);
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  border: "1px solid var(--app-input-border)",
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
  backgroundColor: "var(--app-input-bg)",
  color: "var(--app-text-primary)",
};

// ─── 고객 정보 (조회 → 접수 전달용) ───

interface CustomerInfo {
  name: string;
  address: string;
  addressDetail: string;
}

// ─── 배송 조회 탭 ───

function DeliverySearchTab({ selectedChat, onCustomerFound }: { selectedChat: CTChat | null; onCustomerFound?: (info: CustomerInfo) => void }) {
  const [searchType, setSearchType] = useState<"bookId" | "phone">("phone");
  const [searchValue, setSearchValue] = useState("");
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const prevChatIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(async (type: "bookId" | "phone", value: string, d: number) => {
    if (!value.trim()) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const param = type === "bookId"
        ? `bookId=${value.trim()}`
        : `phone=${value.trim()}&days=${d}`;
      const res = await fetch(`/api/dhero/deliveries?${param}`, { signal: ctrl.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "조회 실패");
      const list: Delivery[] = data.deliveries ?? [];
      setDeliveries(list);
      // 검색 결과에서 최신 배송의 고객 정보 추출 → 접수탭 자동입력용
      if (list.length > 0 && onCustomerFound) {
        const latest = list[0];
        onCustomerFound({
          name: latest.receiverName || "",
          address: latest.receiverAddress || "",
          addressDetail: latest.receiverAddressDetail || "",
        });
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "조회 실패");
      setDeliveries([]);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(() => {
    doSearch(searchType, searchValue, days);
  }, [doSearch, searchType, searchValue, days]);

  // 채팅 전환 시 자동 검색 (Supabase + API 당일분 하이브리드 — 부하 없음)
  useEffect(() => {
    const chatId = selectedChat?.id ?? null;
    if (chatId === prevChatIdRef.current) return;
    prevChatIdRef.current = chatId;
    abortRef.current?.abort();
    setDeliveries([]);
    setSearched(false);
    setError(null);
    setLoading(false);
    if (selectedChat?.userPhone) {
      const phone = selectedChat.userPhone.replace(/^\+82/, "0");
      setSearchType("phone");
      setSearchValue(phone);
      doSearch("phone", phone, days);
    } else {
      setSearchValue("");
    }
  }, [selectedChat, days, doSearch]);

  return (
    <>
      {/* 검색 */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {(["phone", "bookId"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSearchType(t)}
              style={{
                flex: 1, padding: "6px 0", fontSize: 12,
                fontWeight: searchType === t ? 600 : 400,
                backgroundColor: searchType === t ? "#4F46E5" : "#F3F4F6",
                color: searchType === t ? "#fff" : "#6B7280",
                border: "none", borderRadius: 6, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              {t === "phone" ? <><Phone size={12} /> 전화번호</> : <><Hash size={12} /> 접수번호</>}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={searchType === "phone" ? "전화번호 입력" : "접수번호(bookId) 입력"}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !searchValue.trim()}
            style={{
              padding: "8px 12px", backgroundColor: "#4F46E5", color: "#fff",
              border: "none", borderRadius: 8, cursor: loading ? "wait" : "pointer",
              opacity: loading || !searchValue.trim() ? 0.5 : 1,
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
        </div>

        {searchType === "phone" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <Calendar size={12} color="#9CA3AF" />
            <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>조회 기간</span>
            <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
              {[3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{
                    padding: "3px 8px", fontSize: 11,
                    fontWeight: days === d ? 600 : 400,
                    backgroundColor: days === d ? "#4F46E5" : "#F3F4F6",
                    color: days === d ? "#fff" : "#6B7280",
                    border: "none", borderRadius: 4, cursor: "pointer",
                  }}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 결과 */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        {error && (
          <div style={{ padding: 12, backgroundColor: "#FEE2E2", color: "#B91C1C", borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {searched && !loading && deliveries.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13 }}>
            조회 결과가 없습니다
          </div>
        )}

        {!searched && (
          <div style={{ textAlign: "center", padding: 24, color: "var(--app-text-tertiary)", fontSize: 13 }}>
            <Truck size={32} color="#D1D5DB" style={{ margin: "0 auto 8px" }} />
            전화번호 또는 접수번호로<br />배송 현황을 조회하세요
          </div>
        )}

        {deliveries.map((d) => {
          const st = STATUS_MAP[d.status] ?? { label: `상태${d.status}`, color: "var(--app-text-secondary)" };
          return (
            <div key={d.bookId} style={{
              backgroundColor: "var(--app-surface)", borderRadius: 10, padding: 14,
              marginBottom: 10, border: "1px solid var(--app-border)", fontSize: 13, color: "var(--app-text-primary)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                  color: "#fff", backgroundColor: st.color,
                }}>
                  {st.label}
                </span>
                <span style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontFamily: "monospace" }}>{d.bookId}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: "4px 8px", lineHeight: 1.6 }}>
                <span style={{ color: "var(--app-text-tertiary)" }}>수하인</span>
                <span>{d.receiverName || "-"}</span>
                <span style={{ color: "var(--app-text-tertiary)" }}>연락처</span>
                <span>{d.receiverMobile || "-"}</span>
                <span style={{ color: "var(--app-text-tertiary)" }}>주소</span>
                <span style={{ wordBreak: "break-all" }}>
                  {d.receiverAddress || "-"}{d.receiverAddressDetail ? ` ${d.receiverAddressDetail}` : ""}
                </span>
                {d.orderIdFromCorp && (<><span style={{ color: "var(--app-text-tertiary)" }}>주문번호</span><span>{d.orderIdFromCorp}</span></>)}
                <span style={{ color: "var(--app-text-tertiary)" }}>접수일</span>
                <span>{formatDate(d.receivedDate)}</span>
                {d.pickedupDate && (<><span style={{ color: "var(--app-text-tertiary)" }}>수거일</span><span>{formatDate(d.pickedupDate)}</span></>)}
                {d.deliveredDate && (<><span style={{ color: "var(--app-text-tertiary)" }}>배송완료</span><span>{formatDate(d.deliveredDate)}</span></>)}
                {d.completedLocationInfo && (<><span style={{ color: "var(--app-text-tertiary)" }}>배송위치</span><span>{d.completedLocationInfo}</span></>)}
                {d.deliveryRiderMobile && (<><span style={{ color: "var(--app-text-tertiary)" }}>기사연락</span><span>{d.deliveryRiderMobile}</span></>)}
                {d.canceledAt && (<><span style={{ color: "#EF4444" }}>취소</span><span style={{ color: "#EF4444" }}>{formatDate(d.canceledAt)} {d.canceledReason || ""}</span></>)}
                {d.sentBackDate && (<><span style={{ color: "#F59E0B" }}>반송</span><span>{formatDate(d.sentBackDate)} {d.sentBackReason || ""}</span></>)}
                {d.delayedDeliveries && d.delayedDeliveries.length > 0 && (
                  <><span style={{ color: "#D97706" }}>배송지연</span><span>{d.delayedDeliveries.map((dd, i) => (<div key={i}>{dd.reason} ({formatDate(dd.delayedDate)})</div>))}</span></>
                )}
                {(d.etc1 || d.etc2 || d.etc3) && (
                  <><span style={{ color: "var(--app-text-tertiary)" }}>요청사항</span><span>{[d.etc1, d.etc2, d.etc3].filter(Boolean).join(" / ")}</span></>
                )}
              </div>

              {d.notReceivedImageLocation && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4 }}>미수취 촬영</div>
                  <a href={d.notReceivedImageLocation} target="_blank" rel="noopener noreferrer">
                    <img src={d.notReceivedImageLocation} alt="배송완료 사진" style={{
                      width: "100%", maxHeight: 200, objectFit: "cover",
                      borderRadius: 8, border: "1px solid var(--app-border)", cursor: "pointer",
                    }} />
                  </a>
                </div>
              )}
              {d.signImageLocation && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 4 }}>수취 서명</div>
                  <a href={d.signImageLocation} target="_blank" rel="noopener noreferrer">
                    <img src={d.signImageLocation} alt="수취 서명" style={{
                      width: "100%", maxHeight: 200, objectFit: "cover",
                      borderRadius: 8, border: "1px solid var(--app-border)", cursor: "pointer",
                    }} />
                  </a>
                </div>
              )}

              {/* 배송로그 타임라인 */}
              {(() => {
                const log = buildDeliveryLog(d);
                if (log.length <= 1) return null;
                return (
                  <div style={{ marginTop: 10, padding: "8px 10px", backgroundColor: "var(--app-surface-secondary)", borderRadius: 8, border: "1px solid var(--app-border-light)" }}>
                    <div style={{ fontSize: 11, color: "var(--app-text-secondary)", fontWeight: 600, marginBottom: 6 }}>배송로그</div>
                    {log.map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: 1.8 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                          backgroundColor: i === log.length - 1 ? "#4F46E5" : "#D1D5DB",
                        }} />
                        <span style={{ color: "var(--app-text-tertiary)", minWidth: 48 }}>{item.label}</span>
                        {i < log.length - 1 && <span style={{ color: "var(--app-text-tertiary)" }}>→</span>}
                        <span style={{ color: "var(--app-text-primary)" }}>{formatDate(item.date)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {(d.deliveredPageUrl || d.checkPageUrl) && (
                <a href={d.deliveredPageUrl || d.checkPageUrl || ""} target="_blank" rel="noopener noreferrer" style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  marginTop: 8, fontSize: 12, color: "#4F46E5", textDecoration: "none",
                }}>
                  <ExternalLink size={12} /> 배송완료 조회 페이지
                </a>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── 배송 접수 탭 ───

function DeliveryCreateTab({ selectedChat, customerInfo }: { selectedChat: CTChat | null; customerInfo: CustomerInfo | null }) {
  const [form, setForm] = useState({
    receiverName: "",
    receiverMobile: "",
    receiverAddress: "",
    receiverAddressDetail: "",
    itemType: "normal" as "normal" | "large",
    itemCount: 1,
    memoFromCustomer: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ bookId: string; addressNotSupported: boolean } | null>(null);

  // 세션 변경 시 전화번호 자동 입력
  const prevChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    const chatId = selectedChat?.id ?? null;
    if (chatId === prevChatIdRef.current) return;
    prevChatIdRef.current = chatId;
    setResult(null);
    if (selectedChat) {
      setForm((prev) => ({
        ...prev,
        receiverMobile: selectedChat.userPhone?.replace(/^\+82/, "0") || prev.receiverMobile,
        receiverName: "",
        receiverAddress: "",
        receiverAddressDetail: "",
      }));
    }
  }, [selectedChat]);

  // 배송 조회 결과에서 고객 정보 자동 입력
  useEffect(() => {
    if (!customerInfo) return;
    setForm((prev) => ({
      ...prev,
      receiverName: customerInfo.name || prev.receiverName,
      receiverAddress: customerInfo.address || prev.receiverAddress,
      receiverAddressDetail: customerInfo.addressDetail || prev.receiverAddressDetail,
    }));
  }, [customerInfo]);

  const updateField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.receiverName.trim() || !form.receiverMobile.trim() || !form.receiverAddress.trim()) {
      toast.error("수하인명, 연락처, 주소는 필수입니다");
      return;
    }
    setLoading(true);
    try {
      const productName = form.itemType === "large" ? "대형 커버링 봉투" : "커버링 봉투";
      const productCount = form.itemType === "large" ? 1 : form.itemCount;
      const { itemType, itemCount, ...rest } = form;
      const res = await fetch("/api/dhero/deliveries/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, productName, productCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "접수 실패");
      setResult({ bookId: data.bookId, addressNotSupported: data.addressNotSupported });
      toast.success(`배송 접수 완료: ${data.bookId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "접수 실패");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setForm({
      receiverName: selectedChat?.userName || "",
      receiverMobile: selectedChat?.userPhone?.replace(/^\+82/, "0") || "",
      receiverAddress: "",
      receiverAddressDetail: "",
      itemType: "normal",
      itemCount: 1,
      memoFromCustomer: "",
    });
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
      {result ? (
        <div style={{
          textAlign: "center", padding: 24, backgroundColor: "#F0FDF4",
          borderRadius: 12, border: "1px solid #BBF7D0",
        }}>
          <CheckCircle size={32} color="#22C55E" style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#166534", marginBottom: 4 }}>접수 완료</div>
          <div style={{ fontSize: 13, color: "#166534", marginBottom: 4 }}>
            접수번호: <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{result.bookId}</span>
          </div>
          {result.addressNotSupported && (
            <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>
              배송 불가 지역일 수 있습니다
            </div>
          )}
          <button
            onClick={handleReset}
            style={{
              marginTop: 12, padding: "8px 20px", fontSize: 13,
              backgroundColor: "#4F46E5", color: "#fff",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}
          >
            새 접수
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>
                수하인명 <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="text"
                value={form.receiverName}
                onChange={(e) => updateField("receiverName", e.target.value)}
                placeholder="수하인명"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>
                수하인 연락처 <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="text"
                value={form.receiverMobile}
                onChange={(e) => updateField("receiverMobile", e.target.value)}
                placeholder="01012345678"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>
                주소 <span style={{ color: "#EF4444" }}>*</span>
              </label>
              <input
                type="text"
                value={form.receiverAddress}
                onChange={(e) => updateField("receiverAddress", e.target.value)}
                placeholder="서울 강남구 역삼동 123"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>
                상세주소
              </label>
              <input
                type="text"
                value={form.receiverAddressDetail}
                onChange={(e) => updateField("receiverAddressDetail", e.target.value)}
                placeholder="101동 202호"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>
                물품
              </label>
              <div style={{ display: "flex", gap: 4, marginBottom: form.itemType === "normal" ? 8 : 0 }}>
                {([["normal", "커버링 봉투"], ["large", "대형 커버링 봉투"]] as const).map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => setForm((prev) => ({ ...prev, itemType: type, itemCount: type === "large" ? 1 : prev.itemCount }))}
                    style={{
                      flex: 1, padding: "8px 0", fontSize: 13,
                      fontWeight: form.itemType === type ? 600 : 400,
                      backgroundColor: form.itemType === type ? "#4F46E5" : "#F3F4F6",
                      color: form.itemType === type ? "#fff" : "#6B7280",
                      border: "none", borderRadius: 6, cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.itemType === "normal" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>수량</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => setForm((prev) => ({ ...prev, itemCount: Math.max(1, prev.itemCount - 1) }))}
                      style={{
                        width: 28, height: 28, fontSize: 16, fontWeight: 600,
                        backgroundColor: "var(--app-surface-secondary)", border: "none", borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      -
                    </button>
                    <span style={{
                      minWidth: 32, textAlign: "center", fontSize: 14, fontWeight: 600,
                    }}>
                      {form.itemCount}
                    </span>
                    <button
                      onClick={() => setForm((prev) => ({ ...prev, itemCount: Math.min(20, prev.itemCount + 1) }))}
                      style={{
                        width: 28, height: 28, fontSize: 16, fontWeight: 600,
                        backgroundColor: "var(--app-surface-secondary)", border: "none", borderRadius: 6, cursor: "pointer",
                      }}
                    >
                      +
                    </button>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>개</span>
                </div>
              )}
              {form.itemType === "large" && (
                <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginTop: 4 }}>
                  대형 봉투는 1건당 1개만 접수 가능
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--app-text-secondary)", marginBottom: 4, display: "block" }}>
                고객 요청사항
              </label>
              <textarea
                value={form.memoFromCustomer}
                onChange={(e) => updateField("memoFromCustomer", e.target.value)}
                placeholder="배송 시 요청사항"
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%", marginTop: 16, padding: "10px 0", fontSize: 14, fontWeight: 600,
              backgroundColor: "#4F46E5", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: loading ? "wait" : "pointer",
              opacity: loading ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            배송 접수
          </button>
        </>
      )}
    </div>
  );
}

// ─── 주문 상세 (실패 사유) ───

interface OrderDetailInfo {
  orderId: string;
  failureCode: string;
  failureMessage: string;
  visitImages: number;
  visitImageUrls?: string[];
  visitResult: string;
  visitCount: string;
  items: Array<{ name: string; status: string; quantity: number; weight: string }>;
}

const isFailed = (status: string) =>
  status.includes("실패") || status.includes("취소");

function OrderRow({ order: o, isLast }: {
  order: { date: string; orderId: string; orderUrl?: string; orderName: string; status: string; weight: string };
  isLast: boolean;
}) {
  const [detail, setDetail] = useState<OrderDetailInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchDetail = async () => {
    if (detail) { setExpanded(!expanded); return; }
    if (!o.orderUrl) return;
    setDetailLoading(true);
    setExpanded(true);
    try {
      const res = await fetch("/api/backoffice/order-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: o.orderUrl }),
      });
      const json = await res.json();
      if (json.success) setDetail(json.data);
      else toast.error(json.error || "주문 상세 조회 실패");
    } catch {
      toast.error("주문 상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  };

  const failed = isFailed(o.status);
  const canExpand = !!o.orderUrl;

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--app-border)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 0",
        cursor: canExpand ? "pointer" : "default",
      }} onClick={canExpand ? fetchDetail : undefined}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "#6B7280" }}>{o.date}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--app-text-primary)" }}>
            {o.orderName}
          </div>
          <a
            href={o.orderUrl || `https://admin.covering.app/v2/order?filterType=ORDER_NUMBER&searchTerm=${o.orderId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 11, color: "#4F46E5", textDecoration: "none" }}
          >
            {o.orderId} ↗
          </a>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
            backgroundColor:
              o.status.includes("완료") && !o.status.includes("실패") ? "#D1FAE5" :
              o.status.includes("진행") ? "#DBEAFE" :
              o.status.includes("접수") && !o.status.includes("취소") ? "#DBEAFE" :
              failed ? "#FEE2E2" : "#F3F4F6",
            color:
              o.status.includes("완료") && !o.status.includes("실패") ? "#065F46" :
              o.status.includes("진행") ? "#1E40AF" :
              o.status.includes("접수") && !o.status.includes("취소") ? "#1E40AF" :
              failed ? "#991B1B" : "#374151",
          }}>
            {o.status}
          </span>
          {o.weight && o.weight !== "-" && (
            <span style={{ fontSize: 11, color: "#9CA3AF" }}>{o.weight}</span>
          )}
          {canExpand && (
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>
              {detailLoading ? "조회 중..." : expanded ? "▲ 접기" : "▼ 자세히 보기"}
            </span>
          )}
        </div>
      </div>

      {/* 주문 상세 */}
      {expanded && detail && (
        <div style={{
          padding: "8px 10px", marginBottom: 6, borderRadius: 6,
          backgroundColor: failed ? "#FEF2F2" : "var(--app-surface-secondary)", fontSize: 12,
        }}>
          {failed && detail.failureCode && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "#EF4444", fontWeight: 600 }}>사유: </span>
              <span style={{ color: "var(--app-text-primary)" }}>{detail.failureCode}</span>
              {detail.failureMessage && detail.failureMessage !== detail.failureCode && (
                <span style={{ color: "#6B7280" }}> — {detail.failureMessage}</span>
              )}
            </div>
          )}
          {detail.visitResult && (
            <div style={{ marginBottom: 4, color: "#6B7280" }}>
              {detail.visitResult} ({detail.visitCount})
            </div>
          )}
          {detail.visitImages > 0 && (
            <div>
              <div style={{ color: "#6B7280", marginBottom: 4 }}>
                방문 이미지 {detail.visitImages}개
              </div>
              {detail.visitImageUrls && detail.visitImageUrls.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {detail.visitImageUrls.map((url, j) => (
                    <a key={j} href={url} target="_blank" rel="noopener noreferrer">
                      <img
                        src={url}
                        alt={`방문 이미지 ${j + 1}`}
                        style={{
                          width: 80, height: 80, objectFit: "cover", borderRadius: 6,
                          border: "1px solid var(--app-border)",
                        }}
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {detail.items.length > 0 && (
            <div style={{ marginTop: 4, borderTop: "1px solid var(--app-border)", paddingTop: 4 }}>
              {detail.items.map((item, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", color: "#6B7280" }}>
                  <span>{item.name}</span>
                  <span style={{ color: item.status.includes("실패") ? "#EF4444" : "#6B7280" }}>
                    {item.status} / {item.quantity}개
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 고객정보 탭 ───

interface BackofficeUserInfo {
  name: string;
  id: string;
  phone: string;
  joinDate: string;
  lastModified: string;
  grade: string;
  validOrders: string;
  nextExpireOrders: string;
  address: string;
  totalOrders: string;
  isSubscriber?: boolean;
  subscriptionDate?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  subscriptionValidUntil?: string;
  subscriptionCancelDate?: string;
  recentOrders: Array<{
    date: string;
    orderId: string;
    orderUrl?: string;
    orderName: string;
    status: string;
    weight: string;
  }>;
}

interface BackofficeOrder {
  orderId: string;
  orderStatus: string;
  orderName: string;
  customerName: string;
  customerType: string;
  phone: string;
  address: string;
  addressDetail: string;
  pickupDate: string;
  driver: string;
  bags: string;
  boxes: string;
  deliveryBags: string;
  waste: string;
}

interface BackofficeResult {
  orders: BackofficeOrder[];
  userInfo: BackofficeUserInfo | null;
}

function CustomerInfoTab({ selectedChat, onBackofficeLoaded }: { selectedChat: CTChat | null; onBackofficeLoaded?: (summary: BackofficeSummary | null) => void }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BackofficeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prevChatIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const doLookup = useCallback(async (phone: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/backoffice/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "조회 실패");
      setData(json.data);
      const u = json.data?.userInfo as BackofficeUserInfo | undefined;
      const orders = (json.data?.orders as BackofficeOrder[]) ?? [];
      // 진행 중 주문 (배송준비, 접수 등 — 완료/취소 제외)
      const activeOrders = orders
        .filter((o) => !o.orderStatus?.includes("완료") && !o.orderStatus?.includes("취소"))
        .slice(0, 3)
        .map((o) => ({
          orderId: o.orderId,
          orderName: o.orderName,
          status: o.orderStatus,
          pickupDate: o.pickupDate,
          address: o.address,
        }));
      if (u?.name && u?.id) onBackofficeLoaded?.({
        name: u.name,
        userId: u.id,
        grade: u.grade,
        isSubscriber: u.isSubscriber,
        subscriptionDate: u.subscriptionDate,
        address: u.address,
        totalOrders: u.totalOrders,
        validOrders: u.validOrders,
        recentOrders: u.recentOrders?.slice(0, 5).map((o) => ({
          date: o.date, orderName: o.orderName, status: o.status, weight: o.weight,
        })),
        activeOrders: activeOrders.length > 0 ? activeOrders : undefined,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "조회 실패");
      onBackofficeLoaded?.(null);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  // 채팅 선택 시 자동 조회 — 새 채팅 또는 데이터 없으면 재조회
  useEffect(() => {
    const chatId = selectedChat?.id ?? null;
    const isNewChat = chatId !== prevChatIdRef.current;
    if (isNewChat) {
      prevChatIdRef.current = chatId;
      setData(null);
      setError(null);
      onBackofficeLoaded?.(null);
    }
    const phone = selectedChat?.userPhone?.replace(/^\+82/, "0") || null;
    if (phone && (isNewChat || (!data && !loading && !error))) {
      doLookup(phone);
    } else if (!phone) {
      abortRef.current?.abort(); setData(null); setError(null); setLoading(false); onBackofficeLoaded?.(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat, doLookup]);

  const sectionStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderBottom: "1px solid var(--app-border)",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "#9CA3AF", marginBottom: 2,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 13, color: "var(--app-text-primary)", fontWeight: 500,
  };

  const badgeStyle = (color: string): React.CSSProperties => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 4,
    fontSize: 11, fontWeight: 600, color: "#fff", backgroundColor: color,
  });

  if (!selectedChat) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
        채팅을 선택하면 고객 정보가 표시됩니다
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: 40, textAlign: "center" }}>
          <Loader2 size={24} color="#4F46E5" style={{ animation: "spin 1s linear infinite" }} />
          <div style={{ marginTop: 8, fontSize: 13, color: "#9CA3AF" }}>백오피스 조회 중...</div>
        </div>
        <ChatHistorySection selectedChat={selectedChat} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: 16 }}>
          <div style={{
            padding: "12px 16px", borderRadius: 8,
            backgroundColor: "rgba(239,68,68,0.1)", color: "#EF4444", fontSize: 13,
          }}>
            {error}
          </div>
          <button
            onClick={() => {
              const phone = selectedChat?.userPhone?.replace(/^\+82/, "0");
              if (phone) {
                prevChatIdRef.current = null;
                setError(null);
                doLookup(phone);
              }
            }}
            style={{
              marginTop: 8, width: "100%", padding: "8px 0", fontSize: 13, fontWeight: 600,
              color: "#4F46E5", backgroundColor: "transparent", border: "1px solid #4F46E5",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            다시 조회
          </button>
        </div>
        <ChatHistorySection selectedChat={selectedChat} />
      </div>
    );
  }

  if (!data) return <ChatHistorySection selectedChat={selectedChat} />;

  const u = data.userInfo;

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {/* 기본 정보 */}
      {u && (
        <>
          <div style={{ ...sectionStyle, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              backgroundColor: "#E0E7FF", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <User size={20} color="#4F46E5" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--app-text-primary)" }}>
                {u.name} <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF" }}>ID: {u.id}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                {u.phone} · 가입 {u.joinDate}
              </div>
              {u.subscriptionStatus && (() => {
                const isActive = u.subscriptionStatus === "활성";
                return (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    marginTop: 6, padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 11, fontWeight: 600,
                    backgroundColor: isActive ? "#FEF3C7" : "#F3F4F6",
                    color: isActive ? "#92400E" : "#4B5563",
                    border: `1px solid ${isActive ? "#FCD34D" : "#E5E7EB"}`,
                  }}>
                    {isActive
                      ? <Sparkles size={11} style={{ color: "#D97706" }} />
                      : <Ban size={11} style={{ color: "#9CA3AF" }} />
                    }
                    <span>
                      {isActive
                        ? `구독중 · ~${(u.subscriptionValidUntil || "").split("~")[1]?.trim() || u.subscriptionDate}`
                        : `구독 취소 · ${u.subscriptionCancelDate || u.subscriptionDate}`
                      }
                    </span>
                  </div>
                );
              })()}
            </div>
            <span style={badgeStyle(u.grade === "씨앗" ? "#10B981" : u.grade === "새싹" ? "#3B82F6" : "#8B5CF6")}>
              {u.grade || "-"}
            </span>
          </div>

          {/* 주문 통계 */}
          <div style={{ ...sectionStyle, display: "flex", gap: 8 }}>
            <div style={{
              flex: 1, padding: "10px 12px", borderRadius: 8,
              backgroundColor: "var(--app-surface)", textAlign: "center",
            }}>
              <div style={labelStyle}>총 주문</div>
              <div style={{ ...valueStyle, fontSize: 18, color: "#4F46E5" }}>{u.totalOrders}건</div>
            </div>
            <div style={{
              flex: 1, padding: "10px 12px", borderRadius: 8,
              backgroundColor: "var(--app-surface)", textAlign: "center",
            }}>
              <div style={labelStyle}>유효 주문</div>
              <div style={{ ...valueStyle, fontSize: 18, color: "#10B981" }}>{u.validOrders}건</div>
            </div>
            <div style={{
              flex: 1, padding: "10px 12px", borderRadius: 8,
              backgroundColor: "var(--app-surface)", textAlign: "center",
            }}>
              <div style={labelStyle}>소멸 예정</div>
              <div style={{ ...valueStyle, fontSize: 18, color: "#F59E0B" }}>{u.nextExpireOrders}건</div>
            </div>
          </div>

          {/* 주소 */}
          {u.address && (
            <div style={sectionStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
                <MapPin size={12} color="#9CA3AF" />
                <span style={labelStyle}>등록 주소</span>
              </div>
              <div style={valueStyle}>{u.address}</div>
            </div>
          )}

          {/* 최근 주문 내역 */}
          {u.recentOrders.length > 0 && (
            <div style={sectionStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <ShoppingBag size={12} color="#9CA3AF" />
                <span style={labelStyle}>최근 주문 (90일)</span>
              </div>
              {u.recentOrders.map((o, i) => (
                <OrderRow key={i} order={o} isLast={i === u.recentOrders.length - 1} />
              ))}
            </div>
          )}
        </>
      )}

      {/* 예정 주문 (주문 검색 결과) */}
      {data.orders.length > 0 && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <Calendar size={12} color="#9CA3AF" />
            <span style={labelStyle}>예정 주문 (7일)</span>
          </div>
          {data.orders.map((o, i) => (
            <div key={i} style={{
              padding: "8px 10px", borderRadius: 8, marginBottom: 6,
              backgroundColor: "var(--app-surface)", fontSize: 12,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: "var(--app-text-primary)" }}>{o.orderId}</span>
                <span style={badgeStyle(
                  o.orderStatus.includes("완료") ? "#10B981" :
                  o.orderStatus.includes("접수") ? "#3B82F6" : "#6B7280"
                )}>
                  {o.orderStatus}
                </span>
              </div>
              <div style={{ color: "#6B7280" }}>
                {o.orderName} · {o.pickupDate}
              </div>
              <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>
                {o.address} {o.addressDetail}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 상담 목록 */}
      <ChatHistorySection selectedChat={selectedChat} />

      {/* 데이터 없음 — 재조회 버튼 */}
      {!u && data.orders.length === 0 && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ color: "#9CA3AF", fontSize: 13, marginBottom: 8 }}>고객 정보를 찾을 수 없습니다</div>
          <button
            onClick={() => {
              const phone = selectedChat?.userPhone?.replace(/^\+82/, "0");
              if (phone) {
                prevChatIdRef.current = null; // 강제 리셋 → useEffect 재실행 유도
                setData(null);
                setError(null);
                doLookup(phone);
              }
            }}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600,
              color: "#4F46E5", backgroundColor: "transparent", border: "1px solid #4F46E5",
              borderRadius: 8, cursor: "pointer",
            }}
          >
            다시 조회
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 상담 목록 ───

interface ChatHistoryItem {
  id: string;
  state: string;
  assignee: string | null;
  tags: string[];
  lastMessage: string;
  createdAt: number;
  updatedAt: number;
}

function ChatHistorySection({ selectedChat }: { selectedChat: CTChat | null }) {
  const [open, setOpen] = useState(true);
  const [chats, setChats] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const prevUserIdRef = useRef<string | null>(null);
  const [modalChat, setModalChat] = useState<ChatHistoryItem | null>(null);

  // 채팅 변경 시 초기화
  useEffect(() => {
    const uid = selectedChat?.userId ?? null;
    if (uid !== prevUserIdRef.current) {
      prevUserIdRef.current = uid;
      setChats([]);
      setLoaded(false);
      setOpen(true);
    }
  }, [selectedChat?.userId]);

  const loadHistory = useCallback(async () => {
    if (!selectedChat?.userId || loaded) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/channeltalk/users/${selectedChat.userId}/chats`);
      const data = await res.json();
      // 현재 채팅 제외
      setChats((data.chats ?? []).filter((c: ChatHistoryItem) => c.id !== selectedChat.id));
      setLoaded(true);
    } catch {
      toast.error("상담 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [selectedChat?.userId, selectedChat?.id, loaded]);

  // open이 true이고 아직 로드 안 됐으면 자동 로드
  useEffect(() => {
    if (open && !loaded && selectedChat?.userId) loadHistory();
  }, [open, loaded, selectedChat?.userId, loadHistory]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) loadHistory();
  };

  if (!selectedChat) return null;

  const stateLabel: Record<string, { text: string; color: string }> = {
    opened: { text: "진행중", color: "#10B981" },
    closed: { text: "종료", color: "#9CA3AF" },
    snoozed: { text: "보류", color: "#F59E0B" },
  };

  return (
    <div style={{ borderBottom: "1px solid var(--app-border)" }}>
      <button
        onClick={handleToggle}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          padding: "12px 16px", border: "none", backgroundColor: "transparent",
          cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--app-text-secondary)",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <MessageSquare size={13} />
        상담 목록
        {loaded && <span style={{ fontWeight: 400, color: "#9CA3AF" }}>· {chats.length}</span>}
        {loading && <Loader2 size={12} style={{ animation: "spin 1s linear infinite", marginLeft: "auto" }} />}
      </button>
      {open && (
        <div style={{ padding: "0 16px 12px", maxHeight: 300, overflowY: "auto" }}>
          {chats.length === 0 && loaded && (
            <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: 8 }}>이전 상담 없음</div>
          )}
          {chats.map((c) => {
            const st = stateLabel[c.state] ?? { text: c.state, color: "#9CA3AF" };
            const date = new Date(c.createdAt);
            const elapsed = Date.now() - c.updatedAt;
            const timeAgo = elapsed < 60_000 ? "방금" :
              elapsed < 3600_000 ? `${Math.floor(elapsed / 60_000)}분` :
              elapsed < 86400_000 ? `${Math.floor(elapsed / 3600_000)}시간` :
              `${Math.floor(elapsed / 86400_000)}일`;
            return (
              <div key={c.id} onClick={() => setModalChat(c)} style={{
                padding: "8px 10px", borderRadius: 8, marginBottom: 4,
                backgroundColor: "var(--app-surface)", fontSize: 12,
                cursor: "pointer", transition: "background-color 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "var(--app-surface-hover, #f3f4f6)"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "var(--app-surface)"}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: st.color,
                      padding: "1px 6px", borderRadius: 4,
                      backgroundColor: st.color + "18",
                    }}>
                      {st.text}
                    </span>
                    {c.assignee && (
                      <span style={{ fontSize: 11, color: "#6B7280" }}>· {c.assignee}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{timeAgo}</span>
                </div>
                {c.lastMessage && (
                  <div style={{
                    color: "#6B7280", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.lastMessage}
                  </div>
                )}
                {c.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 4).map((t) => (
                      <span key={t} style={{
                        fontSize: 10, padding: "1px 5px", borderRadius: 4,
                        backgroundColor: "#F3F4F6", color: "#6B7280",
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {modalChat && (
        <ChatHistoryModal
          chat={modalChat}
          userName={selectedChat?.userName ?? ""}
          onClose={() => setModalChat(null)}
        />
      )}
    </div>
  );
}

// ─── 상담이력 대화 모달 (드래그 가능) ───

interface HistoryMessage {
  id: string;
  role: "user" | "manager" | "bot";
  content: string;
  senderName?: string;
  avatarUrl?: string;
  createdAt: number;
  isInternal?: boolean;
}

const FONT_SIZES = [12, 13, 14, 16, 18];
const DEFAULT_MODAL_SIZE = { w: 520, h: 500 };
const MIN_MODAL_SIZE = { w: 360, h: 300 };
const MAX_MODAL_SIZE = { w: 900, h: 800 };

function ChatHistoryModal({ chat, userName, onClose }: {
  chat: ChatHistoryItem;
  userName: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<HistoryMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState({ x: Math.max(60, window.innerWidth / 2 - 260), y: 60 });
  const [size, setSize] = useState({ ...DEFAULT_MODAL_SIZE });
  const [fontIdx, setFontIdx] = useState(1); // 13px default
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const fontSize = FONT_SIZES[fontIdx];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/channeltalk/chats/${chat.id}/messages`);
        const data = await res.json();
        setMessages(data.messages ?? []);
      } catch {
        toast.error("대화 내역 조회 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [chat.id]);

  // 드래그 이동
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (ev.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.origY + (ev.clientY - dragRef.current.startY)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  }, [pos]);

  // 리사이즈 (우하단 코너)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      setSize({
        w: Math.max(MIN_MODAL_SIZE.w, Math.min(MAX_MODAL_SIZE.w, resizeRef.current.origW + (ev.clientX - resizeRef.current.startX))),
        h: Math.max(MIN_MODAL_SIZE.h, Math.min(MAX_MODAL_SIZE.h, resizeRef.current.origH + (ev.clientY - resizeRef.current.startY))),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  }, [size]);

  const stateLabel: Record<string, { text: string; color: string }> = {
    opened: { text: "진행중", color: "#10B981" },
    closed: { text: "종료", color: "#9CA3AF" },
    snoozed: { text: "보류", color: "#F59E0B" },
  };
  const st = stateLabel[chat.state] ?? { text: chat.state, color: "#9CA3AF" };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (d.toDateString() === now.toDateString()) return time;
    return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
  };

  const ToolBtn = ({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) => (
    <button onClick={onClick} title={title} style={{
      border: "none", background: "none", cursor: "pointer", padding: 3, borderRadius: 4,
      color: "#9CA3AF", display: "flex", alignItems: "center",
    }}
    onMouseEnter={e => e.currentTarget.style.color = "var(--app-text-primary)"}
    onMouseLeave={e => e.currentTarget.style.color = "#9CA3AF"}
    >{children}</button>
  );

  return createPortal(
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 9999,
      width: size.w, height: size.h,
      backgroundColor: "var(--app-surface, #fff)",
      borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.08)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* 드래그 핸들 + 헤더 */}
      <div
        onMouseDown={handleDragStart}
        style={{
          padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "grab", borderBottom: "1px solid var(--app-border-light, #e5e7eb)",
          backgroundColor: "var(--app-surface-secondary, #f9fafb)",
          borderRadius: "12px 12px 0 0", userSelect: "none", flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <GripHorizontal size={14} style={{ color: "#9CA3AF", flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {userName}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, color: st.color,
            padding: "1px 6px", borderRadius: 4, backgroundColor: st.color + "18", flexShrink: 0,
          }}>
            {st.text}
          </span>
          {chat.assignee && (
            <span style={{ fontSize: 11, color: "#6B7280", flexShrink: 0 }}>· {chat.assignee}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          <ToolBtn onClick={() => setFontIdx(i => Math.max(0, i - 1))} title="글씨 축소">
            <ZoomOut size={14} />
          </ToolBtn>
          <span style={{ fontSize: 10, color: "#9CA3AF", minWidth: 24, textAlign: "center" }}>{fontSize}</span>
          <ToolBtn onClick={() => setFontIdx(i => Math.min(FONT_SIZES.length - 1, i + 1))} title="글씨 확대">
            <ZoomIn size={14} />
          </ToolBtn>
          <ToolBtn onClick={() => setSize({ w: Math.min(MAX_MODAL_SIZE.w, window.innerWidth - 100), h: Math.min(MAX_MODAL_SIZE.h, window.innerHeight - 100) })} title="최대화">
            <Maximize2 size={13} />
          </ToolBtn>
          <ToolBtn onClick={onClose} title="닫기">
            <X size={16} />
          </ToolBtn>
        </div>
      </div>

      {/* 태그 */}
      {chat.tags.length > 0 && (
        <div style={{ padding: "6px 14px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--app-border-light, #e5e7eb)", flexShrink: 0 }}>
          {chat.tags.map(t => (
            <span key={t} style={{
              fontSize: 11, padding: "2px 7px", borderRadius: 4,
              backgroundColor: "#F3F4F6", color: "#6B7280",
            }}>{t}</span>
          ))}
        </div>
      )}

      {/* 메시지 영역 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "#9CA3AF" }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, fontSize, color: "#9CA3AF" }}>메시지 없음</div>
        ) : (
          messages.map(msg => {
            const isUser = msg.role === "user";
            const isInternal = msg.isInternal;
            return (
              <div key={msg.id} style={{
                display: "flex", flexDirection: "column",
                alignItems: isUser ? "flex-start" : "flex-end",
                gap: 2,
              }}>
                <div style={{ fontSize: Math.max(10, fontSize - 2), color: "#9CA3AF", padding: "0 4px" }}>
                  {msg.senderName ?? (isUser ? userName : "상담사")} · {formatDate(msg.createdAt)}
                </div>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
                  fontSize, lineHeight: 1.5, wordBreak: "break-word",
                  backgroundColor: isUser ? "#F3F4F6" : isInternal ? "#FEF3C7" : "#EFF6FF",
                  color: "var(--app-text-primary, #111)",
                  borderTopLeftRadius: isUser ? 4 : 12,
                  borderTopRightRadius: isUser ? 12 : 4,
                }}>
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 하단 정보 */}
      <div style={{
        padding: "8px 14px", borderTop: "1px solid var(--app-border-light, #e5e7eb)",
        fontSize: 11, color: "#9CA3AF", display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>생성: {new Date(chat.createdAt).toLocaleDateString("ko-KR")}</span>
        <span>메시지 {messages.length}개</span>
      </div>

      {/* 리사이즈 핸들 (우하단 코너) */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: "absolute", right: 0, bottom: 0, width: 18, height: 18,
          cursor: "nwse-resize", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.3 }}>
          <line x1="9" y1="1" x2="1" y2="9" stroke="#666" strokeWidth="1.5" />
          <line x1="9" y1="5" x2="5" y2="9" stroke="#666" strokeWidth="1.5" />
        </svg>
      </div>
    </div>,
    document.body
  );
}

// ─── 메인 패널 ───

const TOP_TABS = [
  { key: "customer", label: "고객정보", icon: User },
  { key: "delivery", label: "배송", icon: Package },
] as const;

const DELIVERY_SUB_TABS = [
  { key: "search", label: "배송 조회", icon: Search },
  { key: "create", label: "배송 접수", icon: Plus },
] as const;

export default function ToolPanel({ selectedChat, visible, onClose, onBackofficeLoaded }: ToolPanelProps) {
  const [topTab, setTopTab] = useState<"delivery" | "customer">("customer");
  const [deliveryTab, setDeliveryTab] = useState<"search" | "create">("search");
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  // 상담 설명
  const [description, setDescription] = useState("");
  const [descSaving, setDescSaving] = useState(false);
  const [descSaved, setDescSaved] = useState(false);
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDescription(selectedChat?.description ?? "");
  }, [selectedChat?.id, selectedChat?.description]);

  const saveDescription = useCallback(async (chatId: string, desc: string) => {
    setDescSaving(true);
    try {
      const res = await fetch(`/api/channeltalk/chats/${chatId}/description`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc }),
      });
      if (res.ok) {
        setDescSaved(true);
        setTimeout(() => setDescSaved(false), 2000);
      }
    } catch { /* ignore */ }
    finally { setDescSaving(false); }
  }, []);

  // 세션 변경 시 초기화
  const prevChatRef = useRef<string | null>(null);
  useEffect(() => {
    const id = selectedChat?.id ?? null;
    if (id !== prevChatRef.current) {
      prevChatRef.current = id;
      setCustomerInfo(null);
    }
  }, [selectedChat]);

  if (!visible) return null;

  return (
    <div style={{
      width: "100%",
      backgroundColor: "var(--app-bg)",
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
    }}>
      {/* 최상위 탭: 배송 / 고객정보 */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
      }}>
        {TOP_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = topTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setTopTab(tab.key)}
              style={{
                flex: 1, padding: "10px 0", fontSize: 13, fontWeight: isActive ? 600 : 400,
                color: isActive ? "#4F46E5" : "#9CA3AF",
                backgroundColor: "transparent", border: "none", cursor: "pointer",
                borderBottom: isActive ? "2px solid #4F46E5" : "2px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              }}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 배송 탭 */}
      {topTab === "delivery" && (
        <>
          {/* 배송 서브탭 */}
          <div style={{
            display: "flex", borderBottom: "1px solid var(--app-border)", backgroundColor: "var(--app-surface)",
          }}>
            {DELIVERY_SUB_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = deliveryTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setDeliveryTab(tab.key)}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 12, fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#6366F1" : "#9CA3AF",
                    backgroundColor: "transparent", border: "none", cursor: "pointer",
                    borderBottom: isActive ? "2px solid #6366F1" : "2px solid transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          {deliveryTab === "search" && <DeliverySearchTab selectedChat={selectedChat} onCustomerFound={setCustomerInfo} />}
          {deliveryTab === "create" && <DeliveryCreateTab selectedChat={selectedChat} customerInfo={customerInfo} />}
        </>
      )}

      {/* 고객정보 탭 — 항상 마운트 (자동 조회 위해), display로 토글 */}
      <div style={{ display: topTab === "customer" ? "flex" : "none", flex: 1, flexDirection: "column", overflow: "auto" }}>
        {/* ── 고객 정보 섹션 ── */}
        <CollapsibleSection title="고객 정보" icon={<User style={{ width: 15, height: 15, color: "var(--app-text-tertiary)" }} />} defaultOpen>
          <CustomerInfoTab selectedChat={selectedChat} onBackofficeLoaded={onBackofficeLoaded} />
        </CollapsibleSection>

        {/* ── 상담 설명 섹션 ── */}
        {selectedChat && (
          <CollapsibleSection title="상담 설명" icon={<FileText style={{ width: 15, height: 15, color: "var(--app-text-tertiary)" }} />} defaultOpen>
            <div style={{ padding: "8px 16px 12px", position: "relative" }}>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (description.trim()) saveDescription(selectedChat.id, description.trim());
                  }
                }}
                onBlur={() => {
                  if (description.trim()) {
                    if (descTimerRef.current) clearTimeout(descTimerRef.current);
                    descTimerRef.current = setTimeout(() => {
                      saveDescription(selectedChat.id, description.trim());
                    }, 300);
                  }
                }}
                placeholder="상담 설명을 입력하세요 (엔터로 저장)"
                rows={4}
                style={{
                  width: "100%", border: "1px solid var(--app-border)", borderRadius: 8,
                  outline: "none", backgroundColor: "var(--app-surface)",
                  fontSize: 13, color: "var(--app-text-primary)", padding: "10px 12px",
                  resize: "vertical", lineHeight: 1.5, fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              {(descSaving || descSaved) && (
                <div style={{ position: "absolute", bottom: 16, right: 22 }}>
                  {descSaving && <Loader2 style={{ width: 12, height: 12, color: "var(--app-text-tertiary)", animation: "spin 1s linear infinite" }} />}
                  {descSaved && !descSaving && <span style={{ fontSize: 11, color: "#22c55e" }}>✓ 저장됨</span>}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// ── 접이식 섹션 (채널톡 스타일) ──
function CollapsibleSection({ title, icon, defaultOpen = false, children }: {
  title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--app-border)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "12px 16px",
          display: "flex", alignItems: "center", gap: 8,
          backgroundColor: "var(--app-surface)", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <ChevronRight style={{
          width: 14, height: 14, color: "var(--app-text-tertiary)",
          transform: open ? "rotate(90deg)" : "none",
          transition: "transform 0.15s",
        }} />
        {icon}
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--app-text-primary)", flex: 1 }}>{title}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
