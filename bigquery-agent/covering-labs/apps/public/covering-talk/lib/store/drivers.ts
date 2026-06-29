import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

export interface Driver {
  id: string;
  name: string;
  phone: string;
  memo: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── DB ↔ App 변환 ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToDriver(row: any): Driver {
  return {
    id: row.id,
    name: row.name || "",
    phone: row.phone || "",
    memo: row.memo || "",
    isActive: row.is_active ?? true,
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Store ──────────────────────────────────

export const driverStore = {
  async getAll(filters?: {
    activeOnly?: boolean;
  }): Promise<Driver[]> {
    let query = supabase
      .from("drivers")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (filters?.activeOnly !== false) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[driverStore.getAll]", error);
      return [];
    }
    return (data || []).map(dbToDriver);
  },

  async getById(id: string): Promise<Driver | null> {
    const { data, error } = await supabase
      .from("drivers")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return dbToDriver(data);
  },

  async create(
    driver: Partial<Driver> & { name: string }
  ): Promise<Driver | null> {
    const row = {
      name: driver.name,
      phone: driver.phone || "",
      memo: driver.memo || "",
      is_active: driver.isActive ?? true,
      sort_order: driver.sortOrder || 0,
    };

    const { data, error } = await supabase
      .from("drivers")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[driverStore.create]", error);
      return null;
    }
    return dbToDriver(data);
  },

  async update(id: string, updates: Partial<Driver>): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};

    if (updates.name !== undefined) row.name = updates.name;
    if (updates.phone !== undefined) row.phone = updates.phone;
    if (updates.memo !== undefined) row.memo = updates.memo;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

    if (Object.keys(row).length === 0) return true;

    row.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("drivers")
      .update(row)
      .eq("id", id);

    if (error) {
      console.error("[driverStore.update]", error);
      return false;
    }
    return true;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("drivers")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[driverStore.delete]", error);
      return false;
    }
    return true;
  },

  async deactivate(id: string): Promise<boolean> {
    return this.update(id, { isActive: false });
  },
};
