import { NextRequest, NextResponse } from "next/server";
import { updateUserProfile } from "@/lib/channeltalk/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-CT-019] 채널톡 유저 프로필 수정 (이름 등)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const { name } = (await request.json()) as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: "이름은 필수입니다" }, { status: 400 });
  }

  try {
    await updateUserProfile(userId, { name: name.trim() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[CT] updateUserProfile error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "프로필 수정 실패" },
      { status: 500 }
    );
  }
}
