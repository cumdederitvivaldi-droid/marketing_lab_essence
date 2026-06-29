// [CS-LAB-014] 캠페인 복제 — 전화번호만 복사해 새 draft 캠페인 생성
//   원본 캠페인 발송 실패 시 빠른 재시작용. 메시지/이미지/버튼/쿠폰은 빈 상태 → EditModal 로 채워서 발송.
//   새 msgid 자동 생성 (스윗트래커 40일 unique 제약 회피).
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, createCampaign, updateCampaign } from "@/lib/store/brand-message";
import { supabaseAdmin } from "@/lib/supabase/client";

export const maxDuration = 60;

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

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const newLabel = typeof body.label === "string" ? body.label.trim() : null;

  const src = await getCampaignById(id);
  if (!src) return NextResponse.json({ error: "원본 캠페인을 찾을 수 없습니다" }, { status: 404 });

  // 원본 모든 phone 조회 (sent_at 무관 — 진본 phone 리스트 그대로)
  const phones: string[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("brand_message_recipients")
      .select("phone")
      .eq("campaign_id", id)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: `phone 조회 실패: ${error.message}` }, { status: 500 });
    if (!data || data.length === 0) break;
    for (const r of data) if (r.phone) phones.push(r.phone as string);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  if (phones.length === 0) {
    return NextResponse.json({ error: "원본 캠페인에 phone 이 없습니다" }, { status: 400 });
  }

  // dedupe (정확히 같은 phone 중복 제거)
  const uniquePhones = [...new Set(phones)];

  // 새 draft 캠페인 생성
  const newCampaign = await createCampaign({
    label: newLabel ?? `${src.label} (재시도)`,
    group_tag: src.group_tag ?? undefined,
    message_type: src.message_type,
    excel_filename: src.excel_filename ?? undefined,
    notes: `원본 캠페인 #${id} 의 phone 만 복사 (${uniquePhones.length}건). 메시지/이미지/버튼/쿠폰 EditModal 로 채워야 발송 가능.`,
    created_by: user.name,
    total_count: uniquePhones.length,
  });

  if (!newCampaign) {
    return NextResponse.json({ error: "새 캠페인 생성 실패" }, { status: 500 });
  }

  // recipients INSERT — 1000건 chunk 로
  const newCampaignShortId = newCampaign.id.replace(/-/g, "").slice(0, 8);
  let inserted = 0;
  for (let i = 0; i < uniquePhones.length; i += PAGE) {
    const chunk = uniquePhones.slice(i, i + PAGE);
    const records = chunk.map((phone, idx) => {
      const rand = crypto.randomBytes(3).toString("hex");
      const rowIdx = i + idx;
      // msgid 형식: {8자prefix}_{6자hex}_{rowIdx} — 20자 이내, unique
      const msgid = `${newCampaignShortId}_${rand}_${rowIdx}`.slice(0, 20);
      return {
        campaign_id: newCampaign.id,
        phone,
        msgid,
        message: "",  // EditModal 로 채워야 함
        image_url: null,
        image_link: null,
        buttons: null,
        coupon: null,
      };
    });
    const { error } = await supabaseAdmin.from("brand_message_recipients").insert(records);
    if (error) {
      // 부분 성공 — 일부만 들어간 상태에서 실패. campaign 은 남기고 에러 반환.
      return NextResponse.json(
        { error: `recipients INSERT 실패 (${inserted}/${uniquePhones.length}): ${error.message}`, partial_campaign_id: newCampaign.id },
        { status: 500 }
      );
    }
    inserted += chunk.length;
  }

  // total_count 확정
  await updateCampaign(newCampaign.id, { total_count: inserted });

  return NextResponse.json({
    ok: true,
    new_campaign_id: newCampaign.id,
    new_campaign_label: newCampaign.label,
    phones_copied: inserted,
    source_campaign_id: id,
  });
}
