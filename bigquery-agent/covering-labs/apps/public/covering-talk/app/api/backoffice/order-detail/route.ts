import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

// 백오피스 lookup 와 동일 — Vercel function timeout 늘려 폴링 완주 보장.
export const maxDuration = 30;

// [CS-EXT-016] 백오피스 주문 상세 조회 (실패 사유, 방문 이미지)
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "주문 URL이 필요합니다" }, { status: 400 });
    }

    // admin.covering.app URL만 허용
    if (!url.includes("admin.covering.app")) {
      return NextResponse.json({ error: "허용되지 않는 URL입니다" }, { status: 400 });
    }

    const { data: request, error: insertError } = await supabaseAdmin
      .from("backoffice_requests")
      .insert({ request_type: "order_detail", url, status: "pending" })
      .select("id")
      .single();

    if (insertError || !request) {
      console.error("[Order Detail] 요청 생성 실패:", insertError);
      return NextResponse.json({ error: "조회 요청 생성에 실패했습니다" }, { status: 500 });
    }

    const requestId = request.id;

    const cleanup = () => {
      supabaseAdmin.from("backoffice_requests").delete().eq("id", requestId).then(() => {});
    };
    req.signal.addEventListener("abort", cleanup);

    // Polling — 최대 20초
    for (let i = 0; i < 20; i++) {
      if (req.signal.aborted) {
        cleanup();
        return NextResponse.json({ error: "요청 취소됨" }, { status: 499 });
      }

      await new Promise((r) => setTimeout(r, 1000));

      const { data: row } = await supabaseAdmin
        .from("backoffice_requests")
        .select("status, result, error_message")
        .eq("id", requestId)
        .single();

      if (!row) break;

      if (row.status === "completed") {
        req.signal.removeEventListener("abort", cleanup);
        await supabaseAdmin.from("backoffice_requests").delete().eq("id", requestId);
        return NextResponse.json({ success: true, data: row.result });
      }

      if (row.status === "error") {
        req.signal.removeEventListener("abort", cleanup);
        await supabaseAdmin.from("backoffice_requests").delete().eq("id", requestId);
        return NextResponse.json(
          { error: row.error_message || "주문 상세 조회 중 오류" },
          { status: 502 }
        );
      }
    }

    req.signal.removeEventListener("abort", cleanup);
    await supabaseAdmin.from("backoffice_requests").delete().eq("id", requestId);
    return NextResponse.json({ error: "스크래퍼 응답 타임아웃" }, { status: 504 });
  } catch (err) {
    console.error("[Order Detail] 처리 실패:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
