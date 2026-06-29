// [CS-LAB-006] 브랜드메시지 캠페인 취소 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, updateCampaign } from "@/lib/store/brand-message";

export async function POST(
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

  if (campaign.status !== "scheduled" && campaign.status !== "sending") {
    return NextResponse.json(
      { error: `scheduled 또는 sending 상태만 취소 가능합니다. 현재: ${campaign.status}` },
      { status: 409 }
    );
  }

  const updated = await updateCampaign(id, { status: "cancelled" });
  return NextResponse.json({ campaign: updated });
}
