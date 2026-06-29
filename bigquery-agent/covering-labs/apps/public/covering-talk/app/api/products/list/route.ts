import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/session";
import { auditStore, diffObjects } from "@/lib/store/audit-logs";
import { generateAndSaveEmbedding } from "@/lib/ai/voyage";
import { invalidateProductCache } from "@/lib/utils/product-cache";

// [CS-ITM-001] 품목 목록 조회
export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get("category");
  const itemGroup = request.nextUrl.searchParams.get("item_group");

  let query = supabase
    .from("products")
    .select("*")
    .order("category")
    .order("name");

  if (category) {
    query = query.eq("category", category);
  }
  if (itemGroup) {
    query = query.eq("item_group", itemGroup);
  }

  const { data, error } = await query;

  if (error) {
    // Supabase 오류 시 로컬 JSON fallback
    try {
      const products = (await import("@/lib/data/products.json")).default;
      const filtered = category
        ? products.filter((p: { category: string }) => p.category === category)
        : products;
      return NextResponse.json({ products: filtered, source: "local" });
    } catch {
      return NextResponse.json({ products: [], error: error.message }, { status: 500 });
    }
  }

  // 카테고리 + item_group 목록도 함께 반환
  const { data: categories } = await supabase
    .from("products")
    .select("category, item_group")
    .order("category");

  const uniqueCategories = [...new Set((categories ?? []).map((c: { category: string }) => c.category))];
  const uniqueItemGroups = [...new Set((categories ?? []).map((c: { item_group: string }) => c.item_group).filter(Boolean))].sort();

  return NextResponse.json({ products: data ?? [], categories: uniqueCategories, itemGroups: uniqueItemGroups });
}

// [CS-ITM-002] 품목 등록
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { category, name, display_name, width, depth, height, volume, unit_price, weight, item_group, aliases } = body;

  if (!category || !name) {
    return NextResponse.json({ error: "category와 name은 필수입니다" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      category,
      name,
      display_name: display_name || `${category} - ${name}`,
      width: width ?? 0,
      depth: depth ?? 0,
      height: height ?? 0,
      volume: volume ?? 0,
      unit_price: unit_price ?? 0,
      weight: weight ?? 0,
      item_group: item_group || category,
      aliases: aliases ?? [],
    })
    .select()
    .single();

  if (error) {
    console.error("[products] insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // audit log
  const user = await getCurrentUser();
  if (user && data) {
    auditStore.log({
      entityType: "product",
      entityId: String(data.id),
      action: "create",
      changes: {},
      description: `품목 추가: ${item_group || category} - ${name}`,
      userId: user.id,
      userName: user.name,
    });
  }

  // 임베딩 자동 생성 + 캐시 무효화
  if (data) {
    invalidateProductCache();
    generateAndSaveEmbedding(data.id, {
      item_group: data.item_group,
      name: data.name,
      category: data.category,
      aliases: data.aliases,
    }).catch((err) => console.error("[products] 임베딩 생성 실패:", err));
  }

  return NextResponse.json({ product: data });
}

// [CS-ITM-003] 품목 수정
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
  }

  // 기존 데이터 조회 (변경 비교용)
  const { data: existing } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[products] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // audit log
  const user = await getCurrentUser();
  if (user && existing) {
    const changes = diffObjects(existing, updates);
    if (Object.keys(changes).length > 0) {
      const fields = Object.keys(changes).join(", ");
      auditStore.log({
        entityType: "product",
        entityId: String(id),
        action: "update",
        changes,
        description: `품목 수정 (${existing.item_group || existing.category} - ${existing.name}): ${fields}`,
        userId: user.id,
        userName: user.name,
      });
    }
  }

  // 임베딩 관련 필드 변경 시 재생성 + 캐시 무효화
  if (data) {
    const embeddingFields = ["category", "name", "item_group", "aliases"];
    const needsReembed = embeddingFields.some((f) => f in updates);
    invalidateProductCache();
    if (needsReembed) {
      generateAndSaveEmbedding(data.id, {
        item_group: data.item_group,
        name: data.name,
        category: data.category,
      }).catch((err) => console.error("[products] 임베딩 재생성 실패:", err));
    }
  }

  return NextResponse.json({ product: data });
}

// [CS-ITM-004] 품목 삭제
export async function DELETE(request: NextRequest) {
  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "id는 필수입니다" }, { status: 400 });
  }

  // 기존 데이터 조회 (로그용)
  const { data: existing } = await supabase
    .from("products")
    .select("category, name, item_group")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    console.error("[products] delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateProductCache();

  // audit log
  const user = await getCurrentUser();
  if (user) {
    auditStore.log({
      entityType: "product",
      entityId: String(id),
      action: "delete",
      changes: {},
      description: `품목 삭제: ${existing?.item_group || existing?.category || ""} - ${existing?.name || id}`,
      userId: user.id,
      userName: user.name,
    });
  }

  return NextResponse.json({ status: "ok" });
}
