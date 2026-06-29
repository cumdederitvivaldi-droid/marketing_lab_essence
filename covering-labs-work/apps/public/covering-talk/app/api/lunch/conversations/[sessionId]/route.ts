import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-045] 런치 대화 상세 조회 (메시지 포함)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const conv = await lunchConversationStore.getById(sessionId);
    if (!conv) return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });
    return NextResponse.json(conv);
  } catch (err) {
    console.error("[lunch-conversations] GET detail error:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

// [CS-ETC-046] 런치 대화 메타데이터 수정 (status, assignee, memo 등)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const body = await request.json();

    // 벤더명이 변경되면 해당 벤더 찾아서 vendor_id + phone 자동 연결
    const updates: Record<string, unknown> = { ...body };
    if (body.vendorName) {
      const { data: vendor } = await supabase
        .from("lunch_vendors")
        .select("id, owner_phone")
        .eq("name", body.vendorName)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (vendor) {
        updates.vendorId = vendor.id;
        // 기존에 phone이 비어 있고, 벤더에 owner_phone이 있으면 자동 채움
        const { data: conv } = await supabase
          .from("lunch_conversations").select("phone").eq("session_id", sessionId).maybeSingle();
        if (!conv?.phone && vendor.owner_phone) {
          updates.phone = vendor.owner_phone;
        }
      }
    }

    const ok = await lunchConversationStore.update(sessionId, updates);
    if (!ok) return NextResponse.json({ error: "수정 실패" }, { status: 500 });
    return NextResponse.json({ success: true, updates });
  } catch (err) {
    console.error("[lunch-conversations] PATCH error:", err);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

// [CS-ETC-052] 런치 대화 삭제 (디버그용)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    await supabase.from("lunch_messages").delete().eq("session_id", sessionId);
    await supabase.from("lunch_conversations").delete().eq("session_id", sessionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lunch-conversations] DELETE error:", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
