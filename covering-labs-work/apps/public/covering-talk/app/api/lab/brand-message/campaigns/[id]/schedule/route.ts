// [CS-LAB-005] 브랜드메시지 예약발송 등록 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, updateCampaign } from "@/lib/store/brand-message";

export async function POST(
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
  const body = await req.json().catch(() => ({}));
  const scheduled_at = body.scheduled_at as string | undefined;

  if (!scheduled_at) {
    return NextResponse.json({ error: "scheduled_at 은 필수입니다. (ISO 8601)" }, { status: 400 });
  }

  const scheduledDate = new Date(scheduled_at);
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "scheduled_at 형식이 잘못되었습니다." }, { status: 400 });
  }
  if (scheduledDate <= new Date()) {
    return NextResponse.json({ error: "scheduled_at 은 현재 시각 이후여야 합니다." }, { status: 400 });
  }
  // 5분 단위 정렬 — brand-message-scheduler cron 이 */5 로 실행. 분 단위가 5의 배수가
  //   아니면 다음 cron 까지 최대 4분 대기 발생. 입력값을 5분 floor 로 정규화.
  const minutes = scheduledDate.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  if (minutes !== roundedMinutes) {
    scheduledDate.setMinutes(roundedMinutes, 0, 0);
  } else {
    scheduledDate.setSeconds(0, 0);
  }

  const campaign = await getCampaignById(id);
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

  if (campaign.status !== "draft") {
    return NextResponse.json(
      { error: `draft 상태만 예약 가능합니다. 현재: ${campaign.status}` },
      { status: 409 }
    );
  }

  const updated = await updateCampaign(id, {
    status: "scheduled",
    scheduled_at: scheduledDate.toISOString(),
  });

  return NextResponse.json({ campaign: updated });
}
