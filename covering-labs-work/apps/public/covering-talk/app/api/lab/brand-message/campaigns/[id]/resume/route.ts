// [CS-LAB-013] 브랜드메시지 분산 발송 재개 — sending/failed/cancelled 캠페인에서 다음 1000건 즉시 발송
import { NextRequest, NextResponse, after } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, updateCampaign } from "@/lib/store/brand-message";
import { runSendBatchOnce } from "@/lib/sweettracker/runner";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let user;
  try {
    user = await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  void user;

  const body = await req.json().catch(() => ({}));
  const rawBatchSize = body.batch_size_per_invocation;
  const batchSize: number =
    typeof rawBatchSize === "number"
      ? Math.min(5000, Math.max(100, rawBatchSize))
      : 1000;

  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

  const { status } = campaign;
  if (status !== "sending" && status !== "failed" && status !== "cancelled") {
    return NextResponse.json(
      { error: `resume 은 sending / failed / cancelled 상태에서만 가능합니다. 현재: ${status}` },
      { status: 409 }
    );
  }

  // cancelled 이면 sending 으로 전환 후 진행
  if (status === "cancelled") {
    await updateCampaign(id, { status: "sending" });
  }

  // Next.js after() — 응답 후에도 백그라운드 작업 보장 (fire-and-forget X)
  after(async () => {
    try {
      await runSendBatchOnce(id, batchSize);
    } catch (err) {
      console.error(`[brand-message] resume 실패 campaign=${id}:`, err);
    }
  });

  return NextResponse.json(
    { resumed: true, campaign_id: id, batch_size_per_invocation: batchSize, will_continue_via_cron: true },
    { status: 202 }
  );
}
