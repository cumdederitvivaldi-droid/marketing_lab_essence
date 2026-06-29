import { NextRequest, NextResponse } from "next/server";
import { lookupServiceArea } from "@/lib/channeltalk-ai/service-area";
import { supabase } from "@/lib/supabase/client";

// [CS-CT-010] 서비스 지역 조회 (주소→동 변환 + DB 매칭)
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { address } = (await request.json()) as { address: string };

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "address 필드가 필요합니다" },
        { status: 400 }
      );
    }

    const result = await lookupServiceArea(address.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("[service-areas] lookup error:", err);
    return NextResponse.json(
      { error: "서비스 지역 조회 실패" },
      { status: 500 }
    );
  }
}

// [CS-CT-011] 서비스 지역 전체 목록
export async function GET(): Promise<NextResponse> {
  try {
    const { data, error } = await supabase
      .from("service_areas")
      .select("id, province, city, pickup_days, available_dongs, unavailable_dongs, note")
      .eq("is_active", true)
      .order("province")
      .order("city");

    if (error) throw error;
    return NextResponse.json({ areas: data ?? [] });
  } catch (err) {
    console.error("[service-areas] list error:", err);
    return NextResponse.json(
      { error: "서비스 지역 목록 조회 실패" },
      { status: 500 }
    );
  }
}
