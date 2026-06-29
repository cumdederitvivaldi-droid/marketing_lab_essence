import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getOrCreateInsight } from "@/lib/dashboard/ai-insight";
import type { JourneyMapData } from "@/lib/dashboard/types";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

export const maxDuration = 30;

interface InsightRequestBody {
  presetKey?: string;
  periodLabel?: string;
  fromDate?: string;
  toDate?: string;
  journeyMap?: JourneyMapData;
}

// [CS-ADM-021] 관리자 대시보드 — Customer Journey Map AI 인사이트 (캐시 hit 즉시 / miss 시 Sonnet 호출)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await request.json()) as InsightRequestBody;
    const { presetKey, periodLabel, fromDate, toDate, journeyMap } = body;
    if (!presetKey || !periodLabel || !fromDate || !toDate || !journeyMap) {
      return NextResponse.json({ error: "presetKey/periodLabel/fromDate/toDate/journeyMap required" }, { status: 400 });
    }

    const insight = await getOrCreateInsight(
      { periodLabel, fromDate, toDate },
      journeyMap,
      presetKey,
    );

    return NextResponse.json({ insight });
  } catch (err) {
    console.error("[new_dashboard/insight] error:", err);
    return NextResponse.json(
      { insight: null, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
