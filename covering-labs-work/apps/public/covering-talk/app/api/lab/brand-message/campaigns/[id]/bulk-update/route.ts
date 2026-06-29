// [CS-LAB-011] 브랜드메시지 캠페인 내 수신자 메시지 내용 일괄 수정 (전화번호 제외, 같은 내용 적용)
//   status='draft' 인 경우에만 허용 — 발송 이후 변경 금지.
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { getCampaignById, bulkUpdateRecipientsContent } from "@/lib/store/brand-message";
import type { BrandMessageButton, BrandMessageCoupon } from "@/lib/sweettracker/types";

interface BulkUpdateBody {
  message?: string;
  image_url?: string | null;
  image_link?: string | null;
  buttons?: BrandMessageButton[] | null;
  coupon?: BrandMessageCoupon | null;
}

export async function PATCH(
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

  if (campaign.status !== "draft") {
    return NextResponse.json(
      { error: `발송 시작/예약 후엔 수정 불가. 현재: ${campaign.status}` },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as BulkUpdateBody;

  // 적어도 한 필드는 있어야
  const hasAny = ["message", "image_url", "image_link", "buttons", "coupon"].some(
    (k) => k in body
  );
  if (!hasAny) {
    return NextResponse.json({ error: "수정할 필드가 없습니다." }, { status: 400 });
  }

  if (typeof body.message === "string" && body.message.trim().length === 0) {
    return NextResponse.json({ error: "메시지 본문을 비울 수 없습니다." }, { status: 400 });
  }

  // FW 76자 / FI 1300자 검증
  if (typeof body.message === "string") {
    const limit = campaign.message_type === "FW" ? 76 : 1300;
    if (body.message.length > limit) {
      return NextResponse.json(
        { error: `${campaign.message_type} 타입은 ${limit}자 이하여야 합니다. 현재 ${body.message.length}자.` },
        { status: 400 }
      );
    }
  }

  try {
    const updated = await bulkUpdateRecipientsContent(id, {
      message: body.message,
      image_url: body.image_url,
      image_link: body.image_link,
      buttons: body.buttons,
      coupon: body.coupon,
    });
    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
