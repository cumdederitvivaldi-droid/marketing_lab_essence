// [CS-LAB-007] 브랜드메시지 캠페인 수신자 목록 페이징 조회 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, getRecipients } from "@/lib/store/brand-message";

export async function GET(
  req: NextRequest,
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

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") as "pending" | "sent" | "failed" | null;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const recipients = await getRecipients({
    campaign_id: id,
    status: statusParam ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json({ recipients, limit, offset });
}
