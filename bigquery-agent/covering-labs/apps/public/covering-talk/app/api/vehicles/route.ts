import { NextRequest, NextResponse } from "next/server";
import { vehicleStore } from "@/lib/store/vehicles";

// [CS-ETC-036] 차량 목록 조회
export async function GET(): Promise<NextResponse> {
  try {
    const vehicles = await vehicleStore.getAll({ activeOnly: false });
    return NextResponse.json({ vehicles });
  } catch (err) {
    console.error("[vehicles] GET error:", err);
    return NextResponse.json({ error: "차량 조회 실패" }, { status: 500 });
  }
}

// [CS-ETC-037] 차량 등록
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    if (!body.plateNumber || !body.vehicleType) {
      return NextResponse.json({ error: "차량번호와 차량종류는 필수입니다" }, { status: 400 });
    }
    const vehicle = await vehicleStore.create(body);
    if (!vehicle) {
      return NextResponse.json({ error: "차량 등록 실패" }, { status: 500 });
    }
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

// [CS-ETC-038] 차량 수정
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const { id, ...updates } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }
    const success = await vehicleStore.update(id, updates);
    if (!success) {
      return NextResponse.json({ error: "차량 수정 실패" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}

// [CS-ETC-039] 차량 삭제
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
    }
    const success = await vehicleStore.delete(id);
    if (!success) {
      return NextResponse.json({ error: "차량 삭제 실패" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
