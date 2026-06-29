// [CS-LAB-015] 실패 row 재발송 준비 — sent_at/result 초기화 + msgid 재생성 (40일 unique 회피)
//   default: 모든 실패 (성공 K000/M000 제외 전부)
//   옵션: codes 배열로 특정 코드만 (예: ["E109"] = race condition 만)
//   호출 후 resume 또는 send-now 로 발송 시 새 msgid 로 재시도
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById } from "@/lib/store/brand-message";
import { supabaseAdmin } from "@/lib/supabase/client";

export const maxDuration = 300;

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
  const body = (await req.json().catch(() => ({}))) as { codes?: string[] };

  const campaign = await getCampaignById(id);
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다" }, { status: 404 });

  // 진행 중인 캠페인은 reset 금지 (race 위험)
  if (campaign.status === "sending") {
    return NextResponse.json(
      { error: "발송 중에는 reset 할 수 없습니다. 먼저 cancel 하세요." },
      { status: 409 }
    );
  }

  // 매칭할 row 조회 (id + 기존 msgid)
  const targetCodes = body.codes && body.codes.length > 0 ? body.codes : null;

  let query = supabaseAdmin
    .from("brand_message_recipients")
    .select("id, msgid")
    .eq("campaign_id", id)
    .not("sent_at", "is", null);

  if (targetCodes) {
    // 특정 코드만 매칭
    query = query.in("result_code", targetCodes);
  } else {
    // 모든 실패 (성공 코드 제외)
    query = query.not("result_code", "in", "(K000,M000)");
  }

  // 1000건씩 페이징 (대량 캠페인 대응)
  const allRows: { id: string; msgid: string }[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: `매칭 row 조회 실패: ${error.message}` }, { status: 500 });
    if (!data || data.length === 0) break;
    allRows.push(...data.map((r) => ({ id: r.id as string, msgid: r.msgid as string })));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (allRows.length === 0) {
    return NextResponse.json({ ok: true, reset_count: 0, message: "재발송할 실패 row 가 없습니다" });
  }

  // row 별 새 msgid 생성 + UPDATE — chunk 내 병렬 (DB row-level, sweettracker API 무관)
  const shortId = id.replace(/-/g, "").slice(0, 8);
  const UPDATE_CHUNK = 100;
  let resetCount = 0;
  let resetIdx = 0;

  for (let i = 0; i < allRows.length; i += UPDATE_CHUNK) {
    const chunk = allRows.slice(i, i + UPDATE_CHUNK);

    const updates = chunk.map((row) => {
      const rand = crypto.randomBytes(3).toString("hex");
      const myIdx = resetIdx++;
      const newMsgid = `${shortId}_${rand}_r${myIdx}`.slice(0, 20);
      return supabaseAdmin
        .from("brand_message_recipients")
        .update({
          sent_at: null,
          result_code: null,
          result_message: null,
          origin_code: null,
          origin_error: null,
          msgid: newMsgid,
        })
        .eq("id", row.id);
    });

    const results = await Promise.all(updates);
    for (const r of results) {
      if (r.error) {
        return NextResponse.json(
          {
            error: `reset 실패 (chunk i=${i}): ${r.error.message}`,
            partial_reset_count: resetCount,
          },
          { status: 500 }
        );
      }
      resetCount++;
    }
  }

  // 캠페인 상태 정상화 — failed/cancelled/completed → draft 로 (다시 발송 가능 상태)
  if (
    campaign.status === "failed" ||
    campaign.status === "cancelled" ||
    campaign.status === "completed"
  ) {
    await supabaseAdmin
      .from("brand_message_campaigns")
      .update({ status: "draft", started_at: null, completed_at: null })
      .eq("id", id);
  }

  return NextResponse.json({
    ok: true,
    reset_count: resetCount,
    target_codes: targetCodes ?? "(모든 실패)",
    new_status:
      campaign.status === "failed" ||
      campaign.status === "cancelled" ||
      campaign.status === "completed"
        ? "draft"
        : campaign.status,
  });
}
