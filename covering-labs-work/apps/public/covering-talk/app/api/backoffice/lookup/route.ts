import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

// Vercel function 기본 timeout (10~15s) 이 아래 25s 폴링보다 짧아서
// 스크래퍼가 정상 완료해도 edge 가 먼저 504 를 던지던 회귀 보정.
// MAX_POLL 25s + 안전마진 → 30s.
export const maxDuration = 30;

// [CS-EXT-014] 백오피스 고객 정보 조회 (Puppeteer 브릿지 + 24시간 캐시)
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    // 전화번호 유효성 검증
    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "전화번호를 입력해주세요" },
        { status: 400 }
      );
    }

    const cleaned = phone.replace(/[^0-9]/g, "");
    if (!/^01[016789]\d{7,8}$/.test(cleaned)) {
      return NextResponse.json(
        { error: "올바른 한국 전화번호 형식이 아닙니다" },
        { status: 400 }
      );
    }

    // 1) 캐시 확인 — 24시간 이내 결과가 있으면 바로 반환
    const cutoff = new Date(Date.now() - CACHE_TTL).toISOString();
    const { data: cached } = await supabaseAdmin
      .from("backoffice_cache")
      .select("result, cached_at")
      .eq("phone", cleaned)
      .gte("cached_at", cutoff)
      .order("cached_at", { ascending: false })
      .limit(1)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedResult = cached?.result as any;
    if (cachedResult?.userInfo) {
      return NextResponse.json({ success: true, data: cachedResult, cached: true });
    }

    // 2) 이미 같은 번호로 진행 중인 요청이 있으면 재사용 (중복 스크래핑 방지)
    const { data: existing } = await supabaseAdmin
      .from("backoffice_requests")
      .select("id")
      .eq("phone", cleaned)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    let requestId: string;

    if (existing) {
      requestId = existing.id;
    } else {
      const { data: request, error: insertError } = await supabaseAdmin
        .from("backoffice_requests")
        .insert({ phone: cleaned, status: "pending" })
        .select("id")
        .single();

      if (insertError || !request) {
        console.error("[Backoffice Lookup] 요청 생성 실패:", insertError);
        return NextResponse.json(
          { error: "조회 요청 생성에 실패했습니다" },
          { status: 500 }
        );
      }
      requestId = request.id;
    }
    const aborted = req.signal.aborted;

    const isOwner = !existing; // 내가 만든 요청만 정리 가능
    const cleanup = () => {
      if (isOwner) supabaseAdmin.from("backoffice_requests").delete().eq("id", requestId).then(() => {});
    };
    req.signal.addEventListener("abort", cleanup);

    // Polling — 최대 25초 (1초 간격)
    const MAX_POLL = 25;
    for (let i = 0; i < MAX_POLL; i++) {
      if (req.signal.aborted) {
        cleanup();
        return NextResponse.json({ error: "요청 취소됨" }, { status: 499 });
      }

      await new Promise((r) => setTimeout(r, 1000));

      // 캐시 먼저 확인 — 다른 요청이 먼저 완료했을 수 있음
      const { data: freshCache } = await supabaseAdmin
        .from("backoffice_cache")
        .select("result")
        .eq("phone", cleaned)
        .gte("cached_at", cutoff)
        .limit(1)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const freshResult = freshCache?.result as any;
      if (freshResult?.userInfo) {
        req.signal.removeEventListener("abort", cleanup);
        return NextResponse.json({ success: true, data: freshResult, cached: true });
      }

      const { data: row } = await supabaseAdmin
        .from("backoffice_requests")
        .select("status, result, error_message")
        .eq("id", requestId)
        .single();

      if (!row) break;

      if (row.status === "completed") {
        req.signal.removeEventListener("abort", cleanup);
        if (isOwner) {
          await supabaseAdmin
            .from("backoffice_requests")
            .delete()
            .eq("id", requestId);
        }

        // 캐시 저장 — userInfo가 있는 경우만 (빈 결과는 캐시하지 않음)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resultData = row.result as any;
        if (resultData?.userInfo) {
          await supabaseAdmin
            .from("backoffice_cache")
            .upsert({ phone: cleaned, result: row.result, cached_at: new Date().toISOString() }, { onConflict: "phone" })
            .then(({ error: cacheErr }) => { if (cacheErr) console.error("[Backoffice] cache write error:", cacheErr.message); });
        }

        return NextResponse.json({ success: true, data: row.result });
      }

      if (row.status === "error") {
        req.signal.removeEventListener("abort", cleanup);
        if (isOwner) {
          await supabaseAdmin
            .from("backoffice_requests")
            .delete()
            .eq("id", requestId);
        }

        return NextResponse.json(
          { error: row.error_message || "백오피스 조회 중 오류가 발생했습니다" },
          { status: 502 }
        );
      }
    }

    // 타임아웃
    req.signal.removeEventListener("abort", cleanup);
    if (isOwner) {
      await supabaseAdmin
        .from("backoffice_requests")
        .delete()
        .eq("id", requestId);
    }

    return NextResponse.json(
      {
        error: "백오피스 스크래퍼가 응답하지 않습니다. VPN 연결과 스크래퍼 실행 상태를 확인해주세요.",
      },
      { status: 504 }
    );
  } catch (err) {
    console.error("[Backoffice Lookup] 처리 실패:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
