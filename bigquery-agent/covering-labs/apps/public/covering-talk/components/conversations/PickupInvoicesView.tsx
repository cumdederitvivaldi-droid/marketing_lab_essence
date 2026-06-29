"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, Receipt } from "lucide-react";
import { toast } from "sonner";
import type { PickupInvoice, PickupInvoiceStatus } from "@/lib/store/pickup-invoices";
import { PickupInvoiceDetailModal } from "./PickupInvoiceDetailModal";

const STATUS_TABS: { key: "all" | PickupInvoiceStatus; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "issued", label: "발행 완료" },
  { key: "pending", label: "대기" },
  { key: "failed", label: "실패" },
  { key: "cancelled", label: "취소" },
];

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  issued: "발행 완료",
  failed: "실패",
  cancelled: "취소",
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#FFF3E0", text: "#E65100" },
  issued: { bg: "#E8F5E9", text: "#2E7D32" },
  failed: { bg: "#FFEBEE", text: "#C62828" },
  cancelled: { bg: "#ECEFF1", text: "#546E7A" },
};

export function PickupInvoicesView() {
  const [items, setItems] = useState<PickupInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | PickupInvoiceStatus>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== "all") params.set("status", activeTab);
      params.set("limit", "200");
      const res = await fetch(`/api/invoices?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "조회 실패");
      setItems(data.items ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--app-bg)" }}>
      {/* 헤더 */}
      <div style={{
        padding: "16px 24px",
        backgroundColor: "var(--app-surface)",
        borderBottom: "1px solid var(--app-border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Receipt style={{ width: 20, height: 20, color: "var(--app-accent)" }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--app-text-primary)" }}>
            세금계산서 발행 이력
          </h2>
          <span style={{ fontSize: 13, color: "var(--app-text-tertiary)" }}>
            ({items.length}건)
          </span>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          title="새로고침"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", fontSize: 13, fontWeight: 600,
            color: "var(--app-text-secondary)",
            backgroundColor: "var(--app-surface-secondary)",
            border: "1px solid var(--app-border)",
            borderRadius: 8,
            cursor: loading ? "default" : "pointer",
          }}
        >
          <RefreshCw style={{ width: 14, height: 14, animation: loading ? "spin 1s linear infinite" : undefined }} />
          새로고침
        </button>
      </div>

      {/* 상태 탭 */}
      <div style={{
        display: "flex", padding: "0 24px",
        backgroundColor: "var(--app-surface)",
        borderBottom: "1px solid var(--app-border)",
        gap: 0,
      }}>
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              height: 40, padding: "0 14px",
              fontSize: 13, fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? "var(--app-accent)" : "var(--app-text-tertiary)",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: `2px solid ${activeTab === key ? "var(--app-accent)" : "transparent"}`,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 리스트 */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
            <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "var(--app-text-tertiary)" }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--app-text-tertiary)" }}>
            발행 이력이 없습니다
          </div>
        ) : (
          <div style={{
            backgroundColor: "var(--app-surface)",
            borderRadius: 8,
            border: "1px solid var(--app-border)",
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--app-surface-secondary)" }}>
                  <Th>상태</Th>
                  <Th>상호</Th>
                  <Th>대표자</Th>
                  <Th>사업자번호</Th>
                  <Th>금액</Th>
                  <Th>발행자</Th>
                  <Th>발행 시각</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((inv) => {
                  const color = STATUS_COLOR[inv.status] ?? STATUS_COLOR.pending;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedId(inv.id)}
                      style={{
                        cursor: "pointer",
                        borderTop: "1px solid var(--app-border)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-tag-blue-bg)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <Td>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 10,
                          fontSize: 11, fontWeight: 600,
                          backgroundColor: color.bg, color: color.text,
                        }}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </Td>
                      <Td>{inv.businessName}</Td>
                      <Td>{inv.representativeName}</Td>
                      <Td><code>{inv.businessNumber}</code></Td>
                      <Td>{inv.totalAmount.toLocaleString()}원</Td>
                      <Td>{inv.createdBy ?? "-"}</Td>
                      <Td>{inv.issuedAt
                        ? new Date(inv.issuedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
                        : new Date(inv.createdAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <PickupInvoiceDetailModal
          invoiceId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={fetchData}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left", padding: "10px 12px",
      fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)",
      whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "10px 12px", color: "var(--app-text-primary)", whiteSpace: "nowrap" }}>
      {children}
    </td>
  );
}
