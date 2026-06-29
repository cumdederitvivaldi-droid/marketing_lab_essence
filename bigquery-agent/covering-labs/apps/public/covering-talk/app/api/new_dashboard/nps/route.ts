// [CS-DSH-048] NPS 응답 집계 — 기간 내 발송·응답 통계 + 응답 목록
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { NpsScoreBucket } from "@/lib/store/nps";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

const BUCKET_SCORE: Record<NpsScoreBucket, number> = {
  "1~2점": 1.5,
  "3점": 3,
  "4점": 4,
  "5점": 5,
};

interface NpsRow {
  id: string;
  phone: string;
  customer_name: string | null;
  score_bucket: string | null;
  feedback_text: string | null;
  sent_at: string;
  responded_at: string | null;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-XXXX-${digits.slice(7)}`;
  }
  // already hyphenated or short — mask middle
  const parts = phone.split("-");
  if (parts.length === 3) {
    return `${parts[0]}-XXXX-${parts[2]}`;
  }
  return phone.slice(0, 3) + "-XXXX-" + phone.slice(-4);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const fromDate = params.get("fromDate");
    const toDate = params.get("toDate");
    if (!fromDate || !toDate) {
      return NextResponse.json({ error: "fromDate and toDate required (YYYY-MM-DD)" }, { status: 400 });
    }

    const fromIso = new Date(`${fromDate}T00:00:00+09:00`).toISOString();
    const toEndIso = new Date(`${toDate}T23:59:59.999+09:00`).toISOString();

    const rows = await paginate<NpsRow>(() =>
      supabase
        .from("nps_responses")
        .select("id, phone, customer_name, score_bucket, feedback_text, sent_at, responded_at")
        .gte("sent_at", fromIso)
        .lte("sent_at", toEndIso)
        .order("responded_at", { ascending: false }),
    );

    const totalSent = rows.length;
    const responded = rows.filter((r) => r.score_bucket !== null);
    const totalResponded = responded.length;
    const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 1000) / 10 : 0;

    const bucketCounts: Record<NpsScoreBucket, number> = { "1~2점": 0, "3점": 0, "4점": 0, "5점": 0 };
    let scoreSum = 0;
    for (const r of responded) {
      const bucket = r.score_bucket as NpsScoreBucket;
      if (bucket in bucketCounts) {
        bucketCounts[bucket]++;
        scoreSum += BUCKET_SCORE[bucket];
      }
    }
    const avgScore = totalResponded > 0 ? Math.round((scoreSum / totalResponded) * 100) / 100 : 0;

    const responses = responded
      .sort((a, b) => {
        if (!a.responded_at && !b.responded_at) return 0;
        if (!a.responded_at) return 1;
        if (!b.responded_at) return -1;
        return b.responded_at.localeCompare(a.responded_at);
      })
      .map((r) => ({
        id: r.id,
        customerName: r.customer_name ?? null,
        phoneMasked: maskPhone(r.phone),
        scoreBucket: (r.score_bucket as NpsScoreBucket) ?? null,
        feedbackText: r.feedback_text ?? null,
        sentAt: r.sent_at,
        respondedAt: r.responded_at ?? null,
      }));

    return NextResponse.json({
      summary: { totalSent, totalResponded, responseRate, avgScore, bucketCounts },
      responses,
    });
  } catch (err) {
    console.error("[nps] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
