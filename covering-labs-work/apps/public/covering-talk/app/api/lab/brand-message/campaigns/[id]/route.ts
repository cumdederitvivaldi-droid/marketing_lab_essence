// [CS-LAB-002] 브랜드메시지 캠페인 상세 조회 / 삭제 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import {
  getCampaignById,
  deleteCampaign,
  getCampaignStats,
  getRecipients,
} from "@/lib/store/brand-message";

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
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

  const [stats, recipients] = await Promise.all([
    getCampaignStats(id),
    getRecipients({ campaign_id: id, limit: 50 }),
  ]);

  return NextResponse.json({ campaign, stats, recipients });
}

export async function DELETE(
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
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

  if (campaign.status !== "draft" && campaign.status !== "cancelled") {
    return NextResponse.json(
      { error: `draft 또는 cancelled 상태만 삭제 가능합니다. 현재: ${campaign.status}` },
      { status: 409 }
    );
  }

  await deleteCampaign(id);
  return NextResponse.json({ deleted: true });
}
