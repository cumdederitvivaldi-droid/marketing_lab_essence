// [CS-LAB-003] 브랜드메시지 테스트 발송 — DB 기록 없이 1건 즉시 발송 (실험실 — 김원빈/강성진 전용)
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, getRecipients } from "@/lib/store/brand-message";
import { sendBatch } from "@/lib/sweettracker/client";
import type { BrandMessage, BrandMessageButton } from "@/lib/sweettracker/types";

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
  const phone = body.phone as string | undefined;

  if (!phone) {
    return NextResponse.json({ error: "phone 은 필수입니다." }, { status: 400 });
  }

  const campaign = await getCampaignById(id);
  if (!campaign) return NextResponse.json({ error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

  const recipients = await getRecipients({ campaign_id: id, limit: 1 });
  if (recipients.length === 0) {
    return NextResponse.json({ error: "수신자가 없습니다." }, { status: 404 });
  }

  const first = recipients[0];
  const profileKey = process.env.SWEETTRACKER_PROFILE_KEY;
  if (!profileKey) {
    return NextResponse.json({ error: "SWEETTRACKER_PROFILE_KEY 미설정" }, { status: 500 });
  }

  const buttons = first.buttons as BrandMessageButton[] | null;
  const msg: BrandMessage = {
    msgid: `test_${Date.now()}`.slice(0, 20),
    message_type: campaign.message_type as "FT" | "FI" | "FW",
    profile_key: profileKey,
    receiver_num: phone.replace(/[\s\-]/g, ""),
    message: first.message,
    reserved_time: "00000000000000",
    targeting: "M",  // 채널 친구 무관 — 마케팅 동의자 도달 (whitelist 승인된 발신프로필)
    image_url: first.image_url ?? undefined,
    image_link: first.image_link ?? undefined,
    button1: buttons?.[0] ?? undefined,
    button2: buttons?.[1] ?? undefined,
    button3: buttons?.[2] ?? undefined,
    button4: buttons?.[3] ?? undefined,
    button5: buttons?.[4] ?? undefined,
    coupon: first.coupon as BrandMessage["coupon"] ?? undefined,
  };

  const results = await sendBatch([msg]);
  return NextResponse.json({ result: results[0] });
}
