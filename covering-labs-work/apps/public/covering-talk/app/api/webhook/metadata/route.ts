import { NextRequest, NextResponse } from "next/server";
import { IncomingMetadata } from "@/lib/happytalk/types";
import { supabase } from "@/lib/supabase/client";

// [CS-EXT-004] 사용자 메타데이터 수신
//
// 카카오 상담톡 진입 시 해피톡이 호출. body.reference.extra (또는 last_reference.extra)
// 에 "이전 페이지: <url>" 형태 referrer 텍스트가 들어옴 (상담연결 버튼 메타로 전달).
//
// 동작:
//   1. user_key 로 최근 conversations 찾기 → 있으면 referrer 채움 (이전 referrer 비어있을 때만)
//   2. conversation 이 아직 없으면 pending_referrers 에 임시 저장 → 첫 메시지 webhook 이
//      conversation 생성 후 이 테이블에서 lookup 해 옮김.
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: IncomingMetadata;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
  }

  console.log("[Webhook/metadata] 수신:", JSON.stringify(body));

  const referrer =
    (body.reference?.extra ?? body.reference?.text ?? body.last_reference?.extra ?? "")?.toString().trim() || null;

  if (!referrer || !body.user_key) {
    return NextResponse.json({ status: "ok" });
  }

  try {
    // 1. user_key 의 가장 최근 conversation 찾기
    const { data: existing } = await supabase
      .from("conversations")
      .select("session_id, referrer")
      .eq("user_key", body.user_key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (!existing.referrer) {
        await supabase
          .from("conversations")
          .update({ referrer, referrer_at: new Date().toISOString() })
          .eq("session_id", existing.session_id);
        console.log(`[Webhook/metadata] referrer 저장: ${existing.session_id} ← "${referrer.slice(0, 80)}"`);
      }
    } else {
      // conv 아직 없음 — pending 보관 (user_key UNIQUE 라 upsert)
      await supabase
        .from("pending_referrers")
        .upsert({
          user_key: body.user_key,
          sender_key: body.sender_key,
          referrer,
          received_at: new Date().toISOString(),
        });
      console.log(`[Webhook/metadata] pending 저장: ${body.user_key} ← "${referrer.slice(0, 80)}"`);
    }
  } catch (err) {
    console.error("[Webhook/metadata] DB 저장 오류:", err);
  }

  return NextResponse.json({ status: "ok" });
}
