import { NextRequest, NextResponse } from "next/server";
import { lunchVendorStore } from "@/lib/store/lunch-vendors";

// [CS-ETC-023] 런치 벤더 목록 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const search = request.nextUrl.searchParams.get("search") || undefined;
    const vendors = await lunchVendorStore.getAll({ search, activeOnly: true });
    return NextResponse.json({ vendors });
  } catch (err) {
    console.error("[lunch-vendors] GET error:", err);
    return NextResponse.json({ error: "벤더 조회 실패" }, { status: 500 });
  }
}

// [CS-ETC-024] 런치 벤더 등록
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "지점명이 필요합니다" }, { status: 400 });
    }

    const vendor = await lunchVendorStore.create(body);
    if (!vendor) {
      return NextResponse.json({ error: "벤더 생성 실패 (이름 중복?)" }, { status: 500 });
    }

    return NextResponse.json({ success: true, vendor }, { status: 201 });
  } catch (err) {
    console.error("[lunch-vendors] POST error:", err);
    return NextResponse.json({ error: "벤더 등록 실패" }, { status: 500 });
  }
}
