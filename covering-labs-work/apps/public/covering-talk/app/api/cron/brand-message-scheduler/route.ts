// [CS-LAB-008] 브랜드메시지 예약발송 스케줄러 — 1분마다 Vercel Cron 실행
// scheduled + scheduled_at 도래 → 발송 시작 / sending 상태 → 이어서 1000건 발송
import { NextResponse } from "next/server";
import { listCampaigns, getCampaignById, updateCampaign } from "@/lib/store/brand-message";
import { runSendBatchOnce } from "@/lib/sweettracker/runner";

export const maxDuration = 300;

export async function GET(): Promise<NextResponse> {
  const now = new Date();

  // 1) scheduled + due 캠페인
  const scheduledList = await listCampaigns({ status: "scheduled" });
  const dueCampaigns = scheduledList.filter(
    (c) => c.scheduled_at && new Date(c.scheduled_at) <= now
  );

  // 2) sending 중인 캠페인 (미완료 — 이어서 발송 필요)
  const sendingList = await listCampaigns({ status: "sending" });

  // 우선순위: scheduled(due) 먼저, 그 다음 sending — 가장 오래된 것 1개만
  // cron 1회에 1개 캠페인만 처리 (Vercel 5분 한계)
  const allCandidates = [
    ...dueCampaigns,
    ...sendingList,
  ].sort((a, b) => {
    const ta = a.started_at ?? a.scheduled_at ?? a.created_at;
    const tb = b.started_at ?? b.scheduled_at ?? b.created_at;
    return new Date(ta).getTime() - new Date(tb).getTime();
  });

  if (allCandidates.length === 0) {
    return NextResponse.json({ triggered: 0 });
  }

  const target = allCandidates[0];

  // 재확인 — 레이스 컨디션 방지
  const fresh = await getCampaignById(target.id);
  if (!fresh) return NextResponse.json({ triggered: 0 });
  if (fresh.status !== "scheduled" && fresh.status !== "sending") {
    return NextResponse.json({ triggered: 0 });
  }

  // scheduled → sending 으로 전환 (시작 시각 기록)
  if (fresh.status === "scheduled") {
    await updateCampaign(target.id, {
      status: "sending",
      started_at: new Date().toISOString(),
    });
  }

  try {
    const result = await runSendBatchOnce(target.id, 1000);
    return NextResponse.json({ triggered: 1, campaign_id: target.id, ...result });
  } catch (err) {
    console.error(`[brand-message-scheduler] 캠페인 ${target.id} 발송 실패:`, err);
    return NextResponse.json(
      { triggered: 1, campaign_id: target.id, error: String(err) },
      { status: 500 }
    );
  }
}
