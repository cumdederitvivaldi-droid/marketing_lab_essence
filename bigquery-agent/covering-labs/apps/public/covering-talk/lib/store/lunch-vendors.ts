import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

export type SettlementType = "link_pay" | "monthly_invoice" | "tax_invoice";

export const SETTLEMENT_TYPE_LABELS: Record<SettlementType, string> = {
  link_pay: "링크페이",
  monthly_invoice: "월말정산",
  tax_invoice: "세금계산서",
};

export interface LunchVendor {
  id: string;
  name: string;
  address: string;
  ownerPhone: string;
  settlementType: SettlementType;
  memo: string;
  isActive: boolean;
  // 세금계산서 발행용
  businessNumber: string;
  representativeName: string;
  taxEmail: string;
  taxPhone: string; // 세금계산서용 연락처 (비어있으면 ownerPhone 사용)
  businessType: string;
  businessItem: string;
  businessCertUrl: string; // 사업자등록증 이미지 URL
  createdAt: string;
  updatedAt: string;
}

// ─── DB ↔ App 변환 ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToVendor(row: any): LunchVendor {
  return {
    id: row.id,
    name: row.name || "",
    address: row.address || "",
    ownerPhone: row.owner_phone || "",
    settlementType: row.settlement_type || "link_pay",
    memo: row.memo || "",
    isActive: row.is_active ?? true,
    businessNumber: row.business_number || "",
    representativeName: row.representative_name || "",
    taxEmail: row.tax_email || "",
    taxPhone: row.tax_phone || "",
    businessType: row.business_type || "",
    businessItem: row.business_item || "",
    businessCertUrl: row.business_cert_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Store ──────────────────────────────────

export const lunchVendorStore = {
  async getAll(filters?: {
    search?: string;
    activeOnly?: boolean;
  }): Promise<LunchVendor[]> {
    let query = supabase
      .from("lunch_vendors")
      .select("*")
      .order("name", { ascending: true });

    if (filters?.activeOnly !== false) {
      query = query.eq("is_active", true);
    }
    if (filters?.search) {
      const s = filters.search;
      query = query.or(
        `name.ilike.%${s}%,address.ilike.%${s}%,owner_phone.ilike.%${s}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      console.error("[lunchVendorStore.getAll]", error);
      return [];
    }
    return (data || []).map(dbToVendor);
  },

  async getById(id: string): Promise<LunchVendor | null> {
    const { data, error } = await supabase
      .from("lunch_vendors")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return dbToVendor(data);
  },

  async getByName(name: string): Promise<LunchVendor | null> {
    const { data, error } = await supabase
      .from("lunch_vendors")
      .select("*")
      .eq("name", name)
      .single();

    if (error || !data) return null;
    return dbToVendor(data);
  },

  async create(
    vendor: Partial<LunchVendor> & { name: string }
  ): Promise<LunchVendor | null> {
    const row = {
      name: vendor.name,
      address: vendor.address || "",
      owner_phone: vendor.ownerPhone || "",
      settlement_type: vendor.settlementType || "link_pay",
      memo: vendor.memo || "",
      is_active: vendor.isActive ?? true,
      business_number: vendor.businessNumber || "",
      representative_name: vendor.representativeName || "",
      tax_email: vendor.taxEmail || "",
      tax_phone: vendor.taxPhone || "",
      business_type: vendor.businessType || "",
      business_item: vendor.businessItem || "",
      business_cert_url: vendor.businessCertUrl || "",
    };

    const { data, error } = await supabase
      .from("lunch_vendors")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[lunchVendorStore.create]", error);
      return null;
    }
    return dbToVendor(data);
  },

  async update(id: string, updates: Partial<LunchVendor>): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};

    if (updates.name !== undefined) row.name = updates.name;
    if (updates.address !== undefined) row.address = updates.address;
    if (updates.ownerPhone !== undefined) row.owner_phone = updates.ownerPhone;
    if (updates.settlementType !== undefined) row.settlement_type = updates.settlementType;
    if (updates.memo !== undefined) row.memo = updates.memo;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.businessNumber !== undefined) row.business_number = updates.businessNumber;
    if (updates.representativeName !== undefined) row.representative_name = updates.representativeName;
    if (updates.taxEmail !== undefined) row.tax_email = updates.taxEmail;
    if (updates.taxPhone !== undefined) row.tax_phone = updates.taxPhone;
    if (updates.businessType !== undefined) row.business_type = updates.businessType;
    if (updates.businessItem !== undefined) row.business_item = updates.businessItem;
    if (updates.businessCertUrl !== undefined) row.business_cert_url = updates.businessCertUrl;

    if (Object.keys(row).length === 0) return true;

    row.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("lunch_vendors")
      .update(row)
      .eq("id", id);

    if (error) {
      console.error("[lunchVendorStore.update]", error);
      return false;
    }
    return true;
  },

  /** 소프트 삭제 (is_active = false) */
  async deactivate(id: string): Promise<boolean> {
    return this.update(id, { isActive: false });
  },
};
