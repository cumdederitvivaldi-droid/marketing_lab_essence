import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);

export interface DashboardNoteRow {
  id: string;
  section: string;
  cell_key: string;
  content: string;
  author: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

// [CS-ADM-017] 관리자 대시보드 — 셀 메모 조회 / 생성
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const section = params.get("section");
  const cellKey = params.get("cell_key");
  const summary = params.get("summary") === "true";

  // summary 모드: 셀별 메모 카운트만 (대시보드 진입 시 1회 호출 → 모든 셀 아이콘 표시).
  // paginate 로 1000행 제한 우회 — 메모가 누적돼도 셀 아이콘 카운트가 조용히 깎이지 않도록.
  if (summary) {
    try {
      const rows = await paginate<Pick<DashboardNoteRow, "section" | "cell_key" | "resolved">>(() =>
        supabase.from("dashboard_notes").select("section, cell_key, resolved"),
      );
      // section + cell_key 별 { total, unresolved } 집계
      const counts: Record<string, { total: number; unresolved: number }> = {};
      for (const row of rows) {
        const key = `${row.section}::${row.cell_key}`;
        const c = counts[key] ?? { total: 0, unresolved: 0 };
        c.total++;
        if (!row.resolved) c.unresolved++;
        counts[key] = c;
      }
      return NextResponse.json({ counts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "summary fetch failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // 특정 셀 메모 list
  if (!section || !cellKey) {
    return NextResponse.json({ error: "section, cell_key required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("dashboard_notes")
    .select("*")
    .eq("section", section)
    .eq("cell_key", cellKey)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notes: (data ?? []) as DashboardNoteRow[] });
}

// [CS-ADM-018] 관리자 대시보드 — 셀 메모 생성
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const section = String(body.section ?? "").trim();
  const cellKey = String(body.cell_key ?? "").trim();
  const content = String(body.content ?? "").trim();

  if (!section || !cellKey || !content) {
    return NextResponse.json({ error: "section, cell_key, content required" }, { status: 400 });
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: "content too long (max 2000)" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("dashboard_notes")
    .insert({ section, cell_key: cellKey, content, author: user.name })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note: data as DashboardNoteRow }, { status: 201 });
}
