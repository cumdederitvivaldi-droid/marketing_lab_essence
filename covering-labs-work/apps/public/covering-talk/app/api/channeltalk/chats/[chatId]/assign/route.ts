import { NextRequest, NextResponse } from "next/server";
import { assignChat, listManagers } from "@/lib/channeltalk/client";

// 매니저 목록 캐시
let managerCache: Array<{ id: string; name: string; avatarUrl?: string }> | null = null;
let managerCacheAt = 0;

// [CS-CT-006] 채널톡 상담사 배정
export async function GET(): Promise<NextResponse> {
  try {
    if (!managerCache || Date.now() - managerCacheAt > 1000 * 60 * 30) {
      const managers = await listManagers();
      managerCache = managers.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl }));
      managerCacheAt = Date.now();
    }
    return NextResponse.json({ managers: managerCache });
  } catch (err) {
    console.error("[CT] list managers error:", err);
    return NextResponse.json({ error: "매니저 목록 조회 실패" }, { status: 500 });
  }
}

// [CS-CT-007] 채널톡 상담사 배정
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
): Promise<NextResponse> {
  const { chatId } = await params;
  const { managerId } = (await request.json()) as { managerId: string };

  if (!managerId) {
    return NextResponse.json({ error: "managerId는 필수입니다" }, { status: 400 });
  }

  try {
    await assignChat(chatId, managerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CT] assign error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "배정 실패" },
      { status: 500 }
    );
  }
}
