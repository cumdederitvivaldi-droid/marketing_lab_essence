import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore, AuditEntityType } from "@/lib/store/audit-logs";

// [CS-ADM-010] 감사 로그 조회
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entityType = request.nextUrl.searchParams.get("entity_type") as AuditEntityType | null;
  const entityId = request.nextUrl.searchParams.get("entity_id");
  const limit = Number(request.nextUrl.searchParams.get("limit")) || 50;

  if (entityType && entityId) {
    const logs = await auditStore.getByEntity(entityType, entityId, limit);
    return NextResponse.json({ logs });
  }

  const logs = await auditStore.getRecent(limit, entityType ?? undefined);
  return NextResponse.json({ logs });
}
