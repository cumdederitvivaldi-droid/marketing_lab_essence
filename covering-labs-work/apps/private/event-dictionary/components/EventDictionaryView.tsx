'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Database, ListFilter, Search } from 'lucide-react';
import type { BqOnlyEvent, EventDefinition, EventDictionaryData } from '../lib/types';

type ViewMode = 'list' | 'funnel' | 'bq-only';

const TYPE_COLORS: Record<string, string> = {
  ROUTE: '#3b82f6',
  CLICK: '#22c55e',
  MODAL: '#f97316',
  EVENT: '#a855f7',
  VIEW: '#ec4899',
};

const OWNER_COLORS: Record<string, string> = {
  클라이언트: '#0ea5e9',
  서버: '#f59e0b',
};

interface Props {
  data: EventDictionaryData;
}

export default function EventDictionaryView({ data }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [owner, setOwner] = useState('all');
  const [view, setView] = useState<ViewMode>('list');

  const categories = useMemo(() => unique(data.events.map((event) => event.category)), [data.events]);
  const owners = useMemo(() => unique(data.events.map((event) => event.owner).filter(Boolean)), [data.events]);
  const filteredEvents = useMemo(
    () => data.events.filter((event) => matchesEvent(event, query, category, owner)),
    [category, data.events, owner, query],
  );
  const groupedEvents = useMemo(() => groupByCategory(filteredEvents), [filteredEvents]);
  const filteredBqOnlyEvents = useMemo(
    () => data.bqOnlyEvents.filter((event) => matchesBqOnlyEvent(event, query)),
    [data.bqOnlyEvents, query],
  );
  const active7d = useMemo(
    () => data.events.filter((event) => event.count7d > 0).length,
    [data.events],
  );

  const selectedCount = filteredEvents.length;

  return (
    <main className="page-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <p className="eyebrow">Covering Labs</p>
          <h1>이벤트 딕셔너리</h1>
          <p className="subtle">시트 정의와 BigQuery 최근 7일 발화 수</p>
        </div>

        <div className="search-box">
          <label htmlFor="event-search">검색</label>
          <div className="search-input-wrap">
            <Search aria-hidden="true" size={16} />
            <input
              id="event-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이벤트명, 설명, 프로퍼티"
            />
          </div>
        </div>

        <nav className="category-nav" aria-label="카테고리">
          <button
            aria-pressed={category === 'all'}
            className={category === 'all' ? 'nav-item active' : 'nav-item'}
            onClick={() => setCategory('all')}
            type="button"
          >
            <span>전체</span>
            <strong>{data.events.length}</strong>
          </button>
          {categories.map((item) => {
            const count = data.events.filter((event) => event.category === item).length;
            return (
              <button
                aria-pressed={category === item}
                className={category === item ? 'nav-item active' : 'nav-item'}
                key={item}
                onClick={() => setCategory(item)}
                type="button"
              >
                <span>{item}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
          <button
            aria-pressed={view === 'bq-only'}
            className={view === 'bq-only' ? 'nav-item warning active' : 'nav-item warning'}
            onClick={() => setView('bq-only')}
            type="button"
          >
            <span>BQ only</span>
            <strong>{data.bqOnlyEvents.length}</strong>
          </button>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Private app</p>
            <h2>이벤트 정의 운영판</h2>
            <p className="subtle">
              {data.sheetTitle ? `${data.sheetTitle} 시트` : '시트 제목 없음'} · {formatKst(data.updatedAt)} 갱신
            </p>
          </div>
          <div className="view-tabs" aria-label="보기 방식">
            <button aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} type="button">
              <ListFilter aria-hidden="true" size={15} />
              목록
            </button>
            <button aria-pressed={view === 'funnel'} className={view === 'funnel' ? 'active' : ''} onClick={() => setView('funnel')} type="button">
              <BarChart3 aria-hidden="true" size={15} />
              퍼널
            </button>
            <button aria-pressed={view === 'bq-only'} className={view === 'bq-only' ? 'active' : ''} onClick={() => setView('bq-only')} type="button">
              <Database aria-hidden="true" size={15} />
              BQ only
            </button>
          </div>
        </header>

        <section className="metrics" aria-label="요약 지표">
          <Metric label="정의 이벤트" value={data.events.length} />
          <Metric label="현재 범위" value={selectedCount} />
          <Metric label="최근 7일 발화" value={active7d} />
          <Metric label="BQ only" value={data.bqOnlyEvents.length} tone="warning" />
        </section>

        {data.warnings.length > 0 && (
          <div className="warning-panel">
            {data.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        <div className="filter-row" aria-label="소유자 필터">
          <button aria-pressed={owner === 'all'} className={owner === 'all' ? 'active' : ''} onClick={() => setOwner('all')} type="button">
            전체
          </button>
          {owners.map((item) => (
            <button aria-pressed={owner === item} className={owner === item ? 'active' : ''} key={item} onClick={() => setOwner(item)} type="button">
              {item}
            </button>
          ))}
        </div>

        {view === 'list' && (
          <section className="list-view">
            {filteredEvents.length === 0 ? (
              <EmptyState text="조건에 맞는 이벤트 정의가 없습니다." />
            ) : (
              Object.entries(groupedEvents).map(([group, events]) => (
                <section className="event-section" key={group}>
                  <div className="section-title">
                    <h3>{group}</h3>
                    <span>{events.length}개</span>
                  </div>
                  <div className="event-list">
                    {events.map((event) => (
                      <EventCard event={event} key={event.id} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </section>
        )}

        {view === 'funnel' && (
          <section className="funnel-view">
            {Object.entries(groupedEvents).map(([group, events]) => (
              <button
                className="funnel-step"
                key={group}
                onClick={() => {
                  setCategory(group);
                  setView('list');
                }}
                type="button"
              >
                <div className="funnel-head">
                  <strong>{group}</strong>
                  <span>{events.length}개</span>
                </div>
                <div className="type-row">
                  {Object.entries(countBy(events.map((event) => event.type))).map(([type, count]) => (
                    <span className="type-chip" key={type} style={{ background: TYPE_COLORS[type] ?? '#64748b' }}>
                      {type} {count}
                    </span>
                  ))}
                </div>
                <div className="funnel-events">
                  {events.slice(0, 8).map((event) => (
                    <span key={event.id}>{event.name}</span>
                  ))}
                  {events.length > 8 && <em>+{events.length - 8}개 더</em>}
                </div>
              </button>
            ))}
          </section>
        )}

        {view === 'bq-only' && (
          <section className="bq-only-view">
            <div className="section-title">
              <h3>시트 미등록 이벤트</h3>
              <span>{filteredBqOnlyEvents.length}개</span>
            </div>
            {filteredBqOnlyEvents.length === 0 ? (
              <EmptyState text="조건에 맞는 BQ only 이벤트가 없습니다." />
            ) : (
              <div className="event-list">
                {filteredBqOnlyEvents.map((event) => (
                  <BqOnlyCard event={event} key={event.name} />
                ))}
              </div>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className={tone === 'warning' ? 'metric warning' : 'metric'}>
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function EventCard({ event }: { event: EventDefinition }) {
  return (
    <article className="event-card">
      <div className="event-card-top">
        {event.owner && (
          <span className="owner-badge" style={{ background: OWNER_COLORS[event.owner] ?? '#475569' }}>
            {event.owner}
          </span>
        )}
        <span className="type-badge" style={{ background: TYPE_COLORS[event.type] ?? '#64748b' }}>
          {event.type}
        </span>
        <strong>{event.name}</strong>
        <span className="count-badge">{formatNumber(event.count7d)}회/7d</span>
      </div>
      {event.description && <p className="description">{event.description}</p>}
      {event.properties && (
        <div className="properties">
          <span>Properties</span>
          <pre>{event.properties}</pre>
        </div>
      )}
      {event.comments.length > 0 && (
        <details className="comments">
          <summary>코멘트 {event.comments.length}개</summary>
          <div>
            {event.comments.map((comment, index) => (
              <p key={`${event.id}-${index}`}>
                <strong>{comment.author}</strong>
                {comment.text}
              </p>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function BqOnlyCard({ event }: { event: BqOnlyEvent }) {
  return (
    <article className="event-card bq-only-card">
      <div className="event-card-top">
        <span className="type-badge muted">{event.type}</span>
        <strong>{event.name}</strong>
        <span className="count-badge">{formatNumber(event.count7d)}회/7d</span>
      </div>
      <p className="description">시트 정의에 아직 매칭되지 않은 BigQuery 이벤트입니다.</p>
      {event.normalizedName !== event.name && <p className="normalized">정규화 이름: {event.normalizedName}</p>}
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function matchesEvent(event: EventDefinition, query: string, category: string, owner: string) {
  if (category !== 'all' && event.category !== category) {
    return false;
  }
  if (owner !== 'all' && event.owner !== owner) {
    return false;
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [
    event.name,
    event.description,
    event.properties,
    event.category,
    event.owner,
    event.type,
    ...event.comments.map((comment) => comment.text),
  ].join(' ').toLowerCase().includes(normalizedQuery);
}

function matchesBqOnlyEvent(event: BqOnlyEvent, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return `${event.name} ${event.normalizedName} ${event.type}`.toLowerCase().includes(normalizedQuery);
}

function groupByCategory(events: EventDefinition[]) {
  return events.reduce<Record<string, EventDefinition[]>>((acc, event) => {
    acc[event.category] = acc[event.category] ?? [];
    acc[event.category].push(event);
    return acc;
  }, {});
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

function formatKst(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
