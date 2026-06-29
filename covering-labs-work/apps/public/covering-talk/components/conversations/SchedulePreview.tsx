"use client";

import { Loader2 } from "lucide-react";
import {
  BLOCK_ORDER,
  BLOCK_RANGES,
  type TimeBlock,
} from "@/lib/dispatch/time-blocks";

// ─── ABC 잔여 카드만 표시 (리스트/타임라인 없음) ───

export function AbcAvailabilityCards({
  abcData,
  loading,
  size = "compact",
}: {
  abcData: AbcData | null;
  loading: boolean;
  size?: "compact" | "medium";
}) {
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: "12px 0",
          color: "var(--app-text-tertiary)",
          fontSize: 11,
        }}
      >
        <Loader2
          style={{
            width: 12,
            height: 12,
            animation: "spin 1s linear infinite",
          }}
        />
        조회 중...
      </div>
    );
  }

  if (!abcData) return null;

  const t = TOKENS[size === "medium" ? "medium" : "compact"];

  return <ABCBlockCards abcData={abcData} tokens={t} mode={size === "medium" ? "medium" : "compact"} />;
}

// ─── Summary Badge ────────────────────────────────

export function ScheduleSummaryBadge({
  data,
  loading,
  size = "sm",
}: {
  data: ScheduleData | null;
  loading: boolean;
  size?: "sm" | "lg";
}) {
  const pad = size === "lg" ? "3px 10px" : "2px 8px";
  const font = size === "lg" ? 13 : 12;
  const gap = size === "lg" ? 6 : 4;

  if (loading) {
    return (
      <span
        style={{
          fontSize: font,
          fontWeight: 600,
          padding: pad,
          borderRadius: 12,
          backgroundColor: "var(--app-bg)",
          color: "var(--app-text-tertiary)",
        }}
      >
        조회중...
      </span>
    );
  }

  if (!data) return null;

  const empty = data.count === 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {data.totalVolume > 0 && (
        <span
          style={{
            fontSize: font,
            fontWeight: 600,
            padding: pad,
            borderRadius: 12,
            backgroundColor: "var(--app-tag-blue-bg)",
            color: "var(--app-tag-blue-text)",
          }}
        >
          총 {data.totalVolume.toFixed(2)}m³
        </span>
      )}
      {data.lunchCount > 0 && data.totalBoxCount > 0 && (
        <span
          style={{
            fontSize: font,
            fontWeight: 600,
            padding: pad,
            borderRadius: 12,
            backgroundColor: "var(--app-tag-purple-bg, #EDE9FE)",
            color: "var(--app-tag-purple-text, #7C3AED)",
          }}
        >
          런치 {data.lunchCount}건 · {data.totalBoxCount}인분
        </span>
      )}
      <span
        style={{
          fontSize: font,
          fontWeight: 600,
          padding: pad,
          borderRadius: 12,
          backgroundColor: empty
            ? "var(--app-tag-green-bg)"
            : "var(--app-tag-orange-bg)",
          color: empty
            ? "var(--app-tag-green-text)"
            : "var(--app-tag-orange-text)",
        }}
      >
        {empty ? "없음" : `${data.count}건`}
      </span>
    </div>
  );
}

// ─── Types ────────────────────────────────────────

export type ScheduleBooking = {
  type: "visit" | "lunch";
  name: string;
  time: string;
  address: string;
  volume: number;
  boxCount?: number;
  start: number;
  end: number;
  block: TimeBlock | null;
};

export type ScheduleData = {
  date: string;
  count: number;
  visitCount: number;
  lunchCount: number;
  totalVolume: number;
  totalBoxCount: number;
  bookings: ScheduleBooking[];
  gaps: { start: number; end: number; label: string }[];
};

export type AbcData = {
  date: string;
  closed?: boolean;
  blocks: Record<
    TimeBlock,
    {
      count: number;
      ordersCount: number;
      lunchCount: number;
      capacity: number;
      remaining: number;
      available: boolean;
    }
  >;
};

export type SchedulePreviewMode = "compact" | "medium" | "full";

// ─── Tokens (사이즈 분기) ─────────────────────────

const TOKENS: Record<
  SchedulePreviewMode,
  {
    cardPadding: string;
    cardFontTitle: number;
    cardFontCount: number;
    cardFontSub: number;
    cardGap: number;
    listMaxHeight: number;
    listItemPadding: string;
    listFont: number;
    listGap: number;
    sectionHeaderFont: number;
    showSectionGrouping: boolean;
    showProgressBar: boolean;
    gapFont: number;
  }
> = {
  compact: {
    cardPadding: "4px 6px",
    cardFontTitle: 10,
    cardFontCount: 11,
    cardFontSub: 9,
    cardGap: 4,
    listMaxHeight: 140,
    listItemPadding: "4px 8px",
    listFont: 11,
    listGap: 6,
    sectionHeaderFont: 10,
    showSectionGrouping: false,
    showProgressBar: false,
    gapFont: 10,
  },
  medium: {
    cardPadding: "6px 8px",
    cardFontTitle: 11,
    cardFontCount: 13,
    cardFontSub: 10,
    cardGap: 6,
    listMaxHeight: 220,
    listItemPadding: "6px 10px",
    listFont: 13,
    listGap: 8,
    sectionHeaderFont: 11,
    showSectionGrouping: true,
    showProgressBar: false,
    gapFont: 12,
  },
  full: {
    cardPadding: "10px 12px",
    cardFontTitle: 13,
    cardFontCount: 16,
    cardFontSub: 11,
    cardGap: 8,
    listMaxHeight: 360,
    listItemPadding: "10px 14px",
    listFont: 15,
    listGap: 10,
    sectionHeaderFont: 13,
    showSectionGrouping: true,
    showProgressBar: true,
    gapFont: 13,
  },
};

// ─── Main Component ───────────────────────────────

export function SchedulePreview({
  scheduleData,
  abcData,
  loading,
  mode,
}: {
  scheduleData: ScheduleData | null;
  abcData: AbcData | null;
  loading: boolean;
  mode: SchedulePreviewMode;
}) {
  const t = TOKENS[mode];

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: mode === "full" ? "32px 0" : "12px 0",
          color: "var(--app-text-tertiary)",
          fontSize: t.listFont - 2,
        }}
      >
        <Loader2
          style={{
            width: mode === "full" ? 18 : 14,
            height: mode === "full" ? 18 : 14,
            animation: "spin 1s linear infinite",
          }}
        />
        조회 중...
      </div>
    );
  }

  if (!scheduleData) return null;

  return (
    <div>
      {abcData && (
        <ABCBlockCards abcData={abcData} tokens={t} mode={mode} />
      )}

      <Timeline bookings={scheduleData.bookings} mode={mode} />

      {scheduleData.bookings.length > 0 && (
        <BookingList bookings={scheduleData.bookings} tokens={t} mode={mode} />
      )}

      {scheduleData.gaps.length > 0 && (
        <EmptySlots gaps={scheduleData.gaps} tokens={t} mode={mode} />
      )}

      {scheduleData.count === 0 && mode === "full" && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 10,
            backgroundColor: "var(--app-tag-green-bg)",
            border: "1px solid var(--app-border)",
            textAlign: "center",
            fontSize: 14,
            color: "var(--app-tag-green-text)",
            fontWeight: 500,
          }}
        >
          이 날짜는 예약이 없습니다. 전 시간대 예약 가능합니다.
        </div>
      )}
    </div>
  );
}

// ─── ABC Block Cards ──────────────────────────────

function ABCBlockCards({
  abcData,
  tokens,
  mode,
}: {
  abcData: AbcData;
  tokens: (typeof TOKENS)[SchedulePreviewMode];
  mode: SchedulePreviewMode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: tokens.cardGap,
        marginBottom: mode === "full" ? 10 : 8,
      }}
    >
      {BLOCK_ORDER.map((b) => {
        const info = abcData.blocks[b];
        const isFull = !info.available;
        const ratio = info.capacity > 0 ? info.count / info.capacity : 0;
        const color = isFull
          ? "var(--app-tag-red-text, #DC2626)"
          : ratio >= 0.75
            ? "var(--app-tag-orange-text)"
            : "var(--app-tag-green-text)";
        const bg = isFull
          ? "var(--app-tag-red-bg, #FEE2E2)"
          : ratio >= 0.75
            ? "var(--app-tag-orange-bg)"
            : "var(--app-tag-green-bg)";

        return (
          <div
            key={b}
            style={{
              padding: tokens.cardPadding,
              borderRadius: mode === "full" ? 10 : 6,
              backgroundColor: bg,
              border: `${mode === "full" ? 1.5 : 1}px solid ${color}`,
              display: "flex",
              flexDirection: "column",
              gap: mode === "full" ? 4 : 2,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: tokens.cardFontTitle,
                fontWeight: 700,
                color,
              }}
            >
              <span>
                {mode === "compact"
                  ? b
                  : mode === "full"
                    ? `${b}타임`
                    : `${b} ${BLOCK_RANGES[b].label}`}
              </span>
              {(isFull || mode !== "compact") && (
                <span style={{ fontSize: tokens.cardFontSub, fontWeight: 600 }}>
                  {isFull
                    ? "마감"
                    : `${info.remaining}자리${mode === "full" ? " 남음" : ""}`}
                </span>
              )}
            </div>
            {mode === "full" && (
              <div
                style={{ fontSize: tokens.cardFontSub, color, opacity: 0.85 }}
              >
                {BLOCK_RANGES[b].label}
              </div>
            )}
            <div
              style={{ fontSize: tokens.cardFontCount, fontWeight: 700, color }}
            >
              {info.count}
              <span
                style={{
                  fontSize: tokens.cardFontSub,
                  fontWeight: 500,
                  opacity: 0.7,
                }}
              >
                {" "}
                / {info.capacity}
              </span>
            </div>
            {tokens.showProgressBar && (
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "rgba(0,0,0,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, ratio * 100)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Timeline (히트맵) ────────────────────────────

function Timeline({
  bookings,
  mode,
}: {
  bookings: { start: number; end: number }[];
  mode: SchedulePreviewMode;
}) {
  const TIMELINE_START = 8;
  const TIMELINE_END = 22;
  const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START;
  const toPercent = (h: number) =>
    Math.max(0, Math.min(100, ((h - TIMELINE_START) / TIMELINE_HOURS) * 100));
  const ticks = [8, 10, 12, 14, 16, 18, 20, 22];

  const heightBar = mode === "full" ? 22 : mode === "medium" ? 20 : 18;
  const tickHeight = mode === "full" ? 12 : 10;
  const tickFont = mode === "full" ? 9 : 8;

  return (
    <div style={{ marginTop: mode === "compact" ? 0 : 4 }}>
      <div
        style={{
          position: "relative",
          height: heightBar,
          borderRadius: 4,
          backgroundColor: "var(--app-tag-green-bg)",
          border: "1px solid var(--app-border)",
          overflow: "hidden",
        }}
      >
        {bookings.map((b, i) => {
          const left = toPercent(b.start);
          const width = toPercent(b.end) - left;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${left}%`,
                width: `${Math.max(width, 1.5)}%`,
                backgroundColor: "var(--app-tag-orange-text)",
                opacity: 0.7,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "relative", height: tickHeight, marginTop: 1 }}>
        {ticks.map((h) => (
          <span
            key={h}
            style={{
              position: "absolute",
              left: `${toPercent(h)}%`,
              transform: "translateX(-50%)",
              fontSize: tickFont,
              color: "var(--app-text-placeholder)",
            }}
          >
            {h <= 12 ? h : h - 12}
            {h < 12 ? "a" : "p"}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Booking List ─────────────────────────────────

function BookingList({
  bookings,
  tokens,
  mode,
}: {
  bookings: ScheduleBooking[];
  tokens: (typeof TOKENS)[SchedulePreviewMode];
  mode: SchedulePreviewMode;
}) {
  if (tokens.showSectionGrouping) {
    const grouped: Record<TimeBlock | "none", ScheduleBooking[]> = {
      A: [],
      B: [],
      C: [],
      none: [],
    };
    for (const b of bookings) {
      grouped[b.block ?? "none"].push(b);
    }

    return (
      <div
        style={{
          maxHeight: tokens.listMaxHeight,
          overflowY: "auto",
          borderRadius: 8,
          border: "1px solid var(--app-border)",
          marginTop: mode === "full" ? 10 : 6,
        }}
      >
        {BLOCK_ORDER.map((b) => {
          const items = grouped[b];
          if (items.length === 0) return null;
          const lunchN = items.filter((x) => x.type === "lunch").length;
          return (
            <BlockSection
              key={b}
              title={`${b}타임 · ${BLOCK_RANGES[b].label}`}
              count={items.length}
              lunchCount={lunchN}
              items={items}
              tokens={tokens}
            />
          );
        })}
        {grouped.none.length > 0 && (
          <BlockSection
            title="지정 시각 (블록 밖)"
            count={grouped.none.length}
            lunchCount={grouped.none.filter((x) => x.type === "lunch").length}
            items={grouped.none}
            tokens={tokens}
          />
        )}
      </div>
    );
  }

  // Compact 모드 — 평면 리스트 + 블록 prefix 배지
  return (
    <div
      style={{
        maxHeight: tokens.listMaxHeight,
        overflowY: "auto",
        marginTop: 4,
        borderRadius: 6,
        border: "1px solid var(--app-border-light)",
      }}
    >
      {bookings.map((b, i) => (
        <BookingRow
          key={i}
          booking={b}
          tokens={tokens}
          showBlockBadge
          isLast={i === bookings.length - 1}
          alt={i % 2 === 1}
        />
      ))}
    </div>
  );
}

function BlockSection({
  title,
  count,
  lunchCount,
  items,
  tokens,
}: {
  title: string;
  count: number;
  lunchCount: number;
  items: ScheduleBooking[];
  tokens: (typeof TOKENS)[SchedulePreviewMode];
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          backgroundColor: "var(--app-surface-hover)",
          borderBottom: "1px solid var(--app-border-light)",
          fontSize: tokens.sectionHeaderFont,
          fontWeight: 700,
          color: "var(--app-text-secondary)",
          position: "sticky",
          top: 0,
        }}
      >
        <span>{title}</span>
        <span style={{ opacity: 0.6, fontWeight: 500 }}>· {count}건</span>
        {lunchCount > 0 && (
          <span
            style={{
              fontSize: tokens.sectionHeaderFont - 1,
              fontWeight: 600,
              color: "var(--app-tag-purple-text, #7C3AED)",
              backgroundColor: "var(--app-tag-purple-bg, #EDE9FE)",
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            [런치] {lunchCount}
          </span>
        )}
      </div>
      {items.map((b, i) => (
        <BookingRow
          key={i}
          booking={b}
          tokens={tokens}
          isLast={i === items.length - 1}
          alt={i % 2 === 1}
        />
      ))}
    </div>
  );
}

function BookingRow({
  booking,
  tokens,
  showBlockBadge = false,
  isLast,
  alt,
}: {
  booking: ScheduleBooking;
  tokens: (typeof TOKENS)[SchedulePreviewMode];
  showBlockBadge?: boolean;
  isLast: boolean;
  alt: boolean;
}) {
  const isLunch = booking.type === "lunch";
  const dotColor = isLunch
    ? "var(--app-tag-purple-text, #7C3AED)"
    : "var(--app-tag-orange-text)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: tokens.listGap,
        padding: tokens.listItemPadding,
        fontSize: tokens.listFont,
        borderBottom: isLast ? "none" : "1px solid var(--app-border-light)",
        backgroundColor: alt
          ? "var(--app-surface-hover)"
          : "var(--app-surface)",
      }}
    >
      {showBlockBadge && booking.block && (
        <span
          style={{
            fontSize: Math.max(8, tokens.listFont - 3),
            fontWeight: 700,
            color: "var(--app-text-secondary)",
            backgroundColor: "var(--app-bg)",
            padding: "1px 5px",
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          {booking.block}
        </span>
      )}
      {isLunch ? (
        <span
          style={{
            fontSize: Math.max(8, tokens.listFont - 3),
            fontWeight: 700,
            color: "var(--app-tag-purple-text, #7C3AED)",
            backgroundColor: "var(--app-tag-purple-bg, #EDE9FE)",
            padding: "1px 5px",
            borderRadius: 3,
            flexShrink: 0,
          }}
        >
          런치
        </span>
      ) : (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      <span
        style={{
          color: "var(--app-text-secondary)",
          fontWeight: 500,
          minWidth: tokens.listFont >= 14 ? 110 : 90,
          flexShrink: 0,
        }}
      >
        {booking.time}
      </span>
      <span
        style={{
          color: "var(--app-text-primary)",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {booking.name}
      </span>
      {booking.volume > 0 && (
        <span
          style={{
            fontSize: Math.max(10, tokens.listFont - 3),
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 5,
            backgroundColor: "var(--app-tag-blue-bg)",
            color: "var(--app-tag-blue-text)",
            flexShrink: 0,
          }}
        >
          {booking.volume.toFixed(2)}m³
        </span>
      )}
      {booking.boxCount !== undefined && booking.boxCount > 0 && (
        <span
          style={{
            fontSize: Math.max(10, tokens.listFont - 3),
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 5,
            backgroundColor: "var(--app-tag-blue-bg)",
            color: "var(--app-tag-blue-text)",
            flexShrink: 0,
          }}
        >
          {booking.boxCount}인분
        </span>
      )}
      {booking.address && (
        <span
          style={{
            color: "var(--app-text-tertiary)",
            fontSize: Math.max(10, tokens.listFont - 2),
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {booking.address}
        </span>
      )}
    </div>
  );
}

// ─── Empty Slots ──────────────────────────────────

function EmptySlots({
  gaps,
  tokens,
  mode,
}: {
  gaps: { start: number; end: number; label: string }[];
  tokens: (typeof TOKENS)[SchedulePreviewMode];
  mode: SchedulePreviewMode;
}) {
  if (mode === "full") {
    return (
      <div
        style={{
          marginTop: 14,
          padding: "10px 14px",
          borderRadius: 10,
          backgroundColor: "var(--app-tag-green-bg)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--app-tag-green-text)",
            marginBottom: 6,
          }}
        >
          비어있는 시간
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {gaps.map((g, i) => (
            <span
              key={i}
              style={{
                fontSize: tokens.gapFont,
                color: "var(--app-tag-green-text)",
                backgroundColor: "var(--app-surface)",
                padding: "4px 10px",
                borderRadius: 6,
                fontWeight: 500,
              }}
            >
              {g.label}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: mode === "medium" ? 8 : 4,
        display: "flex",
        flexWrap: "wrap",
        gap: mode === "medium" ? 4 : 3,
      }}
    >
      <span
        style={{
          fontSize: tokens.gapFont,
          color: "var(--app-tag-green-text)",
          fontWeight: 600,
        }}
      >
        비어있는 시간:
      </span>
      {gaps.map((g, i) => (
        <span
          key={i}
          style={{
            fontSize: tokens.gapFont,
            color: "var(--app-tag-green-text)",
            backgroundColor: "var(--app-tag-green-bg)",
            padding: mode === "medium" ? "1px 6px" : "0 5px",
            borderRadius: mode === "medium" ? 4 : 3,
          }}
        >
          {g.label}
        </span>
      ))}
    </div>
  );
}
