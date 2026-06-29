// [CS-LAB-016] 브랜드메시지 전환 추적 — 5분 Vercel Cron, 발송 후 7일 내 orders 매칭
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { backfillConversions } from "@/lib/store/brand-message";

export const maxDuration = 60;

export async function GET(): Promise<NextResponse> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: campaigns, error } = await supabaseAdmin
    .from("brand_message_campaigns")
    .select("id, label, started_at")
    .in("status", ["sending", "completed"])
    .not("started_at", "is", null)
    .gte("started_at", sevenDaysAgo)
    .order("started_at", { ascending: true })
    .limit(12);

  if (error) {
    console.error("[brand-message-conversion] 캠페인 조회 실패:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const results: { campaign_id: string; label: string; matched: number }[] = [];
  for (const c of campaigns) {
    try {
      const { matched } = await backfillConversions(c.id);
      results.push({ campaign_id: c.id, label: c.label, matched });
      console.log(`[brand-message-conversion] ${c.label} → ${matched}건 전환`);
    } catch (err) {
      console.error(`[brand-message-conversion] ${c.id} 처리 실패:`, err);
    }
  }

  return NextResponse.json({ processed: campaigns.length, results });
}
