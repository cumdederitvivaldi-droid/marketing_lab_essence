import { supabase } from "@/lib/supabase/client";

// ─── 타입 ─────────────────────────────────────────────
export type AuditEntityType = "booking" | "order" | "lunch_order" | "product" | "macro" | "conversation";
export type AuditAction = "create" | "update" | "delete" | "cancel" | "status_change";

export interface AuditChange {
  old: unknown;
  new: unknown;
}

export interface AuditLog {
  id: number;
  createdAt: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: Record<string, AuditChange>;
  description: string | null;
  userId: number;
  userName: string;
}

interface LogParams {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  changes: Record<string, AuditChange>;
  description?: string;
  userId: number;
  userName: string;
}

// ─── DB → 앱 변환 ─────────────────────────────────────
function dbToAuditLog(row: Record<string, unknown>): AuditLog {
  return {
    id: row.id as number,
    createdAt: row.created_at as string,
    entityType: row.entity_type as AuditEntityType,
    entityId: row.entity_id as string,
    action: row.action as AuditAction,
    changes: (row.changes as Record<string, AuditChange>) ?? {},
    description: (row.description as string) ?? null,
    userId: row.user_id as number,
    userName: row.user_name as string,
  };
}

// ─── 유틸: 객체 변경 비교 ─────────────────────────────
export function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields?: string[]
): Record<string, AuditChange> {
  const result: Record<string, AuditChange> = {};
  const keys = fields ?? Object.keys(newObj);

  for (const key of keys) {
    if (!(key in newObj)) continue;
    const oldVal = oldObj[key];
    const newVal = newObj[key];

    // JSON 비교 (배열/객체 포함)
    const oldStr = JSON.stringify(oldVal ?? null);
    const newStr = JSON.stringify(newVal ?? null);

    if (oldStr !== newStr) {
      result[key] = { old: oldVal ?? null, new: newVal };
    }
  }

  return result;
}

// ─── 스토어 ───────────────────────────────────────────
export const auditStore = {
  /** 이력 기록 */
  async log(params: LogParams): Promise<void> {
    try {
      await supabase.from("audit_logs").insert({
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        changes: params.changes,
        description: params.description ?? null,
        user_id: params.userId,
        user_name: params.userName,
      });
    } catch (err) {
      console.error("[AuditLog] 기록 실패:", err);
    }
  },

  /** 특정 엔티티의 이력 조회 */
  async getByEntity(
    entityType: AuditEntityType,
    entityId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[AuditLog] 조회 실패:", error.message);
      return [];
    }

    return (data ?? []).map(dbToAuditLog);
  },

  /** 최근 전체 이력 조회 */
  async getRecent(limit = 50, entityType?: AuditEntityType): Promise<AuditLog[]> {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (entityType) {
      query = query.eq("entity_type", entityType);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[AuditLog] 최근 이력 조회 실패:", error.message);
      return [];
    }

    return (data ?? []).map(dbToAuditLog);
  },
};
