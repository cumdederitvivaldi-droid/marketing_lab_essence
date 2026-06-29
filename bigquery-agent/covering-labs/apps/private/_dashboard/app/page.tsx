'use client';

import { useState, useEffect, useCallback } from 'react';

interface AppInfo {
  name: string;
  displayName: string;
  description: string;
  type: string;
  port: number | null;
  status: string;
  env: 'private' | 'public';
}

type EnvFilter = 'all' | 'private' | 'public';

const PRIVATE_HOST = 'labs.covering.app';
const PUBLIC_HOST = 'public-labs.covering.app';

function envBadgeStyle(env: 'private' | 'public'): React.CSSProperties {
  if (env === 'public') {
    return { background: '#164e63', color: '#67e8f9', fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.03em' };
  }
  return { background: '#312e81', color: '#a5b4fc', fontSize: 10, padding: '2px 6px', borderRadius: 3, fontWeight: 600, letterSpacing: '0.03em' };
}

interface BatchInfo {
  name: string;
  displayName: string;
  description: string;
  schedule: string;
  scheduleHuman: string;
  command: string;
  lastLines: string[];
  lastLogAt: string | null;
  enabled: boolean;
  logFiles: string[];
}

const STATUS_COLOR: Record<string, string> = {
  online: '#22c55e',
  stopped: '#f59e0b',
  stopping: '#f59e0b',
  errored: '#ef4444',
  unknown: '#64748b',
};

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.unknown;
  return (
    <span
      style={{
        display: 'inline-block', width: 10, height: 10,
        borderRadius: '50%', background: color, flexShrink: 0,
      }}
    />
  );
}

function formatTime(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const BASE = '/_dashboard';

export default function Dashboard() {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [appsAt, setAppsAt] = useState('');
  const [batchesAt, setBatchesAt] = useState('');
  const [loadingApps, setLoadingApps] = useState(true);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [envFilter, setEnvFilter] = useState<EnvFilter>('all');

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/status`);
      const data = await res.json();
      setApps(data.apps ?? []);
      setAppsAt(data.updatedAt ?? '');
      setPublicError(data.publicError ?? null);
    } catch {}
    setLoadingApps(false);
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/batches`);
      const data = await res.json();
      setBatches(data.batches ?? []);
      setBatchesAt(data.updatedAt ?? '');
    } catch {}
    setLoadingBatches(false);
  }, []);

  useEffect(() => {
    fetchApps();
    fetchBatches();
    const t1 = setInterval(fetchApps, 30_000);
    const t2 = setInterval(fetchBatches, 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchApps, fetchBatches]);

  const onToggle = async (name: string, currentEnabled: boolean) => {
    const desired = currentEnabled ? 'off' : 'on';
    // Optimistic 하지 않고 서버 응답만 믿음 (정확성 우선)
    try {
      const res = await fetch(`${BASE}/api/batches/${encodeURIComponent(name)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desired }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'toggle failed');
      setBatches(prev => prev.map(b => b.name === name ? { ...b, enabled: data.enabled } : b));
    } catch (err) {
      alert(`토글 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', minHeight: '100vh' }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
          🖥️ Covering Labs 모니터링
        </h1>
        <p style={{ color: '#475569', fontSize: 13 }}>앱 실행 현황 · 배치 스케줄 · 로그</p>
      </div>

      {/* Apps Section */}
      <section style={{ marginBottom: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            실행 중인 앱
          </h2>
          <span style={{ fontSize: 12, color: '#334155' }}>
            {appsAt ? `${formatTime(appsAt)} 갱신 · 30초 주기` : '로딩 중...'}
          </span>
        </div>

        {/* env filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['all', 'private', 'public'] as EnvFilter[]).map(f => {
            const count = f === 'all' ? apps.length : apps.filter(a => a.env === f).length;
            const active = envFilter === f;
            const label = f === 'all' ? '전체' : f === 'private' ? 'Private' : 'Public';
            return (
              <button
                key={f}
                onClick={() => setEnvFilter(f)}
                style={{
                  background: active ? '#1e293b' : 'transparent',
                  color: active ? '#f1f5f9' : '#64748b',
                  border: `1px solid ${active ? '#334155' : '#1e293b'}`,
                  borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
                }}
              >
                {label} <span style={{ opacity: 0.6, fontSize: 11 }}>({count})</span>
              </button>
            );
          })}
        </div>

        {publicError && (
          <div style={{ background: '#7f1d1d22', border: '1px solid #7f1d1d55', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 12 }}>
            Public VM 상태 조회 실패 ({publicError}) — private 앱만 표시됩니다. public VM cron 의 publish-public-status.sh 확인 필요.
          </div>
        )}

        {loadingApps ? (
          <p style={{ color: '#475569', fontSize: 14 }}>불러오는 중...</p>
        ) : (() => {
          const filtered = envFilter === 'all' ? apps : apps.filter(a => a.env === envFilter);
          if (filtered.length === 0) {
            return (
              <div style={{ background: '#1e293b', borderRadius: 8, padding: 24, color: '#475569', fontSize: 14 }}>
                실행 중인 앱이 없습니다.
              </div>
            );
          }
          return (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {filtered.map(app => {
                const appHost = app.env === 'public' ? PUBLIC_HOST : PRIVATE_HOST;
                return (
                  <div
                    key={`${app.env}:${app.name}`}
                    style={{
                      background: '#1e293b', borderRadius: 8, padding: 20,
                      border: `1px solid ${app.status === 'errored' ? '#7f1d1d' : '#1e293b'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: app.description ? 6 : 14 }}>
                      <StatusDot status={app.status} />
                      <span style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>{app.displayName}</span>
                      <span style={envBadgeStyle(app.env)}>{app.env === 'public' ? 'PUBLIC' : 'PRIVATE'}</span>
                    </div>
                    {app.description && (
                      <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>{app.description}</p>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                      <Row label="타입" value={<span style={{ background: '#0f172a', padding: '2px 8px', borderRadius: 4, color: '#94a3b8' }}>{app.type}</span>} />
                      {app.port && <Row label="포트" value={<span style={{ color: '#94a3b8' }}>{app.port}</span>} />}
                      <Row label="상태" value={<span style={{ color: STATUS_COLOR[app.status] ?? STATUS_COLOR.unknown }}>{app.status}</span>} />
                    </div>
                    {app.port && (
                      <a href={`https://${appHost}/${app.name}`} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-block', marginTop: 14, fontSize: 13, color: '#60a5fa', textDecoration: 'none' }}>
                        접속하기 ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* Batches Section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            배치 현황
          </h2>
          <span style={{ fontSize: 12, color: '#334155' }}>
            {batchesAt ? `${formatTime(batchesAt)} 갱신 · 60초 주기` : '로딩 중...'}
          </span>
        </div>

        {loadingBatches ? (
          <p style={{ color: '#475569', fontSize: 14 }}>불러오는 중...</p>
        ) : batches.length === 0 ? (
          <div style={{ background: '#1e293b', borderRadius: 8, padding: 24, color: '#475569', fontSize: 14 }}>
            등록된 배치 작업이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {batches.map(batch => (
              <BatchCard key={batch.name} batch={batch} onToggle={onToggle} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BatchCard({ batch, onToggle }: { batch: BatchInfo; onToggle: (name: string, enabled: boolean) => Promise<void> }) {
  const [toggling, setToggling] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>(batch.logFiles.includes('batch.log') ? 'batch.log' : (batch.logFiles[0] ?? ''));
  const [tailN, setTailN] = useState(50);
  const [customLines, setCustomLines] = useState<string[] | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const displayedLines = customLines ?? batch.lastLines;
  const hasCustomFileOrTail = selectedFile !== 'batch.log' || tailN !== 50 || customLines !== null;

  const handleToggle = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle(batch.name, batch.enabled);
    } finally {
      setToggling(false);
    }
  };

  const loadLogs = useCallback(async () => {
    if (!selectedFile) return;
    setLogLoading(true);
    setLogError(null);
    try {
      const res = await fetch(`${BASE}/api/batches/${encodeURIComponent(batch.name)}/log?file=${encodeURIComponent(selectedFile)}&tail=${tailN}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'load failed');
      setCustomLines(data.lines ?? []);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogLoading(false);
    }
  }, [batch.name, selectedFile, tailN]);

  // 선택 변경 시 자동 재조회
  useEffect(() => {
    if (hasCustomFileOrTail) void loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, tailN]);

  const statusBadgeBg = batch.enabled ? '#14532d' : '#334155';
  const statusBadgeFg = batch.enabled ? '#86efac' : '#94a3b8';
  const statusBadgeText = batch.enabled ? '실행중' : '중단중';

  return (
    <div style={{
      background: '#1e293b', borderRadius: 8, padding: 20,
      border: `1px solid ${batch.enabled ? '#1e293b' : '#334155'}`,
      opacity: batch.enabled ? 1 : 0.7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: batch.description ? 6 : 12, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <StatusDot status={batch.enabled ? 'online' : 'stopped'} />
          <span style={{ fontWeight: 600, fontSize: 15, color: '#f1f5f9' }}>{batch.displayName}</span>
          <span style={{ background: statusBadgeBg, color: statusBadgeFg, fontSize: 11, padding: '2px 8px', borderRadius: 4 }}>
            {statusBadgeText}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{batch.scheduleHuman}</span>
          <button
            onClick={handleToggle}
            disabled={toggling}
            style={{
              background: batch.enabled ? '#334155' : '#0f766e',
              color: batch.enabled ? '#cbd5e1' : '#a7f3d0',
              border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600,
              cursor: toggling ? 'not-allowed' : 'pointer',
              opacity: toggling ? 0.5 : 1,
              minWidth: 72,
            }}
          >
            {toggling ? '처리중…' : (batch.enabled ? '중단' : '재개')}
          </button>
        </div>
      </div>
      {batch.description && (
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.5 }}>{batch.description}</p>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', fontSize: 12, color: '#64748b', marginBottom: 12 }}>
        <span>스케줄:&nbsp;<code style={{ color: '#94a3b8', background: '#0f172a', padding: '1px 6px', borderRadius: 3 }}>{batch.schedule}</code></span>
        {batch.command && <span>명령:&nbsp;<code style={{ color: '#94a3b8', background: '#0f172a', padding: '1px 6px', borderRadius: 3 }}>{batch.command}</code></span>}
        {batch.lastLogAt && <span>최근 로그: {formatTime(batch.lastLogAt)}</span>}
      </div>

      {/* Log controls */}
      {batch.logFiles.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
          <label style={{ color: '#64748b' }}>파일:
            <select
              value={selectedFile}
              onChange={e => { setSelectedFile(e.target.value); setCustomLines(null); }}
              style={{ marginLeft: 6, background: '#0f172a', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px' }}>
              {batch.logFiles.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label style={{ color: '#64748b' }}>tail:
            <select
              value={tailN}
              onChange={e => { setTailN(Number(e.target.value)); setCustomLines(null); }}
              style={{ marginLeft: 6, background: '#0f172a', color: '#cbd5e1', border: '1px solid #334155', borderRadius: 4, padding: '2px 6px' }}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </label>
          <button
            onClick={loadLogs}
            disabled={logLoading}
            style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, padding: '2px 10px', cursor: logLoading ? 'wait' : 'pointer', fontSize: 12 }}>
            {logLoading ? '새로고침중…' : '↻ 새로고침'}
          </button>
          {logError && <span style={{ color: '#fca5a5' }}>{logError}</span>}
        </div>
      )}

      {/* Log preview */}
      {displayedLines.length > 0 ? (
        <div style={{ background: '#0f172a', borderRadius: 4, padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, maxHeight: 280, overflowY: 'auto' }}>
          {displayedLines.map((line, i) => (
            <div key={i} style={{ color: isErrorLine(line) ? '#fca5a5' : '#64748b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{line}</div>
          ))}
        </div>
      ) : (
        <div style={{ background: '#0f172a', borderRadius: 4, padding: '10px 12px', color: '#475569', fontSize: 12 }}>
          {batch.logFiles.length === 0 ? '아직 로그 파일이 없습니다 (첫 실행 전).' : '표시할 로그가 없습니다.'}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569' }}>
      <span style={{ minWidth: 40 }}>{label}</span>
      {value}
    </div>
  );
}

function isErrorLine(line: string): boolean {
  if (/^\s*"[^"]+"\s*:/.test(line)) return false;
  if (/\b(ERROR|CRITICAL|FATAL)\b/.test(line)) return true;
  if (/^Traceback\b/.test(line)) return true;
  if (/\b\w+(Error|Exception):\s/.test(line)) return true;
  return false;
}
