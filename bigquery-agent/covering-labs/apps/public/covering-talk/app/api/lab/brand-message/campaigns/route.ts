// [CS-LAB-001] 브랜드메시지 캠페인 목록 조회 / 신규 생성 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import {
  createCampaign,
  listCampaigns,
  bulkInsertRecipients,
  updateCampaign,
  getCampaignStatsBatch,
} from "@/lib/store/brand-message";
import { parseSweetTrackerExcel } from "@/lib/sweettracker/excel-parser";
import { generateMsgid } from "@/lib/sweettracker/msgid";

export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // include_revenue 가 1 일 때만 전환 매출(orders.total_price 합산) 계산.
  //   매출 계산은 캠페인당 추가 쿼리 1~N 회 발생하므로 빈번한 폴링 시 부하.
  //   클라이언트는 mount/refresh 에서만 1로 호출, 짧은 polling 에는 0(생략).
  const includeRevenue = req.nextUrl.searchParams.get("include_revenue") === "1";

  const campaigns = await listCampaigns({ limit: 50 });

  // 캠페인 N개의 카운트 통계를 단일 RPC 호출로 일괄 산출 (기존 N×5 쿼리 → 1쿼리).
  let statsMap;
  try {
    statsMap = await getCampaignStatsBatch(
      campaigns.map((c) => c.id),
      { skipRevenue: !includeRevenue },
    );
  } catch (err) {
    console.error("[campaigns] stats batch 실패 — fallback 0:", err);
    statsMap = new Map<string, ReturnType<typeof Map.prototype.get>>();
  }

  const enriched = campaigns.map((c) => {
    const stats = statsMap.get(c.id);
    if (!stats) return c;
    return {
      ...c,
      total_count: stats.total,
      sent_count: stats.sent,
      failed_count: stats.failed,
      converted_count: stats.converted,
      converted_revenue: stats.converted_revenue,
    };
  });

  return NextResponse.json({ campaigns: enriched });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let user;
  try {
    user = await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const label = formData.get("label") as string | null;
  const group_tag = formData.get("group_tag") as string | null;
  const message_type = (formData.get("message_type") as string | null) ?? "FW";
  const notes = formData.get("notes") as string | null;
  const excelFile = formData.get("excel_file") as File | null;

  if (!label) {
    return NextResponse.json({ error: "label 은 필수입니다." }, { status: 400 });
  }
  if (!excelFile) {
    return NextResponse.json({ error: "excel_file 은 필수입니다." }, { status: 400 });
  }

  const arrayBuffer = await excelFile.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const parsed = parseSweetTrackerExcel(buffer);

  if (parsed.length === 0) {
    return NextResponse.json({ error: "엑셀에서 수신자를 찾을 수 없습니다." }, { status: 400 });
  }

  // 캠페인 생성
  const campaign = await createCampaign({
    label,
    group_tag: group_tag ?? undefined,
    message_type,
    created_by: user.name,
    excel_filename: excelFile.name,
    notes: notes ?? undefined,
    total_count: parsed.length,
  });

  // 수신자 bulk insert
  const shortId = campaign.id.replace(/-/g, "").slice(0, 8);
  const inserted = await bulkInsertRecipients(
    campaign.id,
    parsed,
    (rowIdx) => generateMsgid(shortId, rowIdx)
  );

  // total_count 확정
  await updateCampaign(campaign.id, { total_count: inserted });

  // FW 텍스트 초과 경고 카운트
  const wideWarnCount = parsed.filter((r) => r.wideMessageTooLong).length;

  const preview = parsed.slice(0, 3).map((r) => ({
    phone: r.phone.slice(0, 3) + "****" + r.phone.slice(-4),
    message: r.message.slice(0, 30) + (r.message.length > 30 ? "…" : ""),
    isWide: r.isWide,
  }));

  return NextResponse.json(
    {
      campaign_id: campaign.id,
      recipient_count: inserted,
      preview,
      warnings: wideWarnCount > 0
        ? [`FW 타입에서 76자 초과 메시지 ${wideWarnCount}건 — 발송 전 확인 필요`]
        : [],
    },
    { status: 201 }
  );
}
