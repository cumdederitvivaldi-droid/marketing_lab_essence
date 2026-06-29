import { NextRequest, NextResponse } from "next/server";
import { driverStore } from "@/lib/store/drivers";

// [CS-ETC-032] 기사 목록 조회
export async function GET(): Promise<NextResponse> {
  try {
    const drivers = await driverStore.getAll({ activeOnly: false });
    return NextResponse.json({ drivers });
  } catch (err) {
    console.error("[drivers] GET error:", err);
    return NextResponse.json({ error: "기사 조회 실패" }, { status: 500 });
  }
}

// [CS-ETC-033] 기사 등록
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ error: "기사명은 필수입니다" }, { status: 400 });
    }
    const driver = await driverStore.create(body);
    if (!driver) {
      return NextResponse.json({ error: "기사 등록 실패" }, { status: 500 });
    }
    return NextResponse.json({ driver }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

// [CS-ETC-034] 기사 수정
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { id, ...updates } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }
    const success = await driverStore.update(id, updates);
    if (!success) {
      return NextResponse.json({ error: "기사 수정 실패" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

// [CS-ETC-035] 기사 삭제
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }
    const success = await driverStore.delete(id);
    if (!success) {
      return NextResponse.json({ error: "기사 삭제 실패" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
