// [CS-LAB-004] 브랜드메시지 즉시 발송 시작 — 비동기 202 반환, 1000건씩 분산 발송
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById } from "@/lib/store/brand-message";
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
  if (body.confirm !== "SEND_NOW_AGREED") {
    return NextResponse.json(
      { error: 'confirm 필드에 "SEND_NOW_AGREED" 를 포함해야 발송됩니다.' },
      { status: 400 }
    );
  }

  const rawBatchSize = body.batch_size_per_invocation;
  const batchSize: number =
    typeof rawBatchSize === "number"
      ? Math.min(5000, Math.max(100, rawBatchSize))
      : 1000;

  const { id } = await params;
  const campaign = await getCampaignById(id);
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return NextResponse.json(
      { error: `draft 또는 scheduled 상태만 발송 가능합니다. 현재: ${campaign.status}` },
      { status: 409 }
    );
  }

  // Next.js after() — 응답 즉시 반환 후에도 백그라운드 작업 보장 실행 (fire-and-forget X — Vercel 함수가 응답 후 죽는 문제 회피)
  after(async () => {
    try {
      await runSendBatchOnce(id, batchSize);
    } catch (err) {
      console.error(`[brand-message] send-now 실패 campaign=${id}:`, err);
    }
  });

  return NextResponse.json(
    { started: true, campaign_id: id, batch_size_per_invocation: batchSize, will_continue_via_cron: true },
    { status: 202 }
  );
}
