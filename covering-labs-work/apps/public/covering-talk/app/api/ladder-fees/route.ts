import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// [CS-ITM-009] 사다리차 요금 조회
export async function GET() {
  const { data, error } = await supabase
    .from("ladder_fees")
    .select("*")
    .order("type");

  if (error) {
    try {
      const fees = (await import("@/lib/data/ladder-fees.json")).default;
      return NextResponse.json({ fees, source: "local" });
    } catch {
      return NextResponse.json({ fees: [] }, { status: 500 });
    }
  }

  return NextResponse.json({ fees: data ?? [] });
}
