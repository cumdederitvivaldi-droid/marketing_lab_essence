import { NextRequest, NextResponse } from "next/server";
import { lunchConversationStore } from "@/lib/store/lunch-conversations";
import { generateLunchAIResponse } from "@/lib/ai/lunch-ai";
import type { LunchPhase } from "@/lib/ai/lunch-prompt";
import { supabase } from "@/lib/supabase/client";

// [CS-ETC-062] 런치 AI 초안 재생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const conv = await lunchConversationStore.getById(sessionId);
    if (!conv) return NextResponse.json({ error: "대화를 찾을 수 없습니다" }, { status: 404 });

    // 마지막 유저 메시지 찾기
    const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return NextResponse.json({ error: "유저 메시지가 없습니다" }, { status: 400 });

    // 히스토리 (현재 메시지 제외)
    const history = conv.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.id !== lastUserMsg.id)
      .slice(-60)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // 해당 벤더의 최근 주문 이력 조회
    let recentOrders: Array<{ orderNumber: string; date: string; pickupTime: string; boxCount: string; pickupAddress: string; totalAmount: number; status: string; sortingPrice?: number; }> = [];
    if (conv.vendorId) {
      const { data: orderRows } = await supabase
        .from("lunch_orders")
        .select("order_number, date, pickup_time, box_count, pickup_address, total_amount, status, sorting_price")
        .eq("vendor_id", conv.vendorId)
        .order("date", { ascending: false })
        .limit(10);
      recentOrders = (orderRows ?? []).map((o) => ({
        orderNumber: o.order_number,
        date: o.date,
        pickupTime: o.pickup_time ?? "",
        boxCount: o.box_count ?? "",
        pickupAddress: o.pickup_address ?? "",
        totalAmount: o.total_amount ?? 0,
        status: o.status ?? "confirmed",
        sortingPrice: o.sorting_price ?? undefined,
      }));
    }

    const aiResult = await generateLunchAIResponse({
      userMessage: lastUserMsg.content,
      history,
      vendorName: conv.vendorName || "",
      isNewVendor: !conv.vendorId,
      phase: (conv.aiPhase || "idle") as LunchPhase,
      recentOrders,
    });

    await lunchConversationStore.update(sessionId, {
      aiDraft: aiResult.response,
      aiPhase: aiResult.phase,
      ...(aiResult.orderData ? { aiOrderData: JSON.stringify(aiResult.orderData) } : {}),
    });

    return NextResponse.json({ aiDraft: aiResult.response, phase: aiResult.phase, intent: aiResult.intent, orderData: aiResult.orderData });
  } catch (err) {
    console.error("[lunch-regenerate] error:", err);
    return NextResponse.json({ error: "AI 재생성 실패" }, { status: 500 });
  }
}
