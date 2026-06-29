import { NextRequest, NextResponse } from "next/server";
import { lunchVendorStore } from "@/lib/store/lunch-vendors";

// [CS-ETC-025] 런치 벤더 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = await request.json();

    const ok = await lunchVendorStore.update(id, body);
    if (!ok) {
      return NextResponse.json({ error: "벤더 수정 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch-vendors] PATCH error:", err);
    return NextResponse.json({ error: "벤더 수정 실패" }, { status: 500 });
  }
}

// [CS-ETC-057] 런치 벤더 비활성화
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const ok = await lunchVendorStore.deactivate(id);
    if (!ok) {
      return NextResponse.json({ error: "벤더 비활성화 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch-vendors] DELETE error:", err);
    return NextResponse.json({ error: "벤더 비활성화 실패" }, { status: 500 });
  }
}
