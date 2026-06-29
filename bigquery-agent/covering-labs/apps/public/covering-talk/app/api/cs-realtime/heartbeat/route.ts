import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";

// [CS-DSH-041] 상담사 출석 heartbeat — cs_presence_log 에 1행 INSERT.
//   클라이언트(useCsRealtimePresence) 가 1분마다 호출.
//   서버에서는 단순 INSERT — 운영시간 / 활성 판정은 클라이언트가 미리 함.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as { page?: string; system?: string };
    const page = typeof body?.page === "string" ? body.page.slice(0, 200) : null;
    const system = typeof body?.system === "string" ? body.system.slice(0, 32) : null;

    const { error } = await supabase.from("cs_presence_log").insert({
      user_name: user.name,
      page,
      system,
    });
    if (error) {
      // 테이블 미존재 (migration 미적용) 등은 무시 — 대시보드 동작에 치명적이지 않음
      console.warn("[cs-realtime/heartbeat] insert 실패 (무시):", error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[cs-realtime/heartbeat] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
