import { NextRequest, NextResponse } from "next/server";
import { computeAnalytics, buildAnalyticsCsv } from "../_lib";

export const maxDuration = 60;

// [CS-ADM-015] 운영 분석 CSV 내보내기 — 상담사별 퍼포먼스 메트릭 (기간/총답변/AI사용률/활동시간/응답시간 등)
export async function GET(req: NextRequest): Promise<NextResponse> {
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate, endDate 필수" }, { status: 400 });
  }

  try {
    const result = await computeAnalytics(startDate, endDate);
    const csv = buildAnalyticsCsv(result);
    const filename = `counselor-analytics-${startDate}~${endDate}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
