// [CS-LAB-009] 브랜드메시지 다이렉트 테스트 발송 — 캠페인 / Excel 없이 1건 즉시 발송 (실험실 — 김원빈/강성진 전용)
//
// 캠페인 본 발송 전에 메시지 형식 / 이미지 / 버튼 / 쿠폰이 카카오톡에 어떻게 보이는지 미리 확인하기 위함.
// 절대 DB 기록 X, 단발 직접 호출.
import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { sendBatch } from "@/lib/sweettracker/client";
import type { BrandMessage, BrandMessageType, BrandMessageButton, BrandMessageCoupon } from "@/lib/sweettracker/types";

interface DirectTestBody {
  phone: string;
  message_type: BrandMessageType;
  message: string;
  image_url?: string;
  image_link?: string;
  buttons?: BrandMessageButton[];
  coupon?: BrandMessageCoupon;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: (e as Error).message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<DirectTestBody>;

  if (!body.phone) return NextResponse.json({ error: "phone 은 필수입니다." }, { status: 400 });
  if (!body.message) return NextResponse.json({ error: "message 는 필수입니다." }, { status: 400 });
  if (!body.message_type || !["FT", "FI", "FW"].includes(body.message_type)) {
    return NextResponse.json({ error: "message_type 은 FT/FI/FW 중 하나여야 합니다." }, { status: 400 });
  }
  if ((body.message_type === "FI" || body.message_type === "FW") && !body.image_url) {
    return NextResponse.json({ error: `${body.message_type} 타입은 image_url 이 필수입니다.` }, { status: 400 });
  }
  if (body.message_type === "FW" && body.message.length > 76) {
    return NextResponse.json({ error: `FW(와이드) 타입 메시지는 76자 이하여야 합니다. 현재: ${body.message.length}자` }, { status: 400 });
  }

  const profileKey = process.env.SWEETTRACKER_PROFILE_KEY;
  if (!profileKey) return NextResponse.json({ error: "SWEETTRACKER_PROFILE_KEY 미설정" }, { status: 500 });

  const buttons = body.buttons ?? [];
  const msg: BrandMessage = {
    msgid: `direct_${Date.now()}`.slice(0, 20),
    message_type: body.message_type,
    profile_key: profileKey,
    receiver_num: body.phone.replace(/[\s\-]/g, ""),
    message: body.message,
    reserved_time: "00000000000000",
    targeting: "M",  // 채널 친구 무관 — 마케팅 동의자 (whitelist 승인된 발신프로필)
    image_url: body.image_url || undefined,
    image_link: body.image_link || undefined,
    button1: buttons[0],
    button2: buttons[1],
    button3: buttons[2],
    button4: buttons[3],
    button5: buttons[4],
    coupon: body.coupon,
  };

  try {
    const results = await sendBatch([msg]);
    return NextResponse.json({ result: results[0] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
