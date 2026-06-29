import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

/**
 * GET /api/products/siblings?id=<productId>&candidateIds=1,2,3
 * 같은 item_group 내 다른 변형 제품 반환 + 임베딩 유사 후보 병합
 */
// [CS-ITM-006] 유사 품목 조회
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const candidateIdsParam = request.nextUrl.searchParams.get("candidateIds");
  if (!id) {
    return NextResponse.json({ siblings: [] });
  }

  const productId = parseInt(id);
  if (isNaN(productId)) {
    return NextResponse.json({ siblings: [] });
  }

  // 1. 해당 제품의 item_group 조회
  const { data: product } = await supabase
    .from("products")
    .select("id, item_group, category")
    .eq("id", productId)
    .single();

  if (!product) {
    return NextResponse.json({ siblings: [] });
  }

  const formatSibling = (r: {
    id: number;
    name: string;
    category: string;
    item_group: string;
    unit_price: number;
    volume: number;
    weight: number;
    display_name: string;
  }) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    itemGroup: r.item_group,
    unitPrice: r.unit_price,
    volume: r.volume,
    weight: r.weight,
    displayName: r.display_name,
  });

  const siblings: ReturnType<typeof formatSibling>[] = [];
  const seenIds = new Set<number>([productId]);

  // 2. 같은 item_group의 다른 제품들 검색
  const itemGroup = product.item_group ?? product.category;
  const { data: groupData } = await supabase
    .from("products")
    .select("id, name, category, item_group, unit_price, volume, weight, display_name")
    .eq("item_group", itemGroup)
    .neq("id", productId)
    .order("unit_price", { ascending: true });

  for (const r of groupData ?? []) {
    if (!seenIds.has(r.id)) {
      siblings.push(formatSibling(r));
      seenIds.add(r.id);
    }
  }

  // 3. item_group != category인 경우 category 폴백
  if (!siblings.length && itemGroup !== product.category) {
    const { data: catData } = await supabase
      .from("products")
      .select("id, name, category, item_group, unit_price, volume, weight, display_name")
      .eq("category", product.category)
      .neq("id", productId)
      .order("unit_price", { ascending: true });

    for (const r of catData ?? []) {
      if (!seenIds.has(r.id)) {
        siblings.push(formatSibling(r));
        seenIds.add(r.id);
      }
    }
  }

  // 4. 임베딩 후보 병합 (candidateIds 파라미터)
  if (candidateIdsParam) {
    const candidateIds = candidateIdsParam.split(",").map(Number).filter((n) => !isNaN(n) && !seenIds.has(n));
    if (candidateIds.length > 0) {
      const { data: candidateData } = await supabase
        .from("products")
        .select("id, name, category, item_group, unit_price, volume, weight, display_name")
        .in("id", candidateIds);

      for (const r of candidateData ?? []) {
        if (!seenIds.has(r.id)) {
          siblings.push(formatSibling(r));
          seenIds.add(r.id);
        }
      }
    }
  }

  return NextResponse.json({ siblings });
}
