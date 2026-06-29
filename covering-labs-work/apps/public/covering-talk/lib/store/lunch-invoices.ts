import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

export type InvoiceStatus = "pending" | "issued" | "failed" | "cancelled";
export type InvoiceType = "single" | "monthly";

export interface LunchInvoice {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceType: InvoiceType; // single=단건, monthly=월말합산
  period: string; // monthly: YYYY-MM, single: YYYY-MM-DD
  supplyCost: number;
  tax: number;
  totalAmount: number;
  orderCount: number;
  issuanceKey: string | null;
  ntsTransactionId: string | null;
  boltaCustomerKey: string | null;
  status: InvoiceStatus;
  issuedAt: string | null;
  errorMessage: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToInvoice(row: any): LunchInvoice {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name || "",
    invoiceType: row.invoice_type ?? "monthly",
    period: row.period,
    supplyCost: row.supply_cost ?? 0,
    tax: row.tax ?? 0,
    totalAmount: row.total_amount ?? 0,
    orderCount: row.order_count ?? 0,
    issuanceKey: row.issuance_key ?? null,
    ntsTransactionId: row.nts_transaction_id ?? null,
    boltaCustomerKey: row.bolta_customer_key ?? null,
    status: row.status ?? "pending",
    issuedAt: row.issued_at ?? null,
    errorMessage: row.error_message ?? null,
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Store ──────────────────────────────────

export const lunchInvoiceStore = {
  /** 목록 조회 (필터: period, vendorId, status) */
  async getAll(filters?: {
    period?: string;
    vendorId?: string;
    status?: InvoiceStatus;
  }): Promise<LunchInvoice[]> {
    let query = supabase
      .from("lunch_invoices")
      .select("*")
      .order("period", { ascending: false });

    // period가 YYYY-MM이면 like로 매칭 (단건은 YYYY-MM-DD)
    if (filters?.period) {
      if (filters.period.length === 7) {
        query = query.like("period", `${filters.period}%`);
      } else {
        query = query.eq("period", filters.period);
      }
    }
    if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters?.status) query = query.eq("status", filters.status);

    const { data, error } = await query;
    if (error) {
      console.error("[lunchInvoiceStore.getAll]", error);
      return [];
    }
    return (data || []).map(dbToInvoice);
  },

  /** 단건 조회 */
  async getById(id: string): Promise<LunchInvoice | null> {
    const { data, error } = await supabase
      .from("lunch_invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return dbToInvoice(data);
  },

  /** 벤더+월 기준 조회 */
  async getByVendorPeriod(vendorId: string, period: string): Promise<LunchInvoice | null> {
    const { data, error } = await supabase
      .from("lunch_invoices")
      .select("*")
      .eq("vendor_id", vendorId)
      .eq("period", period)
      .single();

    if (error || !data) return null;
    return dbToInvoice(data);
  },

  /** 생성 (발행 전 pending 상태) */
  async create(params: {
    vendorId: string;
    vendorName: string;
    invoiceType?: InvoiceType;
    period: string;
    supplyCost: number;
    tax: number;
    totalAmount: number;
    orderCount: number;
    boltaCustomerKey?: string;
    description?: string;
  }): Promise<LunchInvoice | null> {
    const { data, error } = await supabase
      .from("lunch_invoices")
      .insert({
        vendor_id: params.vendorId,
        vendor_name: params.vendorName,
        invoice_type: params.invoiceType ?? "monthly",
        period: params.period,
        supply_cost: params.supplyCost,
        tax: params.tax,
        total_amount: params.totalAmount,
        order_count: params.orderCount,
        bolta_customer_key: params.boltaCustomerKey ?? null,
        description: params.description ?? "",
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[lunchInvoiceStore.create]", error);
      return null;
    }
    return dbToInvoice(data);
  },

  /** 발행 성공 시 업데이트 */
  async markIssued(id: string, issuanceKey: string, ntsTransactionId: string): Promise<boolean> {
    const { error } = await supabase
      .from("lunch_invoices")
      .update({
        status: "issued",
        issuance_key: issuanceKey,
        nts_transaction_id: ntsTransactionId,
        issued_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", id);

    if (error) {
      console.error("[lunchInvoiceStore.markIssued]", error);
      return false;
    }
    return true;
  },

  /** 발행 실패 시 업데이트 */
  async markFailed(id: string, errorMessage: string): Promise<boolean> {
    const { error } = await supabase
      .from("lunch_invoices")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", id);

    if (error) {
      console.error("[lunchInvoiceStore.markFailed]", error);
      return false;
    }
    return true;
  },

  /** 취소(수정발행·계약의 해제) 처리 */
  async markCancelled(id: string, amendIssuanceKey: string, terminationDate: string, reason?: string): Promise<boolean> {
    const desc = `계약의 해제 상계 | 수정발행키: ${amendIssuanceKey} | 해제일: ${terminationDate}${reason ? ` | 사유: ${reason}` : ""}`;
    const { error } = await supabase
      .from("lunch_invoices")
      .update({
        status: "cancelled",
        description: desc,
      })
      .eq("id", id);

    if (error) {
      console.error("[lunchInvoiceStore.markCancelled]", error);
      return false;
    }
    return true;
  },

  /** 주문들에 invoice_id 연결 */
  async linkOrders(invoiceId: string, orderIds: string[]): Promise<boolean> {
    const { error } = await supabase
      .from("lunch_orders")
      .update({ invoice_id: invoiceId })
      .in("id", orderIds);

    if (error) {
      console.error("[lunchInvoiceStore.linkOrders]", error);
      return false;
    }
    return true;
  },
};
