import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { classifyComplaints, COMPLAINT_CATEGORIES_PUBLIC, type ComplaintCategoryPublic, type ComplaintInput } from "@/lib/dashboard/complaint-classify";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const MIN_CONTENT_LEN = 6;

export const maxDuration = 60;
export type ComplaintMode = "pre" | "post";

// [CS-DSH-032] 고객 불만 분류 — 예약 확정 후('post') / 예약 전('pre') 모드 분기
//
// 분기 기준 — conversations.name 등록 여부:
//   post = name 등록됨 (예약 확정 후 단계)
//   pre  = name 미등록 (예약 확정 전 단계)
// 모집단:
//   1. user 메시지 created_at ∈ [fromIso, toIso]
//   2. content 글자 수 >= 6
//   3. 세션의 conversations.name 유무가 mode 와 일치
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { fromIso, toIso, mode } = (await request.json()) as { fromIso?: string; toIso?: string; mode?: ComplaintMode };
    if (!fromIso || !toIso || !mode) {
      return NextResponse.json({ error: "fromIso/toIso/mode required" }, { status: 400 });
    }
    if (mode !== "pre" && mode !== "post") {
      return NextResponse.json({ error: "mode must be 'pre' or 'post'" }, { status: 400 });
    }

    const inputs = await collectComplaintInputs(fromIso, toIso, mode);
    const empty = Object.fromEntries(COMPLAINT_CATEGORIES_PUBLIC.map((c) => [c, 0])) as Record<ComplaintCategoryPublic, number>;
    if (inputs.length === 0) {
      return NextResponse.json({ counts: empty, total: 0, mode });
    }

    const { counts: full } = await classifyComplaints(inputs);
    const counts = { ...empty };
    for (const c of COMPLAINT_CATEGORIES_PUBLIC) counts[c] = full[c] ?? 0;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return NextResponse.json({ counts, total, mode });
  } catch (err) {
    console.error("[new_dashboard/complaints] error:", err);
    return NextResponse.json(
      { counts: {}, total: 0, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** 모집단 산출 — 기간 내 user 메시지 + 길이 필터 + 이름 유무 분기 */
export async function collectComplaintInputs(
  fromIso: string,
  toIso: string,
  mode: ComplaintMode,
): Promise<ComplaintInput[]> {
  const userMsgs = await paginate<{ id: string; session_id: string; content: string; created_at: string }>(() =>
    supabase
      .from("messages")
      .select("id, session_id, content, created_at")
      .eq("role", "user")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: true }),
  );

  const filtered = userMsgs.filter((m) => (m.content?.trim().length ?? 0) >= MIN_CONTENT_LEN);
  if (filtered.length === 0) return [];

  const sessionIds = [...new Set(filtered.map((m) => m.session_id))];
  const CHUNK = 500;

  // 세션별 conversations.name 조회 → mode 따라 분기
  const sessionHasName = new Map<string, boolean>();
  for (let i = 0; i < sessionIds.length; i += CHUNK) {
    const chunk = sessionIds.slice(i, i + CHUNK);
    const rows = await paginate<{ session_id: string; name: string | null }>(() =>
      supabase
        .from("conversations")
        .select("session_id, name")
        .in("session_id", chunk),
    );
    for (const r of rows) {
      sessionHasName.set(r.session_id, !!(r.name && r.name.trim()));
    }
  }

  // 'post' = name 있음, 'pre' = name 없음 (조회 안 된 세션은 name 없음으로 간주)
  const inputs: ComplaintInput[] = [];
  for (const m of filtered) {
    const hasName = sessionHasName.get(m.session_id) ?? false;
    const matches = mode === "post" ? hasName : !hasName;
    if (!matches) continue;
    inputs.push({
      sessionId: m.session_id,
      messageId: m.id,
      content: m.content,
      messageCreatedAt: m.created_at,
      bookingConfirmedAt: null,
    });
  }
  return inputs;
}
