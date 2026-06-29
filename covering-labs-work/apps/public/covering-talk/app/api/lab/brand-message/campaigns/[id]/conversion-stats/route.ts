// [CS-LAB-017] 브랜드메시지 캠페인 전환 통계 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById } from "@/lib/store/brand-message";
import { supabaseAdmin } from "@/lib/supabase/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) {
    return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });
  }

  const window_end = campaign.started_at
    ? new Date(new Date(campaign.started_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const base = () =>
    supabaseAdmin
      .from("brand_message_recipients")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", id);

  const [totalSentRes, convertedRes] = await Promise.all([
    base().not("sent_at", "is", null).in("result_code", ["K000", "M000"]),
    base().not("converted_at", "is", null),
  ]);

  if (totalSentRes.error) {
    return NextResponse.json({ error: totalSentRes.error.message }, { status: 500 });
  }

  const total_sent = totalSentRes.count ?? 0;
  const converted = convertedRes.count ?? 0;
  const conversion_rate = total_sent > 0 ? Math.round((converted / total_sent) * 1000) / 10 : 0;

  // 평균 전환 시간 + 최근 50건 sample
  const { data: convertedRows, error: rowsErr } = await supabaseAdmin
    .from("brand_message_recipients")
    .select("phone, sent_at, converted_at, converted_session_id")
    .eq("campaign_id", id)
    .not("converted_at", "is", null)
    .order("converted_at", { ascending: false })
    .limit(50);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  let avg_conversion_hours: number | null = null;
  if (convertedRows && convertedRows.length > 0) {
    const diffs = convertedRows
      .filter((r) => r.sent_at && r.converted_at)
      .map((r) => (new Date(r.converted_at).getTime() - new Date(r.sent_at).getTime()) / (1000 * 60 * 60));
    if (diffs.length > 0) {
      avg_conversion_hours = Math.round((diffs.reduce((a, b) => a + b, 0) / diffs.length) * 10) / 10;
    }
  }

  return NextResponse.json({
    campaign_id: id,
    label: campaign.label,
    group_tag: campaign.group_tag,
    started_at: campaign.started_at,
    window_end,
    total_sent,
    converted,
    conversion_rate,
    avg_conversion_hours,
    converted_orders: convertedRows ?? [],
  });
}
