import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

// prepaid: 선결제완료 — 2026-05-11 100% 선결제 정책(§6.1) 도입.
//   payment-sync 가 결제완료 감지 시 feature flag ON 이면 prepaid 로,
//   수거 마무리 시 completed 로 전이.
export type OrderStatus = "confirmed" | "cancelled" | "payment_requested" | "prepaid" | "completed";

export interface OrderItem {
  category: string;
  name: string;
  displayName: string;
  price: number;
  quantity: number;
  volume?: number;
}

export interface PaymentEntry {
  reqId: string;
  payUrl?: string;
  sentAt?: string;
  tid?: string;
  paidAt?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  customerName: string;
  phone: string;
  address: string;
  date: string;
  timeSlot: string;
  floor: number | null;
  hasElevator: boolean;
  hasParking: boolean;
  hasGroundAccess: boolean;
  needLadder: boolean;
  ladderFee: number;
  crewSize: number;
  items: OrderItem[];
  totalVolume: number;
  totalPrice: number;
  paymentIds: PaymentEntry[];
  memo: string;
  photos: string[];
  // 배차
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleId: string;
  routeOrder: number;
  isDispatched: boolean;
  dispatchedAt: string | null;
  channel: string | null;
}

export type OrderChannel = "블로그/카페" | "커버링앱" | "SNS" | "지인 추천";
export const ORDER_CHANNELS: readonly OrderChannel[] = ["블로그/카페", "커버링앱", "SNS", "지인 추천"] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: "예약완료",
  payment_requested: "결제요청",
  prepaid: "선결제완료",
  completed: "완료",
  cancelled: "취소",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  confirmed: { bg: "#E8F7FF", text: "#1AA3FF" },
  payment_requested: { bg: "#FFFBEB", text: "#D97706" },
  prepaid: { bg: "#FCE7F3", text: "#BE185D" },
  completed: { bg: "#ECFDF5", text: "#059669" },
  cancelled: { bg: "#FFEBEE", text: "#C62828" },
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

/** 전화번호를 010-XXXX-XXXX 형식으로 정규화 */
function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw; // 변환 불가 시 원본 반환
}

// ─── DB ↔ App 변환 ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToOrder(row: any): Order {
  return {
    id: row.id,
    orderNumber: row.order_number || "",
    sessionId: row.session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status || "confirmed",
    customerName: row.customer_name || "",
    phone: row.phone || "",
    address: row.address || "",
    date: row.date || "",
    timeSlot: row.time_slot || "",
    floor: row.floor ?? null,
    hasElevator: row.has_elevator ?? false,
    hasParking: row.has_parking ?? false,
    hasGroundAccess: row.has_ground_access ?? true,
    needLadder: row.need_ladder ?? false,
    ladderFee: row.ladder_fee || 0,
    crewSize: row.crew_size || 1,
    items: row.items || [],
    totalVolume: Number(row.total_volume) || 0,
    totalPrice: row.total_price || 0,
    paymentIds: row.payment_ids || [],
    memo: row.memo || "",
    photos: row.photos || [],
    driverId: row.driver_id || "",
    driverName: row.driver_name || "",
    driverPhone: row.driver_phone || "",
    vehicleId: row.vehicle_id || "",
    routeOrder: row.route_order || 0,
    isDispatched: row.is_dispatched ?? false,
    dispatchedAt: row.dispatched_at || null,
    channel: row.channel ?? null,
  };
}

// ─── Store ──────────────────────────────────

export const orderStore = {
  async getAll(filters?: {
    status?: OrderStatus;
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
  }): Promise<Order[]> {
    // PostgREST max-rows=1000 서버 cap 우회 — 1000건씩 페이징해서 전부 가져옴.
    const PAGE = 1000;
    const MAX_PAGES = 20; // 상한 2만건 (orders 가 그 이상이면 별도 페이지네이션 도입 필요)
    const all: unknown[] = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      let query = supabase
        .from("orders")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(p * PAGE, (p + 1) * PAGE - 1);

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.dateFrom || filters?.dateTo) {
        if (filters.dateFrom) query = query.gte("date", filters.dateFrom);
        if (filters.dateTo) query = query.lte("date", filters.dateTo);
      } else if (filters?.date) {
        query = query.eq("date", filters.date);
      }
      if (filters?.search) {
        const s = filters.search;
        query = query.or(
          `customer_name.ilike.%${s}%,phone.ilike.%${s}%,address.ilike.%${s}%,order_number.ilike.%${s}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error("[orderStore.getAll]", error);
        return [];
      }
      const rows = data ?? [];
      all.push(...rows);
      if (rows.length < PAGE) break;
    }
    return all.map(dbToOrder);
  },

  async getById(id: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return dbToOrder(data);
  },

  async getBySessionId(sessionId: string): Promise<Order | null> {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return dbToOrder(data);
  },

  async create(
    order: Partial<Order> & {
      customerName: string;
      phone: string;
      date: string;
    }
  ): Promise<Order | null> {
    // 주문번호 생성 (충돌 시 최대 5회 재시도)
    let orderNumber = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateOrderNumber();
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("order_number", candidate)
        .maybeSingle();
      if (!existing) {
        orderNumber = candidate;
        break;
      }
    }
    if (!orderNumber) {
      console.error("[orderStore.create] 주문번호 생성 실패 (충돌)");
      return null;
    }

    const row = {
      order_number: orderNumber,
      session_id: order.sessionId || null,
      status: order.status || "confirmed",
      customer_name: order.customerName,
      phone: formatPhone(order.phone),
      address: order.address || "",
      date: order.date,
      time_slot: order.timeSlot || "",
      floor: order.floor ?? null,
      has_elevator: order.hasElevator ?? false,
      has_parking: order.hasParking ?? false,
      has_ground_access: order.hasGroundAccess ?? true,
      need_ladder: order.needLadder ?? false,
      ladder_fee: order.ladderFee || 0,
      crew_size: order.crewSize || 1,
      items: order.items || [],
      total_volume: order.totalVolume || 0,
      total_price: order.totalPrice || 0,
      payment_ids: order.paymentIds || [],
      memo: order.memo || "",
      photos: order.photos || [],
    };

    const { data, error } = await supabase
      .from("orders")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[orderStore.create]", error);
      return null;
    }

    return dbToOrder(data);
  },

  async update(id: string, updates: Partial<Order>): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};

    if (updates.status !== undefined) row.status = updates.status;
    if (updates.customerName !== undefined) row.customer_name = updates.customerName;
    if (updates.phone !== undefined) row.phone = formatPhone(updates.phone);
    if (updates.address !== undefined) row.address = updates.address;
    if (updates.date !== undefined) row.date = updates.date;
    if (updates.timeSlot !== undefined) row.time_slot = updates.timeSlot;
    if (updates.floor !== undefined) row.floor = updates.floor;
    if (updates.hasElevator !== undefined) row.has_elevator = updates.hasElevator;
    if (updates.hasParking !== undefined) row.has_parking = updates.hasParking;
    if (updates.hasGroundAccess !== undefined) row.has_ground_access = updates.hasGroundAccess;
    if (updates.needLadder !== undefined) row.need_ladder = updates.needLadder;
    if (updates.ladderFee !== undefined) row.ladder_fee = updates.ladderFee;
    if (updates.crewSize !== undefined) row.crew_size = updates.crewSize;
    if (updates.items !== undefined) row.items = updates.items;
    if (updates.totalVolume !== undefined) row.total_volume = updates.totalVolume;
    if (updates.totalPrice !== undefined) row.total_price = updates.totalPrice;
    if (updates.memo !== undefined) row.memo = updates.memo;
    if (updates.photos !== undefined) row.photos = updates.photos;
    if (updates.sessionId !== undefined) row.session_id = updates.sessionId;
    if (updates.driverId !== undefined) row.driver_id = updates.driverId;
    if (updates.driverName !== undefined) row.driver_name = updates.driverName;
    if (updates.driverPhone !== undefined) row.driver_phone = updates.driverPhone;
    if (updates.vehicleId !== undefined) row.vehicle_id = updates.vehicleId;
    if (updates.routeOrder !== undefined) row.route_order = updates.routeOrder;
    if (updates.isDispatched !== undefined) row.is_dispatched = updates.isDispatched;
    if (updates.dispatchedAt !== undefined) row.dispatched_at = updates.dispatchedAt;

    if (Object.keys(row).length === 0) return true;

    row.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("orders")
      .update(row)
      .eq("id", id);

    if (error) {
      console.error("[orderStore.update]", error);
      return false;
    }
    return true;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[orderStore.delete]", error);
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
      .from("orders")
      .update({
        payment_ids: updatedPaymentIds,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      console.error("[orderStore.addPaymentId]", error);
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

  // 같은 phone 의 가장 최근 channel 값 (자동 상속용 — 한 번 답한 고객은 다시 안 물음)
  async getRecentChannelByPhone(rawPhone: string): Promise<string | null> {
    const phone = formatPhone(rawPhone);
    const digits = rawPhone.replace(/\D/g, "");
    const candidates = digits.length === 11 ? [phone, digits, rawPhone] : [phone, rawPhone];
    const { data } = await supabase
      .from("orders")
      .select("channel, created_at")
      .in("phone", [...new Set(candidates)])
      .not("channel", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    return data?.[0]?.channel ?? null;
  },

  async setChannel(id: string, channel: string): Promise<boolean> {
    const { error } = await supabase
      .from("orders")
      .update({ channel, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[orderStore.setChannel]", error);
      return false;
    }
    return true;
  },
};
