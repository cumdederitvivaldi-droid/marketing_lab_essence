import { supabase } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────

export interface Vehicle {
  id: string;
  plateNumber: string;
  vehicleType: string;   // '2.5톤' | '1톤 탑차' | '1톤 저상탑차'
  maxCube: number;
  memo: string;
  isActive: boolean;
  defaultDriverId: string | null;  // 고정 기사 (자동배차 시 함께 배정)
  createdAt: string;
  updatedAt: string;
}

// ─── DB ↔ App 변환 ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToVehicle(row: any): Vehicle {
  return {
    id: row.id,
    plateNumber: row.plate_number || "",
    vehicleType: row.vehicle_type || "",
    maxCube: Number(row.max_cube) || 0,
    memo: row.memo || "",
    isActive: row.is_active ?? true,
    defaultDriverId: row.default_driver_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Store ──────────────────────────────────

export const vehicleStore = {
  async getAll(filters?: {
    activeOnly?: boolean;
  }): Promise<Vehicle[]> {
    let query = supabase
      .from("vehicles")
      .select("*")
      .order("vehicle_type", { ascending: true })
      .order("plate_number", { ascending: true });

    if (filters?.activeOnly !== false) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[vehicleStore.getAll]", error);
      return [];
    }
    return (data || []).map(dbToVehicle);
  },

  async getById(id: string): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return dbToVehicle(data);
  },

  async create(
    vehicle: Partial<Vehicle> & { plateNumber: string; vehicleType: string }
  ): Promise<Vehicle | null> {
    const row = {
      plate_number: vehicle.plateNumber,
      vehicle_type: vehicle.vehicleType,
      max_cube: vehicle.maxCube || 0,
      memo: vehicle.memo || "",
      is_active: vehicle.isActive ?? true,
      default_driver_id: vehicle.defaultDriverId ?? null,
    };

    const { data, error } = await supabase
      .from("vehicles")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[vehicleStore.create]", error);
      return null;
    }
    return dbToVehicle(data);
  },

  async update(id: string, updates: Partial<Vehicle>): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {};

    if (updates.plateNumber !== undefined) row.plate_number = updates.plateNumber;
    if (updates.vehicleType !== undefined) row.vehicle_type = updates.vehicleType;
    if (updates.maxCube !== undefined) row.max_cube = updates.maxCube;
    if (updates.memo !== undefined) row.memo = updates.memo;
    if (updates.isActive !== undefined) row.is_active = updates.isActive;
    if (updates.defaultDriverId !== undefined) row.default_driver_id = updates.defaultDriverId;

    if (Object.keys(row).length === 0) return true;

    row.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from("vehicles")
      .update(row)
      .eq("id", id);

    if (error) {
      console.error("[vehicleStore.update]", error);
      return false;
    }
    return true;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[vehicleStore.delete]", error);
      return false;
    }
    return true;
  },
};
