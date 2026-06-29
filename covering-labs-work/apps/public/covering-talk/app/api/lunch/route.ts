import { NextRequest, NextResponse } from "next/server";
import { lunchOrderStore } from "@/lib/store/lunch-orders";
import { lunchVendorStore } from "@/lib/store/lunch-vendors";
import { auditStore } from "@/lib/store/audit-logs";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-ETC-015] 런치 주문 목록 조회
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status") as "confirmed" | "cancelled" | "payment_requested" | "completed" | null;
    const date = searchParams.get("date") || undefined;
    const search = searchParams.get("search") || undefined;
    const vendorId = searchParams.get("vendorId") || undefined;
    const type = searchParams.get("type");

    // 벤더 목록 조회
    if (type === "vendors") {
      const vendors = await lunchVendorStore.getAll({ activeOnly: true });
      return NextResponse.json({ vendors });
    }

    const orders = await lunchOrderStore.getAll({
      status: status || undefined,
      date,
      search,
      vendorId,
    });

    return NextResponse.json({ orders });
  } catch (err) {
    console.error("[lunch] GET error:", err);
    return NextResponse.json({ error: "런치 주문 조회 실패" }, { status: 500 });
  }
}

// [CS-ETC-016] 런치 주문 수정
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json({ error: "id와 updates가 필요합니다" }, { status: 400 });
    }

    const existing = await lunchOrderStore.getById(id);
    const ok = await lunchOrderStore.update(id, updates);
    if (!ok) {
      return NextResponse.json({ error: "업데이트 실패" }, { status: 500 });
    }

    const user = await getCurrentUser().catch(() => null);
    await auditStore.log({
      entityType: "lunch_order", entityId: id, action: updates.status && existing && updates.status !== existing.status ? "status_change" : "update",
      changes: { updates: { old: null, new: updates } },
      description: `런치 주문 수정: ${existing?.vendorName ?? ""} ${existing?.orderNumber ?? id}`,
      userId: user?.id ?? 0, userName: user?.name ?? "system",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch] PATCH error:", err);
    return NextResponse.json({ error: "런치 주문 수정 실패" }, { status: 500 });
  }
}

// [CS-ETC-029] 런치 주문 삭제
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "id가 필요합니다" }, { status: 400 });
    }
    const existing = await lunchOrderStore.getById(id);
    const ok = await lunchOrderStore.delete(id);
    if (!ok) {
      return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    }

    const user = await getCurrentUser().catch(() => null);
    await auditStore.log({
      entityType: "lunch_order", entityId: id, action: "delete",
      changes: { deleted: { old: { orderNumber: existing?.orderNumber, vendorName: existing?.vendorName, date: existing?.date }, new: null } },
      description: `런치 주문 삭제: ${existing?.vendorName ?? ""} ${existing?.orderNumber ?? id}`,
      userId: user?.id ?? 0, userName: user?.name ?? "system",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch] DELETE error:", err);
    return NextResponse.json({ error: "런치 주문 삭제 실패" }, { status: 500 });
  }
}

// [CS-ETC-017] 런치 주문 등록
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { order: orderData } = body;

    if (!orderData || !orderData.vendorName || !orderData.date) {
      return NextResponse.json({ error: "vendorName과 date가 필요합니다" }, { status: 400 });
    }

    // 벤더 자동 매칭 또는 생성
    let vendorId = orderData.vendorId;
    if (!vendorId && orderData.vendorName) {
      const existing = await lunchVendorStore.getByName(orderData.vendorName);
      if (existing) {
        vendorId = existing.id;
        // 기존 벤더에 세금계산서 정보/연락처 업데이트
        const updates: Record<string, string> = {};
        if (orderData.ownerPhone && !existing.ownerPhone) updates.ownerPhone = orderData.ownerPhone;
        if (orderData.businessNumber) updates.businessNumber = orderData.businessNumber;
        if (orderData.representativeName) updates.representativeName = orderData.representativeName;
        if (orderData.taxEmail) updates.taxEmail = orderData.taxEmail;
        if (Object.keys(updates).length > 0) await lunchVendorStore.update(existing.id, updates);
      } else {
        const newVendor = await lunchVendorStore.create({
          name: orderData.vendorName,
          address: orderData.pickupAddress || "",
          ownerPhone: orderData.ownerPhone || "",
          settlementType: orderData.settlementType || "link_pay",
          businessNumber: orderData.businessNumber || "",
          representativeName: orderData.representativeName || "",
          taxEmail: orderData.taxEmail || "",
        });
        vendorId = newVendor?.id || null;
      }
    } else if (vendorId) {
      // 기존 벤더 ID로 선택된 경우에도 세금계산서 정보 업데이트
      const updates: Record<string, string> = {};
      if (orderData.businessNumber) updates.businessNumber = orderData.businessNumber;
      if (orderData.representativeName) updates.representativeName = orderData.representativeName;
      if (orderData.taxEmail) updates.taxEmail = orderData.taxEmail;
      if (orderData.ownerPhone) updates.ownerPhone = orderData.ownerPhone;
      if (Object.keys(updates).length > 0) await lunchVendorStore.update(vendorId, updates);
    }

    // 주문 데이터에서 벤더 전용 필드 제거
    const { businessNumber: _bn, representativeName: _rn, taxEmail: _te, ownerPhone: _op, ...cleanOrderData } = orderData;

    const created = await lunchOrderStore.create({
      ...cleanOrderData,
      vendorId,
    });

    if (!created) {
      return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 });
    }

    const user = await getCurrentUser().catch(() => null);
    await auditStore.log({
      entityType: "lunch_order", entityId: created.id, action: "create",
      changes: { created: { old: null, new: { orderNumber: created.orderNumber, vendorName: orderData.vendorName, date: orderData.date } } },
      description: `런치 주문 생성: ${orderData.vendorName} ${orderData.date}`,
      userId: user?.id ?? 0, userName: user?.name ?? "system",
    });

    return NextResponse.json({ success: true, order: created }, { status: 201 });
  } catch (err) {
    console.error("[lunch] POST error:", err);
    return NextResponse.json({ error: "런치 주문 등록 실패" }, { status: 500 });
  }
}
