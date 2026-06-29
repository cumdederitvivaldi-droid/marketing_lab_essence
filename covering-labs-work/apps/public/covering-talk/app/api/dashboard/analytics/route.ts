import { NextRequest, NextResponse } from "next/server";
import { computeAnalytics } from "./_lib";

export const maxDuration = 60;

// [CS-ADM-014] 운영 분석 — 날짜 범위 기반 상담사별 퍼포먼스 + 시간대 분포 + 응답 시간 + 메시지 기반 AI 사용률/활동시간/응답시간
export async function GET(req: NextRequest): Promise<NextResponse> {
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate, endDate 필수" }, { status: 400 });
  }

  try {
    const result = await computeAnalytics(startDate, endDate);
    // 기존 응답 호환: startDate/endDate는 추가 필드라 무해
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
