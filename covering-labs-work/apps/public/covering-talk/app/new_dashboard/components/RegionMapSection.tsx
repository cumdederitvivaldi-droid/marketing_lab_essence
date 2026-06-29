"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import type { RegionStat } from "./RegionMapInner";

interface CategoryDetail { name: string; count: number }
interface CategoryStat { category: string; count: number; details: CategoryDetail[] }
interface UnserviceableSido { sido: string; count: number }
interface RegionStatsResponse {
  serviceableRegions: RegionStat[];
  unserviceableSidos: UnserviceableSido[];
  topCategories: CategoryStat[];
}

interface Props {
  fromDateKst: string;
  toDateKst: string;
}

// leaflet 은 SSR 불가 — 클라이언트에서만 동적 로드
const RegionMapInner = dynamic(() => import("./RegionMapInner"), {
  ssr: false,
  loading: () => (
    <div style={{
      width: "100%", height: 500, borderRadius: 8, border: "1px solid var(--app-border)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--app-text-tertiary)", fontSize: 13,
    }}>
      지도 로딩 중...
    </div>
  ),
});

export function RegionMapSection({ fromDateKst, toDateKst }: Props) {
  const [data, setData] = useState<RegionStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fromDateKst || !toDateKst) return;
    setLoading(true);
    setError(null);
    // periodFromSearchParams 는 KST date(YYYY-MM-DD) + preset=custom 조합만 인식.
    // ISO 로 보내면 파싱 실패 → "thisMonth" fallback 으로 빠지므로 반드시 fromDateKst 사용.
    const params = new URLSearchParams({ preset: "custom", from: fromDateKst, to: toDateKst });
    fetch(`/api/new_dashboard/region-stats?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((res: RegionStatsResponse & { error?: string }) => {
        if (res.error) { setError(res.error); setData(null); return; }
        setData(res);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [fromDateKst, toDateKst]);

  const totalServiceable = useMemo(
    () => data?.serviceableRegions.reduce((a, r) => a + r.count, 0) ?? 0,
    [data?.serviceableRegions],
  );
  const totalUnserviceable = useMemo(
    () => data?.unserviceableSidos.reduce((a, r) => a + r.count, 0) ?? 0,
    [data?.unserviceableSidos],
  );
  const maxCategoryCount = useMemo(
    () => Math.max(1, ...(data?.topCategories.map((c) => c.count) ?? [])),
    [data?.topCategories],
  );
  const maxUnserviceable = useMemo(
    () => Math.max(1, ...(data?.unserviceableSidos.map((s) => s.count) ?? [])),
    [data?.unserviceableSidos],
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 16 }}>
      {/* 좌측: 지도 */}
      <div style={{
        background: "var(--app-card-bg)", borderRadius: 12, padding: 16,
        border: "1px solid var(--app-border)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>지역별 분포 (방문수거)</h3>
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--app-text-secondary)" }}>
            <Legend color="#3b82f6" label={`서비스 ${totalServiceable.toLocaleString()}건`} />
            <Legend color="#ef4444" label={`불가 문의 ${totalUnserviceable.toLocaleString()}건`} />
          </div>
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: 13, padding: 8 }}>오류: {error}</div>}
        {loading && !data && (
          <div style={{
            width: "100%", height: 500, borderRadius: 8, border: "1px solid var(--app-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--app-text-tertiary)", fontSize: 13,
          }}>
            데이터 로딩 중...
          </div>
        )}
        {data && (
          <RegionMapInner
            serviceableRegions={data.serviceableRegions}
            unserviceableSidos={data.unserviceableSidos}
          />
        )}
      </div>

      {/* 우측: 비서비스 카드 + Top 카테고리 stack */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 비서비스 시도 카드 */}
        <div style={{
          background: "var(--app-card-bg)", borderRadius: 12, padding: 16,
          border: "1px solid var(--app-border)",
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 10 }}>
            서비스 불가 문의 — 시도별
          </h3>
          {!data && !error && <div style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>로딩 중...</div>}
          {data && data.unserviceableSidos.length === 0 && (
            <div style={{ color: "var(--app-text-tertiary)", fontSize: 12 }}>없음</div>
          )}
          {data && data.unserviceableSidos.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.unserviceableSidos.map((s) => (
                <SidoBar key={s.sido} sido={s.sido} count={s.count} ratio={s.count / maxUnserviceable} />
              ))}
            </div>
          )}
        </div>

        {/* Top 카테고리 */}
        <div style={{
          background: "var(--app-card-bg)", borderRadius: 12, padding: 16,
          border: "1px solid var(--app-border)", flex: 1,
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, marginBottom: 12 }}>품목 카테고리 Top 10</h3>
          {!data && !error && <div style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>로딩 중...</div>}
          {data && data.topCategories.length === 0 && (
            <div style={{ color: "var(--app-text-tertiary)", fontSize: 13 }}>데이터 없음</div>
          )}
          {data && data.topCategories.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data.topCategories.map((c, i) => (
                <CategoryBar
                  key={c.category}
                  rank={i + 1}
                  category={c.category}
                  count={c.count}
                  ratio={c.count / maxCategoryCount}
                  details={c.details}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span>{label}</span>
    </div>
  );
}

function SidoBar({ sido, count, ratio, muted }: { sido: string; count: number; ratio: number; muted?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <div style={{ flex: 1, position: "relative", height: 18, background: "var(--app-bg-subtle, #f1f5f9)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${Math.max(2, ratio * 100)}%`,
          background: muted ? "#cbd5e1" : "linear-gradient(90deg, #ef4444, #f87171)",
        }} />
        <div style={{
          position: "absolute", top: 0, left: 8, right: 8, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          color: "var(--app-text-primary)", fontWeight: 500,
        }}>
          <span>{sido}</span>
          <span>{count.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

function CategoryBar({ rank, category, count, ratio, details }: {
  rank: number; category: string; count: number; ratio: number; details: CategoryDetail[];
}) {
  const [hover, setHover] = useState(false);
  const detailMax = Math.max(1, ...details.map((d) => d.count));
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span style={{ width: 16, color: "var(--app-text-tertiary)", textAlign: "right" }}>{rank}.</span>
      <div style={{ flex: 1, position: "relative", height: 22, background: "var(--app-bg-subtle, #f1f5f9)", borderRadius: 4, overflow: "hidden", cursor: details.length > 0 ? "help" : "default" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: `${Math.max(2, ratio * 100)}%`,
          background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
          borderRadius: 4,
        }} />
        <div style={{
          position: "absolute", top: 0, left: 8, right: 8, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          color: "var(--app-text-primary)", fontWeight: 500,
        }}>
          <span>{category}</span>
          <span>{count.toLocaleString()}</span>
        </div>
      </div>
      {hover && details.length > 0 && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 100,
          background: "var(--app-card-bg, #fff)", border: "1px solid var(--app-border)",
          borderRadius: 8, padding: 10, minWidth: 320, maxWidth: 420,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>
            {category} 품목 Top {details.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {details.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                <div style={{ flex: 1, position: "relative", height: 16, background: "var(--app-bg-subtle, #f1f5f9)", borderRadius: 3, overflow: "hidden", minWidth: 0 }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, bottom: 0,
                    width: `${(d.count / detailMax) * 100}%`,
                    background: "#93c5fd",
                  }} />
                  <div style={{
                    position: "absolute", top: 0, left: 6, right: 6, bottom: 0,
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    color: "var(--app-text-primary)", gap: 6,
                  }}>
                    <span
                      title={d.name}
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                    >
                      {d.name}
                    </span>
                    <span style={{ color: "var(--app-text-secondary)", flexShrink: 0 }}>{d.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
