// [CS-LAB-012] 전화번호로 최근 14일 내 발송된 브랜드메시지 캠페인 매칭 조회
//   상담 시작 시 CustomerPanel 에서 호출 → "🎯 캠페인명 (N일 전 발송)" 배지 표시
//   브랜드메시지 발송자에게만 의미 있는 정보지만 상담사 모두에게 노출됨 (참고용)
//   → 권한 제한 없음 (logged-in 만)
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { lookupCampaignByPhone } from "@/lib/store/brand-message";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone 쿼리 파라미터 필수" }, { status: 400 });

  try {
    const result = await lookupCampaignByPhone(phone);
    return NextResponse.json({ found: !!result, campaign: result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
