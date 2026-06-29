import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// [CS-ADM-005] 상담사 목록 조회
export async function GET() {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .like("key", "counselor:%");

  const counselors = (data ?? [])
    .map((row) => {
      const val = row.value as { id: number; is_active: boolean; role: string };
      return {
        id: val.id,
        name: row.key.replace("counselor:", ""),
        role: val.role,
        is_active: val.is_active,
      };
    })
    .filter((c) => c.is_active)
    .sort((a, b) => a.id - b.id);

  return NextResponse.json({ counselors });
}
