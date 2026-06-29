import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

export type PickupInvoiceStatus = "pending" | "issued" | "failed" | "cancelled";

export interface PickupInvoice {
  id: string;
  sessionId: string | null;
  email: string;
  businessNumber: string;
  businessName: string;
  representativeName: string;
  supplyCost: number;
  tax: number;
  totalAmount: number;
  issuanceKey: string | null;
  ntsTransactionId: string | null;
  status: PickupInvoiceStatus;
  issuedAt: string | null;
  cancelledAt: string | null;
  errorMessage: string | null;
  description: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToInvoice(row: any): PickupInvoice {
  return {
    id: row.id,
    sessionId: row.session_id ?? null,
    email: row.email,
    businessNumber: row.business_number,
    businessName: row.business_name,
    representativeName: row.representative_name,
    supplyCost: row.supply_cost ?? 0,
    tax: row.tax ?? 0,
    totalAmount: row.total_amount ?? 0,
    issuanceKey: row.issuance_key ?? null,
    ntsTransactionId: row.nts_transaction_id ?? null,
    status: row.status ?? "pending",
    issuedAt: row.issued_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    errorMessage: row.error_message ?? null,
    description: row.description ?? "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const pickupInvoiceStore = {
  async create(input: {
    sessionId?: string | null;
    email: string;
    businessNumber: string;
    businessName: string;
    representativeName: string;
    supplyCost: number;
    tax: number;
    totalAmount: number;
    description?: string;
    createdBy?: string | null;
  }): Promise<PickupInvoice | null> {
    const { data, error } = await supabase
      .from("pickup_invoices")
      .insert({
        session_id: input.sessionId ?? null,
        email: input.email,
        business_number: input.businessNumber,
        business_name: input.businessName,
        representative_name: input.representativeName,
        supply_cost: input.supplyCost,
        tax: input.tax,
        total_amount: input.totalAmount,
        description: input.description ?? "",
        created_by: input.createdBy ?? null,
        status: "pending",
      })
      .select("*")
      .single();
    if (error) {
      console.error("[pickupInvoiceStore.create]", error);
      return null;
    }
    return dbToInvoice(data);
  },

  async getById(id: string): Promise<PickupInvoice | null> {
    const { data, error } = await supabase
      .from("pickup_invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return dbToInvoice(data);
  },

  async getAll(opts?: {
    status?: PickupInvoiceStatus;
    sessionId?: string;
    limit?: number;
  }): Promise<PickupInvoice[]> {
    let q = supabase
      .from("pickup_invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (opts?.status) q = q.eq("status", opts.status);
    if (opts?.sessionId) q = q.eq("session_id", opts.sessionId);
    if (opts?.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) {
      console.error("[pickupInvoiceStore.getAll]", error);
      return [];
    }
    return (data ?? []).map(dbToInvoice);
  },

  async markIssued(
    id: string,
    issuanceKey: string,
    ntsTransactionId: string | null
  ): Promise<boolean> {
    const { error } = await supabase
      .from("pickup_invoices")
      .update({
        status: "issued",
        issuance_key: issuanceKey,
        nts_transaction_id: ntsTransactionId,
        issued_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", id);
    if (error) {
      console.error("[pickupInvoiceStore.markIssued]", error);
      return false;
    }
    return true;
  },

  async markFailed(id: string, errorMessage: string): Promise<boolean> {
    const { error } = await supabase
      .from("pickup_invoices")
      .update({ status: "failed", error_message: errorMessage })
      .eq("id", id);
    if (error) {
      console.error("[pickupInvoiceStore.markFailed]", error);
      return false;
    }
    return true;
  },

  async markCancelled(id: string, reason: string): Promise<boolean> {
    const { error } = await supabase
      .from("pickup_invoices")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        error_message: reason,
      })
      .eq("id", id);
    if (error) {
      console.error("[pickupInvoiceStore.markCancelled]", error);
      return false;
    }
    return true;
  },
};
