import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { classifyComplaints, type ComplaintInput } from "@/lib/dashboard/complaint-classify";

// [CS-CRON-011] 고객 불만 사전 분류 — 최근 7일 user 메시지 중 미분류만 Haiku 배치 분류 후 캐시.
//
// 캐시 키: (session_id, message_id) PK + UPSERT — 같은 메시지 두 번 분류 방지.
// 호출 한도: 최대 300건/회 (BATCH_SIZE=30 × MAX_BATCHES=10) → Vercel 60초 안에 끝남.
// 5분 cron 으로 dashboard 진입 시 거의 항상 캐시 hit.

export const maxDuration = 60;

const LOOKBACK_DAYS = 7;
const MIN_CONTENT_LEN = 6;

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  const fromIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  try {
    // 1. 최근 7일 user 메시지 (6자+)
    const userMsgs = await paginate<{ id: string; session_id: string; content: string; created_at: string }>(() =>
      supabase
        .from("messages")
        .select("id, session_id, content, created_at")
        .eq("role", "user")
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false }),
    );
    const filtered = userMsgs.filter((m) => (m.content?.trim().length ?? 0) >= MIN_CONTENT_LEN);
    if (filtered.length === 0) {
      return NextResponse.json({ ok: true, scanned: 0, durationMs: Date.now() - startedAt });
    }

    // 2. 캐시 hit 인 메시지 제외 — (session_id, message_id) 페어를 청크로 조회
    const sessionIds = [...new Set(filtered.map((m) => m.session_id))];
    const CHUNK = 500;
    const cachedKeys = new Set<string>();
    for (let i = 0; i < sessionIds.length; i += CHUNK) {
      const chunk = sessionIds.slice(i, i + CHUNK);
      const rows = await paginate<{ session_id: string; message_id: string }>(() =>
        supabase
          .from("dashboard_complaints")
          .select("session_id, message_id")
          .in("session_id", chunk),
      );
      for (const r of rows) cachedKeys.add(`${r.session_id}|${r.message_id}`);
    }
    const uncached = filtered.filter((m) => !cachedKeys.has(`${m.session_id}|${m.id}`));
    if (uncached.length === 0) {
      return NextResponse.json({ ok: true, scanned: filtered.length, classified: 0, durationMs: Date.now() - startedAt });
    }

    // 3. 분류 (BATCH_SIZE × MAX_BATCHES 한도는 classifyComplaints 내부에서 자동 적용 → 호출당 최대 300건)
    const inputs: ComplaintInput[] = uncached.map((m) => ({
      sessionId: m.session_id,
      messageId: m.id,
      content: m.content,
      messageCreatedAt: m.created_at,
      bookingConfirmedAt: null,
    }));
    const { classified } = await classifyComplaints(inputs);

    return NextResponse.json({
      ok: true,
      scanned: filtered.length,
      cached: cachedKeys.size,
      uncached: uncached.length,
      classified: classified.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/classify-complaints] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
