import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import crypto from "crypto";

// POST /api/nudge/seed — 넛지 테스트용 더미 데이터 10건 생성
// [CS-NTF-003] 넛지 시드 데이터 생성
export async function POST(): Promise<NextResponse> {
  const names = ["김민수", "이서연", "박준혁", "최지은", "정다은", "한승우", "윤하늘", "강예진", "조민호", "임수빈"];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(14, 0, 0, 0);

  const rows = names.map((name, i) => {
    const sessionId = `nudge-test-${crypto.randomBytes(4).toString("hex")}-${i}`;
    const createdAt = new Date(yesterday.getTime() - i * 3600000).toISOString(); // 1시간 간격
    return {
      session_id: sessionId,
      user_key: `test_user_${i}_${Date.now()}`,
      sender_key: "test_sender",
      phone: `010-${String(1000 + i).slice(1)}-${String(5000 + i * 111).slice(0, 4)}`,
      name,
      status: "quote_sent_nudge",
      unread_count: 0,
      needs_human: false,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });

  const { error } = await supabase.from("conversations").insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: rows.length, sessionIds: rows.map((r) => r.session_id) });
}
