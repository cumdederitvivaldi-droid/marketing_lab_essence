import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { applyPromoCap } from "@/lib/utils/trip-fee";

// [CS-ITM-010] 지역별 가격 조회
export async function GET() {
  const { data, error } = await supabase
    .from("region_prices")
    .select("*")
    .order("region");

  if (error) {
    try {
      const prices = (await import("@/lib/data/region-prices.json")).default;
      return NextResponse.json({ prices: prices.map(applyPromoCap), source: "local" });
    } catch {
      return NextResponse.json({ prices: [] }, { status: 500 });
    }
  }

  return NextResponse.json({ prices: (data ?? []).map(applyPromoCap) });
}
