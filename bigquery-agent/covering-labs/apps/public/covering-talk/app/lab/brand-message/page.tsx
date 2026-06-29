"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, RefreshCw, Loader2, Send } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthContext";
import type { BrandMessageCampaign, CampaignStatus } from "@/lib/store/brand-message";
import { CreateCampaignModal } from "./components/CreateCampaignModal";

const LAB_ALLOWED_USERS = ["김원빈", "강성진"];

function formatKst(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const styles: Record<CampaignStatus, React.CSSProperties> = {
    draft: {
      backgroundColor: "var(--app-surface)",
      color: "var(--app-text-secondary)",
      border: "1px solid var(--app-border)",
    },
    scheduled: {
      backgroundColor: "var(--app-tag-purple-bg)",
      color: "var(--app-tag-purple-text)",
    },
    sending: {
      backgroundColor: "rgba(59,130,246,0.12)",
      color: "#2563EB",
    },
    completed: {
      backgroundColor: "var(--app-btn-success-bg)",
      color: "var(--app-btn-success-text)",
    },
    failed: {
      backgroundColor: "var(--app-btn-danger-bg)",
      color: "var(--app-btn-danger-text)",
    },
    cancelled: {
      backgroundColor: "var(--app-surface)",
      color: "var(--app-text-tertiary)",
      border: "1px solid var(--app-border)",
      opacity: 0.7,
    },
  };

  const labels: Record<CampaignStatus, string> = {
    draft: "초안",
    scheduled: "예약됨",
    sending: "발송 중",
    completed: "완료",
    failed: "실패",
    cancelled: "취소됨",
  };

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
      ...styles[status],
    }}>
      {status === "sending" && (
        <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />
      )}
      {labels[status]}
    </span>
  );
}

export default function BrandMessageListPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<BrandMessageCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (user && !LAB_ALLOWED_USERS.includes(user.name)) {
      router.replace("/conversations");
    }
  }, [user, authLoading, router]);

  // includeRevenue=true 일 때만 매출 합산 — mount / 수동 refresh 에만 사용.
  //   폴링(false) 시 서버가 매출 0 으로 회신하므로 직전 값을 유지하도록 merge.
  const fetchCampaigns = useCallback(async (includeRevenue = false) => {
    try {
      const url = includeRevenue
        ? "/api/lab/brand-message/campaigns?include_revenue=1"
        : "/api/lab/brand-message/campaigns";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const fresh: BrandMessageCampaign[] = data.campaigns ?? [];
      if (includeRevenue) {
        setCampaigns(fresh);
      } else {
        // 폴링 결과 — 이전 캠페인의 converted_revenue 를 유지
        setCampaigns((prev) => {
          const prevById = new Map(prev.map((c) => [c.id, c]));
          return fresh.map((c) => ({
            ...c,
            converted_revenue: c.converted_revenue && c.converted_revenue > 0
              ? c.converted_revenue
              : (prevById.get(c.id)?.converted_revenue ?? 0),
          }));
        });
      }
    } catch {
      // 무시
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 첫 로드 — 매출 포함
    fetchCampaigns(true);
    // 백그라운드 폴링 — 30초 주기, 매출 제외 (가벼운 쿼리만)
    pollRef.current = setInterval(() => fetchCampaigns(false), 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchCampaigns]);

  const isAllowed = !!user && LAB_ALLOWED_USERS.includes(user.name);

  if (authLoading || !user) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", backgroundColor: "var(--app-bg)",
      }}>
        <Loader2 style={{ width: 24, height: 24, color: "var(--app-accent)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (!isAllowed) return null;

  return (
    <div style={{
      height: "100vh", overflowY: "auto",
      backgroundColor: "var(--app-bg)", color: "var(--app-text-primary)",
    }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 1480, margin: "0 auto", padding: "28px 28px 80px" }}>

        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <FlaskConical style={{ width: 20, height: 20, color: "var(--app-tag-purple-text)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--app-text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                커버링 실험실
              </span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>브랜드메시지</h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => fetchCampaigns(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10,
                backgroundColor: "var(--app-surface)", border: "1px solid var(--app-border)",
                color: "var(--app-text-secondary)", fontSize: 13, fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <RefreshCw style={{ width: 14, height: 14 }} />
              새로고침
            </button>
            <button
              onClick={() => router.push("/lab/brand-message/test")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10,
                backgroundColor: "var(--app-surface)", border: "1px solid var(--app-tag-purple-text)",
                color: "var(--app-tag-purple-text)", fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Send style={{ width: 14, height: 14 }} />
              테스트 발송
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 10,
                backgroundColor: "var(--app-tag-purple-text)", border: "none",
                color: "white", fontSize: 13, fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              신규 캠페인
            </button>
          </div>
        </div>

        {/* 본문: 좌측 캠페인 목록 + 우측 sticky 통계 사이드바 */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 260px", gap: 16, alignItems: "start" }}>
          <div style={{ minWidth: 0 }}>

        {/* 캠페인 목록 */}
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 10, color: "var(--app-text-tertiary)" }}>
            <Loader2 style={{ width: 20, height: 20, animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 14 }}>불러오는 중…</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "80px 0", gap: 12,
          }}>
            <FlaskConical style={{ width: 40, height: 40, color: "var(--app-text-tertiary)", opacity: 0.4 }} />
            <p style={{ fontSize: 15, color: "var(--app-text-tertiary)", margin: 0 }}>
              아직 캠페인이 없습니다
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                marginTop: 8, display: "flex", alignItems: "center", gap: 6,
                padding: "10px 20px", borderRadius: 10,
                backgroundColor: "var(--app-tag-purple-text)", border: "none",
                color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus style={{ width: 15, height: 15 }} />
              첫 캠페인 만들기
            </button>
          </div>
        ) : (
          <div style={{
            backgroundColor: "var(--app-surface)", borderRadius: 14,
            border: "1px solid var(--app-border)", overflow: "hidden",
          }}>
            {/* 테이블 헤더 */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 2.4fr) minmax(140px, 1.2fr) 70px 90px 90px 90px 90px 170px 170px",
              gap: 12,
              padding: "10px 20px",
              backgroundColor: "var(--app-bg)",
              borderBottom: "1px solid var(--app-border)",
              fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)",
              letterSpacing: "0.05em", textTransform: "uppercase",
            }}>
              <span>캠페인</span>
              <span>그룹 태그</span>
              <span>타입</span>
              <span style={{ textAlign: "right" }}>전체</span>
              <span style={{ textAlign: "right" }}>발송</span>
              <span style={{ textAlign: "right" }}>실패</span>
              <span style={{ textAlign: "right" }}>전환</span>
              <span>예약 시각</span>
              <span>생성일시</span>
            </div>

            {campaigns.map((c, i) => (
              <div
                key={c.id}
                onClick={() => router.push(`/lab/brand-message/${c.id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 2.4fr) minmax(140px, 1.2fr) 70px 90px 90px 90px 90px 170px 170px",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: i < campaigns.length - 1 ? "1px solid var(--app-border)" : "none",
                  cursor: "pointer",
                  transition: "background-color 0.1s",
                  alignItems: "center",
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--app-bg)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.label}
                    </span>
                    <StatusBadge status={c.status} />
                  </div>
                  {c.excel_filename && (
                    <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>{c.excel_filename}</span>
                  )}
                </div>
                <span style={{ fontSize: 13, color: "var(--app-text-secondary)" }}>
                  {c.group_tag ?? "—"}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                  backgroundColor: "var(--app-tag-yellow-bg)", color: "var(--app-tag-yellow-text)",
                  display: "inline-block", justifySelf: "start",
                }}>
                  {c.message_type}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-text-primary)", textAlign: "right" }}>
                  {c.total_count.toLocaleString("ko-KR")}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--app-btn-success-text)", textAlign: "right" }}>
                  {c.sent_count.toLocaleString("ko-KR")}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: c.failed_count > 0 ? "var(--app-btn-danger-text)" : "var(--app-text-tertiary)", textAlign: "right" }}>
                  {c.failed_count.toLocaleString("ko-KR")}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: (c.converted_count ?? 0) > 0 ? "var(--app-accent)" : "var(--app-text-tertiary)", textAlign: "right" }}>
                  {(c.converted_count ?? 0).toLocaleString("ko-KR")}
                </span>
                <span style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>
                  {formatKst(c.scheduled_at)}
                </span>
                <span style={{ fontSize: 12, color: "var(--app-text-tertiary)" }}>
                  {formatKst(c.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}

          </div>{/* /좌측 본문 */}

          {/* 우측 sticky 통계 사이드바 */}
          <BrandMessageSummarySidebar campaigns={campaigns} />
        </div>{/* /grid */}
      </div>

      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => router.push(`/lab/brand-message/${id}`)}
        />
      )}
    </div>
  );
}

// FI(이미지) 친구톡 단가 — 25원/건
const COST_PER_MESSAGE_KRW = 25;

function BrandMessageSummarySidebar({ campaigns }: { campaigns: BrandMessageCampaign[] }) {
  // 초안(draft) / 취소(cancelled) 제외 — 실제 발송 시도된 캠페인만 합산
  const sent = campaigns.filter((c) => c.status !== "draft" && c.status !== "cancelled");
  const totals = sent.reduce(
    (acc, c) => {
      acc.campaigns += 1;
      acc.total += c.total_count ?? 0;
      acc.sent += c.sent_count ?? 0;
      acc.failed += c.failed_count ?? 0;
      acc.converted += c.converted_count ?? 0;
      acc.revenue += c.converted_revenue ?? 0;
      return acc;
    },
    { campaigns: 0, total: 0, sent: 0, failed: 0, converted: 0, revenue: 0 },
  );
  const draftCount = campaigns.length - sent.length;
  const cost = totals.sent * COST_PER_MESSAGE_KRW;
  const profit = totals.revenue - cost;
  const roi = cost > 0 ? (profit / cost) * 100 : 0;
  const sentRate = totals.total > 0 ? (totals.sent / totals.total) * 100 : 0;
  const convRate = totals.sent > 0 ? (totals.converted / totals.sent) * 100 : 0;

  // 매우 작은 비율도 0.0% 가 아닌 실제 값으로 보이게 — converted 가 1+ 일 때 0.00% 로 표기되지 않도록.
  const fmtPct = (v: number, hasValue: boolean): string => {
    if (!hasValue) return "0.00%";
    if (v === 0) return "0.00%";
    if (v < 0.01) return "<0.01%";
    return `${v.toFixed(2)}%`;
  };

  return (
    <aside style={{
      position: "sticky", top: 16,
      backgroundColor: "var(--app-surface)",
      border: "1px solid var(--app-border)", borderRadius: 14,
      padding: 18,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--app-text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          전체 합계
        </span>
        <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
          {totals.campaigns}개 캠페인{draftCount > 0 ? ` (초안 ${draftCount} 제외)` : ""}
        </span>
      </div>

      <SummaryRow label="발송 전체" value={totals.total.toLocaleString("ko-KR")} sub="명" tone="muted" />
      <SummaryRow label="성공" value={totals.sent.toLocaleString("ko-KR")} sub={fmtPct(sentRate, totals.total > 0)} tone="green" />
      <SummaryRow label="실패" value={totals.failed.toLocaleString("ko-KR")} sub="건" tone={totals.failed > 0 ? "red" : "muted"} />
      <SummaryRow label="전환 합계" value={totals.converted.toLocaleString("ko-KR")} sub={fmtPct(convRate, totals.sent > 0)} tone="accent" />

      <div style={{ height: 1, background: "var(--app-border)", margin: "4px 0" }} />

      <SummaryRow
        label="발송 비용"
        value={`-${cost.toLocaleString("ko-KR")}`}
        sub={`${COST_PER_MESSAGE_KRW}원/건`}
        tone="red"
      />
      <SummaryRow
        label="전환 매출"
        value={`+${totals.revenue.toLocaleString("ko-KR")}`}
        sub="원"
        tone="green"
      />
      <SummaryRow
        label="순이익 (ROI)"
        value={`${profit >= 0 ? "+" : ""}${profit.toLocaleString("ko-KR")}`}
        sub={cost > 0 ? `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%` : "—"}
        tone={profit >= 0 ? "accent" : "red"}
      />
    </aside>
  );
}

function SummaryRow({ label, value, sub, tone }: {
  label: string; value: string; sub: string;
  tone: "muted" | "green" | "red" | "accent";
}) {
  const colorMap: Record<string, string> = {
    muted: "var(--app-text-primary)",
    green: "var(--app-btn-success-text)",
    red: "var(--app-btn-danger-text)",
    accent: "var(--app-accent)",
  };
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--app-text-tertiary)", marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: colorMap[tone], fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>{sub}</span>
      </div>
    </div>
  );
}
