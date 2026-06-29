"use client";

import { useEffect, useMemo, useState } from "react";
import { useCsRealtimePresenceContext } from "@/lib/hooks/CsRealtimePresenceContext";
import type { CsRealtimePresence, CsSystem } from "@/lib/hooks/useCsRealtimePresence";
import { WorkHistoryModal } from "./WorkHistoryModal";

interface ApiResponse {
  generatedAt: string;
  throughput: { visit: number; lunch: number; channeltalk: number; total: number };
  firstResponseMedian: { visit: number; lunch: number; channeltalk: number | null; visitCount: number; lunchCount: number };
  aiBreakdown: {
    visit: AiBucket; lunch: AiBucket; channeltalk: AiBucket; total: AiBucket;
  };
  queueDepth: { visit: number; lunch: number; channeltalk: number | null };
  overnight: { visit: number; lunch: number };
  operators: Array<{
    name: string;
    systems: string[];
    /** 오늘 KST 하루 전체(00–24) distinct 세션 수 (전 시스템 합) */
    todayConsultCount: number;
    /** 오늘 KST 하루 전체(00–24) 총 답변 메시지 수 (전 시스템 합) */
    todayReplyCount: number;
    todayAiAuto: number;
    todayAiAssist: number;
    todayHuman: number;
    todayMedianRespMs: number;
    /** 시스템별 분리 — 카드에서 방/런/채 표 형태로 표시 */
    todayBySystem: {
      visit: { consults: number; replies: number };
      lunch: { consults: number; replies: number };
      channeltalk: { consults: number; replies: number };
    };
    /** 오늘 KST 08–22 운영시간 내 distinct 1분 bucket = 근무 분 */
    onlineMinutesToday: number;
    /** 24시간 내 마지막 답변 시각 — presence 채널에 없어도 (데스크앱/모바일) 최근 답변자는 active 표시 */
    lastReplyAt: number | null;
    /** cs_presence_log 의 오늘 MAX(recorded_at) — DB 진본. presence 채널 stale 시 폴백 */
    lastActivityAt: number | null;
  }>;
}
interface AiBucket { ai_auto: number; ai_assist: number; human: number; total: number }

const SYSTEM_LABEL: Record<CsSystem, string> = {
  visit: "방문수거",
  lunch: "런치",
  channeltalk: "채널톡",
  admin: "관리자",
  idle: "—",
};

const LEVEL_COLOR: Record<"online" | "idle" | "away" | "offline", string> = {
  online: "#22C55E",
  idle: "#F59E0B",
  away: "#94A3B8",
  offline: "#475569",
};

function formatMs(ms: number): string {
  if (ms <= 0) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return s > 0 ? `${min}분 ${s}초` : `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// 무활동 시간을 사람이 읽는 표기로. 1분 미만은 "방금" 처리.
function formatInactiveDuration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// 분 단위를 "N시간 M분" 표기로. 0분이면 "0분".
function formatWorkMinutes(min: number): string {
  if (min <= 0) return "0분";
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

export function CsRealtimeSection() {
  const { viewers } = useCsRealtimePresenceContext();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // 10초마다 KPI 재조회 — 답변 보낸 직후도 빠르게 반영. 1초마다 presence level 재계산용 tick.
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      setLoading(true);
      fetch("/api/new_dashboard/cs-realtime", { cache: "no-store" })
        .then((r) => r.json())
        .then((res: ApiResponse & { error?: string }) => {
          if (cancelled) return;
          if (res.error) { setError(res.error); setData(null); return; }
          setError(null);
          setData(res);
        })
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Unknown error"))
        .finally(() => !cancelled && setLoading(false));
    };
    fetchOnce();
    // 30초 폴링 — 10초였을 때 cs-realtime endpoint 가 매 호출당 messages/lunch_messages/cs_presence_log
    //   24h 또는 오늘치 전체 SELECT → Supabase 부하 큰 비중. 30초로 늘려도 운영 모니터링 무리 없음.
    const t = setInterval(fetchOnce, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  const aiAutomationPct = useMemo(() => {
    const t = data?.aiBreakdown.total;
    if (!t || t.total === 0) return null;
    return Math.round(((t.ai_auto + t.ai_assist) / t.total) * 100);
  }, [data]);

  return (
    <div style={{
      background: "var(--app-card-bg)", borderRadius: 12, padding: 16,
      border: "1px solid var(--app-border)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>CS Realtime — 실시간 상담 운영 현황</h3>
        <span style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
          KPI 10초 / Presence 실시간 · 운영시간 KST 08–22시 기준
        </span>
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 13, padding: 8 }}>오류: {error}</div>}
      {!data && !error && (
        <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, padding: 12 }}>
          {loading ? "로딩 중..." : "데이터 없음"}
        </div>
      )}

      {data && (
        <>
          {/* ─── 헤더 KPI 4 카드 ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <KpiCard
              label="대기 중 큐"
              primary={
                (data.queueDepth.visit + data.queueDepth.lunch + (data.queueDepth.channeltalk ?? 0)).toLocaleString()
              }
              sub={`방문 ${data.queueDepth.visit} · 런치 ${data.queueDepth.lunch} · 채널톡 ${data.queueDepth.channeltalk ?? "—"}`}
              color="#F59E0B"
            />
            <KpiCard
              label="시간당 답변 (1h)"
              primary={data.throughput.total.toLocaleString()}
              sub={`방문 ${data.throughput.visit} · 런치 ${data.throughput.lunch} · 채널톡 ${data.throughput.channeltalk}`}
              color="#1AA3FF"
            />
            <KpiCard
              label="응답 중위값 (30분, 운영시간)"
              primary={
                (() => {
                  const v = data.firstResponseMedian.visit;
                  const l = data.firstResponseMedian.lunch;
                  const all = [v, l].filter((x) => x > 0);
                  return all.length ? formatMs(Math.round(all.reduce((a, b) => a + b, 0) / all.length)) : "—";
                })()
              }
              sub={`방문 ${data.firstResponseMedian.visit > 0 ? formatMs(data.firstResponseMedian.visit) : "—"} · 런치 ${data.firstResponseMedian.lunch > 0 ? formatMs(data.firstResponseMedian.lunch) : "—"}`}
              color="#20C997"
            />
            <KpiCard
              label="AI 자동화율 (24h)"
              primary={aiAutomationPct === null ? "—" : `${aiAutomationPct}%`}
              sub={`auto ${data.aiBreakdown.total.ai_auto} · assist ${data.aiBreakdown.total.ai_assist} · human ${data.aiBreakdown.total.human}`}
              color="#A855F7"
            />
          </div>

          {/* ─── 시스템별 분포 + Overnight ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
            <SystemBreakdown data={data} />
            <OvernightCard overnight={data.overnight} />
          </div>

          {/* ─── 상담사 카드 그리드 ─── */}
          <PresenceGrid viewers={viewers} operators={data.operators} tick={tick} />
        </>
      )}
    </div>
  );
}

function KpiCard({ label, primary, sub, color }: { label: string; primary: string; sub: string; color: string }) {
  return (
    <div style={{
      background: "var(--app-surface)", borderRadius: 10, padding: "12px 14px",
      border: "1px solid var(--app-border-light)",
      display: "flex", flexDirection: "column", gap: 4, minHeight: 78,
    }}>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1.1 }}>{primary}</div>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>{sub}</div>
    </div>
  );
}

function SystemBreakdown({ data }: { data: ApiResponse }) {
  const rows: Array<{ key: CsSystem; label: string; queue: number | null; throughput: number; ai: AiBucket }> = [
    { key: "visit", label: "방문수거", queue: data.queueDepth.visit, throughput: data.throughput.visit, ai: data.aiBreakdown.visit },
    { key: "lunch", label: "런치", queue: data.queueDepth.lunch, throughput: data.throughput.lunch, ai: data.aiBreakdown.lunch },
    { key: "channeltalk", label: "채널톡", queue: data.queueDepth.channeltalk, throughput: data.throughput.channeltalk, ai: data.aiBreakdown.channeltalk },
  ];
  return (
    <div style={{
      background: "var(--app-surface)", borderRadius: 10, padding: "12px 14px",
      border: "1px solid var(--app-border-light)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>시스템별 분포</div>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "var(--app-text-tertiary)" }}>
            <th style={{ textAlign: "left", padding: "4px 0" }}>시스템</th>
            <th style={{ textAlign: "right", padding: "4px 0" }}>큐</th>
            <th style={{ textAlign: "right", padding: "4px 0" }}>1h 답변</th>
            <th style={{ textAlign: "right", padding: "4px 0" }}>AI / 사람 (24h)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const aiPct = r.ai.total > 0 ? Math.round(((r.ai.ai_auto + r.ai.ai_assist) / r.ai.total) * 100) : null;
            return (
              <tr key={r.key} style={{ borderTop: "1px solid var(--app-border-light)" }}>
                <td style={{ padding: "6px 0" }}>{r.label}</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>{r.queue ?? "—"}</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>{r.throughput}</td>
                <td style={{ padding: "6px 0", textAlign: "right" }}>
                  {r.ai.total === 0 ? "—" : `${aiPct}% / ${r.ai.total}건`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OvernightCard({ overnight }: { overnight: { visit: number; lunch: number } }) {
  const total = overnight.visit + overnight.lunch;
  return (
    <div style={{
      background: "var(--app-surface)", borderRadius: 10, padding: "12px 14px",
      border: "1px solid var(--app-border-light)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🌙 새벽 큐 처리 흔적 (24h)</div>
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)", marginBottom: 6 }}>
        응답까지 1시간 이상 걸린 답변 — 새벽 누적 큐 처리량 근사값
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{total}</div>
          <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>총 건수</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--app-text-secondary)" }}>
          방문 <strong>{overnight.visit}</strong> · 런치 <strong>{overnight.lunch}</strong>
        </div>
      </div>
    </div>
  );
}

function PresenceGrid({
  viewers,
  operators,
  tick,
}: {
  viewers: CsRealtimePresence[];
  operators: ApiResponse["operators"];
  tick: number;
}) {
  const [historyTarget, setHistoryTarget] = useState<string | null>(null);
  // 합집합 — presence 와 24h 답변기록 둘 다 있는 상담사를 묶음
  // (오프라인이지만 답변 기록 있음 / 온라인이지만 아직 답변 없음 모두 표시)
  void tick;
  const allNames = useMemo(() => {
    const set = new Set<string>();
    for (const v of viewers) set.add(v.name);
    for (const o of operators) if (o.name && o.name !== "(미지정)") set.add(o.name);
    return [...set];
  }, [viewers, operators]);

  const now = Date.now();
  const rows = allNames.map((name) => {
    const presence = viewers.find((v) => v.name === name);
    const op = operators.find((o) => o.name === name);
    // 활동시간 진본: max(presence 채널, DB heartbeat) — presence 채널 stale 시 DB 가 폴백
    const lastAt = Math.max(presence?.lastActiveAt ?? 0, op?.lastActivityAt ?? 0);
    let presenceLevel: "online" | "idle" | "away" | "offline";
    if (lastAt === 0) presenceLevel = "offline";
    else {
      const elapsed = now - lastAt;
      if (elapsed < 5 * 60_000) presenceLevel = "online";
      else if (elapsed < 15 * 60_000) presenceLevel = "idle";
      else presenceLevel = "away";
    }
    // presence 채널에 없어도 5분 이내 답변기록 있으면 online 으로 승격
    // (채널톡 데스크앱 / 해피톡 콘솔 / 모바일로 답변하는 상담사 케이스)
    const recentReplyMs = op?.lastReplyAt ? now - op.lastReplyAt : Infinity;
    const level = presenceLevel !== "online" && recentReplyMs < 5 * 60_000 ? "online" : presenceLevel;
    return { name, presence, op, level };
  })
  .sort((a, b) => {
    // 1차 정렬: online > idle > away > offline (온라인 상담사가 항상 위)
    const order = { online: 0, idle: 1, away: 2, offline: 3 } as const;
    if (order[a.level] !== order[b.level]) return order[a.level] - order[b.level];
    // 2차: 오늘 답변 많은 순, 3차: 오늘 근무시간 긴 순
    const aToday = a.op?.todayReplyCount ?? 0;
    const bToday = b.op?.todayReplyCount ?? 0;
    if (aToday !== bToday) return bToday - aToday;
    return (b.op?.onlineMinutesToday ?? 0) - (a.op?.onlineMinutesToday ?? 0);
  });

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        상담사 현황 ({rows.length}명)
        <span style={{ fontSize: 10, color: "var(--app-text-tertiary)", fontWeight: 400, marginLeft: 6 }}>
          · 카드 클릭 → 일별 근무 기록
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
        {rows.map((r) => (
          <PresenceCard key={r.name} {...r} onOpenHistory={() => setHistoryTarget(r.name)} />
        ))}
        {rows.length === 0 && (
          <div style={{ color: "var(--app-text-tertiary)", fontSize: 13, padding: 12 }}>표시할 상담사가 없습니다</div>
        )}
      </div>
      <WorkHistoryModal
        open={historyTarget !== null}
        counselor={historyTarget ?? ""}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}

function PresenceCard({
  name,
  presence,
  op,
  level,
  onOpenHistory,
}: {
  name: string;
  presence?: CsRealtimePresence;
  op?: ApiResponse["operators"][number];
  level: "online" | "idle" | "away" | "offline";
  onOpenHistory: () => void;
}) {
  const dotColor = LEVEL_COLOR[level];
  // presence 가 있으면 그 system, 없는데 level=online (외부 도구 답변) 이면 라벨로 안내
  const sysLabel = presence ? SYSTEM_LABEL[presence.system] : level === "online" ? "외부 도구 답변" : "오프라인";

  const consultCount = op?.todayConsultCount ?? 0;
  const replyCount = op?.todayReplyCount ?? 0;
  const workMin = op?.onlineMinutesToday ?? 0;
  const aiAuto = op?.todayAiAuto ?? 0;
  const aiAssist = op?.todayAiAssist ?? 0;
  const human = op?.todayHuman ?? 0;
  const medianRespMs = op?.todayMedianRespMs ?? 0;
  const bs = op?.todayBySystem ?? {
    visit: { consults: 0, replies: 0 },
    lunch: { consults: 0, replies: 0 },
    channeltalk: { consults: 0, replies: 0 },
  };

  // 5분 이상 무활동 시 "X분 동작없음" 표기, 그 외엔 라벨 생략.
  // 활동시간 진본: max(presence.lastActiveAt, op.lastActivityAt) — presence 채널 stale 시 DB heartbeat 가 폴백.
  const inactiveLabel = (() => {
    const presenceAt = presence?.lastActiveAt ?? 0;
    const dbAt = op?.lastActivityAt ?? 0;
    const lastAt = Math.max(presenceAt, dbAt);
    if (lastAt === 0) {
      // presence 도 없고 DB 도 없음 → 외부 도구 답변 여부만 확인
      if (level === "online" && op?.lastReplyAt) {
        return `${formatInactiveDuration(Date.now() - op.lastReplyAt)} 전 답변`;
      }
      return "오프라인";
    }
    const inactiveMs = Date.now() - lastAt;
    if (inactiveMs < 5 * 60_000) return null; // online — 표시 안 함
    return `${formatInactiveDuration(inactiveMs)} 동작없음`;
  })();

  return (
    <button
      type="button"
      onClick={onOpenHistory}
      title={`${name} 상담 기록 보기`}
      style={{
        background: "var(--app-surface)", border: "1px solid var(--app-border-light)",
        borderRadius: 10, padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: 6,
        textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
        transition: "border-color 0.15s, background-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--app-accent)";
        e.currentTarget.style.backgroundColor = "var(--app-surface-secondary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--app-border-light)";
        e.currentTarget.style.backgroundColor = "var(--app-surface)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700 }}>{name}</span>
        {inactiveLabel && (
          <span style={{ fontSize: 10, color: "var(--app-text-tertiary)", marginLeft: "auto" }}>
            {inactiveLabel}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--app-text-secondary)" }}>
        {sysLabel}
        {presence && presence.page && (
          <span style={{ color: "var(--app-text-tertiary)" }}> · {presence.page}</span>
        )}
      </div>
      {/* 시스템별 상담 / 답변 mini-table */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto repeat(4, 1fr)",
        gap: "2px 6px",
        fontSize: 11, color: "var(--app-text-tertiary)",
        fontVariantNumeric: "tabular-nums",
      }}>
        <div></div>
        <div style={{ textAlign: "right" }}>방문</div>
        <div style={{ textAlign: "right" }}>런치</div>
        <div style={{ textAlign: "right" }}>채널</div>
        <div style={{ textAlign: "right", color: "var(--app-text-secondary)", fontWeight: 600 }}>합</div>

        <div>상담</div>
        <div style={{ textAlign: "right", color: bs.visit.consults > 0 ? "var(--app-text-primary)" : undefined }}>{bs.visit.consults}</div>
        <div style={{ textAlign: "right", color: bs.lunch.consults > 0 ? "var(--app-text-primary)" : undefined }}>{bs.lunch.consults}</div>
        <div style={{ textAlign: "right", color: bs.channeltalk.consults > 0 ? "var(--app-text-primary)" : undefined }}>{bs.channeltalk.consults}</div>
        <div style={{ textAlign: "right", fontWeight: 700, color: "var(--app-text-primary)" }}>{consultCount}</div>

        <div>답변</div>
        <div style={{ textAlign: "right", color: bs.visit.replies > 0 ? "var(--app-text-primary)" : undefined }}>{bs.visit.replies}</div>
        <div style={{ textAlign: "right", color: bs.lunch.replies > 0 ? "var(--app-text-primary)" : undefined }}>{bs.lunch.replies}</div>
        <div style={{ textAlign: "right", color: bs.channeltalk.replies > 0 ? "var(--app-text-primary)" : undefined }}>{bs.channeltalk.replies}</div>
        <div style={{ textAlign: "right", fontWeight: 700, color: "var(--app-text-primary)" }}>{replyCount}</div>
      </div>
      {(aiAuto + aiAssist + human > 0 || medianRespMs > 0) && (
        <div style={{ display: "flex", gap: 8, fontSize: 10, color: "var(--app-text-tertiary)", flexWrap: "wrap" }}>
          {aiAuto + aiAssist + human > 0 && (
            <>
              <span>auto {aiAuto}</span>
              <span>assist {aiAssist}</span>
              <span>human {human}</span>
            </>
          )}
          {medianRespMs > 0 && <span>중위 {formatMs(medianRespMs)}</span>}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--app-text-tertiary)" }}>
        오늘 근무 <strong style={{ color: "var(--app-text-secondary)" }}>{formatWorkMinutes(workMin)}</strong>
        <span style={{ color: "var(--app-text-placeholder)", marginLeft: 4 }}>· KST 08–22</span>
      </div>
    </button>
  );
}
