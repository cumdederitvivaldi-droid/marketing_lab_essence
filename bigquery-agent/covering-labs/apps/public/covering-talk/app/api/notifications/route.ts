import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-ETC-027] 알림 목록 조회
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 20건으로 제한 — 헤더 알림 패널은 최근 20건만 보여줘도 충분. 폴링 10s × 사용자수 만큼 누적 부담.
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient", user.name)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[notifications] list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

// [CS-ETC-028] 알림 생성 (멘션 등)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recipients, chatId, messagePreview, type } = (await request.json()) as {
    recipients: string[];
    chatId: string;
    messagePreview?: string;
    type?: string;
  };

  if (!recipients?.length || !chatId) {
    return NextResponse.json({ error: "recipients, chatId 필수" }, { status: 400 });
  }

  const rows = recipients.map((recipient) => ({
    recipient,
    sender: user.name,
    type: type ?? "mention",
    chat_id: chatId,
    message_preview: messagePreview?.slice(0, 100) ?? "",
  }));

  const { error } = await supabase.from("notifications").insert(rows);

  if (error) {
    console.error("[notifications] create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: rows.length });
}

// [CS-ETC-058] 알림 읽음 처리
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, readAll } = (await request.json()) as {
    ids?: string[];
    readAll?: boolean;
  };

  // 명시적 분기 — readAll=true 가 아니면서 ids 가 비어있으면 거절.
  //   기존 `!readAll && ids?.length` 만으로는 readAll=false + ids=[] 케이스에서
  //   조건이 false 가 되어 필터 없이 전체 알림이 읽음 처리되던 버그.
  if (!readAll && (!ids || ids.length === 0)) {
    return NextResponse.json(
      { error: "ids 가 비어있고 readAll 도 false 입니다 — 대상 미지정" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient", user.name);

  if (!readAll) {
    query = query.in("id", ids!);
  }

  const { error } = await query;

  if (error) {
    console.error("[notifications] read error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// [CS-ETC-059] 알림 삭제
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ids, deleteAll } = (await request.json()) as {
    ids?: string[];
    deleteAll?: boolean;
  };

  // 삭제는 복구 불가 — readAll 보다 더 엄격하게 검사.
  //   deleteAll=true 가 아닌데 ids 가 비어있으면 즉시 400.
  if (!deleteAll && (!ids || ids.length === 0)) {
    return NextResponse.json(
      { error: "ids 가 비어있고 deleteAll 도 false 입니다 — 대상 미지정" },
      { status: 400 }
    );
  }

  let query = supabase
    .from("notifications")
    .delete()
    .eq("recipient", user.name);

  if (!deleteAll) {
    query = query.in("id", ids!);
  }

  const { error } = await query;

  if (error) {
    console.error("[notifications] delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
