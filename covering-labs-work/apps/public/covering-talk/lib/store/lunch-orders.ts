import { supabase } from "@/lib/supabase/client";
import type { PaymentEntry } from "./orders";

// ─── Types ──────────────────────────────────

export type LunchOrderStatus = "confirmed" | "cancelled" | "payment_requested" | "completed";

export type LunchSettlementType = "link_pay" | "monthly_invoice" | "tax_invoice";

export interface LunchOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  status: LunchOrderStatus;
  vendorId: string | null;
  vendorName: string;
  date: string;
  pickupTime: string;
  boxCount: string;
  pickupAddress: string;
  siteContact: string;
  notes: string;
  isPickedUp: boolean;
  sortingPrice: number;
  totalAmount: number;
  settlementType: LunchSettlementType;
  invoiceIssued: boolean;
  paymentIds: PaymentEntry[];
  sessionId: string | null;
  // 배차
  driverName: string;
  driverPhone: string;
  driverMemo: string;
  vehicleId: string;
  isDispatched: boolean;
  dispatchedAt: string | null;
}

export const LUNCH_STATUS_LABELS: Record<LunchOrderStatus, string> = {
  confirmed: "일정확정",
  payment_requested: "결제요청",
  completed: "정산완료",
  cancelled: "취소",
};

export const LUNCH_STATUS_COLORS: Record<LunchOrderStatus, { bg: string; text: string }> = {
  confirmed: { bg: "#E8F7FF", text: "#1AA3FF" },
  payment_requested: { bg: "#FFFBEB", text: "#D97706" },
  completed: { bg: "#ECFDF5", text: "#059669" },
  cancelled: { bg: "#FFEBEE", text: "#C62828" },
};

export const SETTLEMENT_TYPE_LABELS: Record<LunchSettlementType, string> = {
  link_pay: "링크페이",
  monthly_invoice: "월말정산",
  tax_invoice: "세금계산서",
};

// ─── Helpers ──────────────────────────────────

const ORDER_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateOrderNumber(): string {
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += ORDER_CHARS[Math.floor(Math.random() * ORDER_CHARS.length)];
  }
  return result;
}

// ─── DB ↔ App 변환 ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToLunchOrder(row: any): LunchOrder {
  return {
    id: row.id,
    orderNumber: row.order_number || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status || "confirmed",
    vendorId: row.vendor_id || null,
    vendorName: row.vendor_name || "",
    date: row.date || "",
    pickupTime: row.pickup_time || "",
    boxCount: row.box_count || "",
    pickupAddress: row.pickup_address || "",
    siteContact: row.site_contact || "",
    notes: row.notes || "",
    isPickedUp: row.is_picked_up ?? false,
    sortingPrice: row.sorting_price || 0,
    totalAmount: row.total_amount || 0,
    settlementType: row.settlement_type || "link_pay",
    invoiceIssued: row.invoice_issued ?? false,
    paymentIds: row.payment_ids || [],
    sessionId: row.session_id || null,
    driverName: row.driver_name || "",
    driverPhone: row.driver_phone || "",
    driverMemo: row.driver_memo || "",
    vehicleId: row.vehicle_id || "",
    isDispatched: row.is_dispatched ?? false,
    dispatchedAt: row.dispatched_at || null,
  };
}

// ─── Store ──────────────────────────────────

export const lunchOrderStore = {
  async getAll(filters?: {
    status?: LunchOrderStatus;
    date?: string;
    search?: string;
    vendorId?: string;
  }): Promise<LunchOrder[]> {
    let query = supabase
      .from("lunch_orders")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }
    if (filters?.date) {
      query = query.eq("date", filters.date);
    }
    if (filters?.vendorId) {
      query = query.eq("vendor_id", filters.vendorId);
    }
    if (filters?.search) {
      const s = filters.search;
      query = query.or(
        `vendor_name.ilike.%${s}%,pickup_address.ilike.%${s}%,site_contact.ilike.%${s}%,order_number.ilike.%${s}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[lunchOrderStore.getAll]", error);
      return [];
    }
    return (data || []).map(dbToLunchOrder);
  },

  async getById(id: string): Promise<LunchOrder | null> {
    const { data, error } = await supabase
      .from("lunch_orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return dbToLunchOrder(data);
  },

  async getByVendorAndDateRange(
    vendorId: string,
    startDate: string,
    endDate: string
  ): Promise<LunchOrder[]> {
    const { data, error } = await supabase
      .from("lunch_orders")
      .select("*")
      .eq("vendor_id", vendorId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) {
      console.error("[lunchOrderStore.getByVendorAndDateRange]", error);
      return [];
    }
    return (data || []).map(dbToLunchOrder);
  },

  async create(
    order: Partial<LunchOrder> & {
      vendorName: string;
      date: string;
    }
  ): Promise<LunchOrder | null> {
    // 주문번호 생성 (충돌 시 최대 5회 재시도)
    let orderNumber = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateOrderNumber();
      const { data: existing } = await supabase
        .from("lunch_orders")
        .select("id")
        .eq("order_number", candidate)
        .maybeSingle();
      if (!existing) {
        orderNumber = candidate;
        break;
      }
    }
    if (!orderNumber) {
      console.error("[lunchOrderStore.create] 주문번호 생성 실패 (충돌)");
      return null;
    }

    const row = {
      order_number: orderNumber,
      status: order.status || "confirmed",
      vendor_id: order.vendorId || null,
      vendor_name: order.vendorName,
      date: order.date,
      pickup_time: order.pickupTime || "",
      box_count: order.boxCount || "",
      pickup_address: order.pickupAddress || "",
      site_contact: order.siteContact || "",
      notes: order.notes || "",
      is_picked_up: order.isPickedUp ?? false,
      sorting_price: order.sortingPrice || 0,
      total_amount: order.totalAmount || 0,
      settlement_type: order.settlementType || "link_pay",
      invoice_issued: order.invoiceIssued ?? false,
      payment_ids: order.paymentIds || [],
      session_id: order.sessionId || null,
    };

    const { data, error } = await supabase
      .from("lunch_orders")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[lunchOrderStore.create]", error);
      return null;
    }
    return dbToLunchOrder(data);
  },

  async update(id: string, updates: Partial<LunchOrder>): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};

    if (updates.status !== undefined) row.status = updates.status;
    if (updates.vendorId !== undefined) row.vendor_id = updates.vendorId;
    if (updates.vendorName !== undefined) row.vendor_name = updates.vendorName;
    if (updates.date !== undefined) row.date = updates.date;
    if (updates.pickupTime !== undefined) row.pickup_time = updates.pickupTime;
    if (updates.boxCount !== undefined) row.box_count = updates.boxCount;
    if (updates.pickupAddress !== undefined) row.pickup_address = updates.pickupAddress;
    if (updates.siteContact !== undefined) row.site_contact = updates.siteContact;
    if (updates.notes !== undefined) row.notes = updates.notes;
    if (updates.isPickedUp !== undefined) row.is_picked_up = updates.isPickedUp;
    if (updates.sortingPrice !== undefined) row.sorting_price = updates.sortingPrice;
    if (updates.totalAmount !== undefined) row.total_amount = updates.totalAmount;
    if (updates.settlementType !== undefined) row.settlement_type = updates.settlementType;
    if (updates.invoiceIssued !== undefined) row.invoice_issued = updates.invoiceIssued;
    if (updates.sessionId !== undefined) row.session_id = updates.sessionId;
    if (updates.driverName !== undefined) row.driver_name = updates.driverName;
    if (updates.driverPhone !== undefined) row.driver_phone = updates.driverPhone;
    if (updates.driverMemo !== undefined) row.driver_memo = updates.driverMemo;
    if (updates.vehicleId !== undefined) row.vehicle_id = updates.vehicleId;
    if (updates.isDispatched !== undefined) row.is_dispatched = updates.isDispatched;
    if (updates.dispatchedAt !== undefined) row.dispatched_at = updates.dispatchedAt;

    if (Object.keys(row).length === 0) return true;

    row.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("lunch_orders")
      .update(row)
      .eq("id", id);

    if (error) {
      console.error("[lunchOrderStore.update]", error);
      return false;
    }
    return true;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("lunch_orders")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[lunchOrderStore.delete]", error);
      return false;
    }
    return true;
  },

  /** payment_ids 배열에 새 항목 추가 */
  async addPaymentId(id: string, entry: PaymentEntry): Promise<boolean> {
    const order = await this.getById(id);
    if (!order) return false;

    const updatedPaymentIds = [...order.paymentIds, entry];

    const { error } = await supabase
      .from("lunch_orders")
      .update({
        payment_ids: updatedPaymentIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("[lunchOrderStore.addPaymentId]", error);
      return false;
    }
    return true;
  },

  /** payment_ids 중 tid/paidAt이 있는 항목 확인 */
  async checkPaymentStatus(id: string): Promise<{
    paid: boolean;
    entry?: PaymentEntry;
  }> {
    const order = await this.getById(id);
    if (!order) return { paid: false };

    const paidEntry = order.paymentIds.find((e) => e.tid && e.paidAt);
    return paidEntry ? { paid: true, entry: paidEntry } : { paid: false };
  },
};
