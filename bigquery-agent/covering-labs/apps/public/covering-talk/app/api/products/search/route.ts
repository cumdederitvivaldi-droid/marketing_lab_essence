import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// [CS-ITM-005] 품목 검색
export async function GET(request: NextRequest) {
  // ID로 단건 조회
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const { data } = await supabase.from("products").select("*").eq("id", Number(id)).limit(1);
    return NextResponse.json({ products: data ?? [] });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ products: [] });
  }

  // Supabase에서 검색 (item_group + aliases + ilike)
  // 1차: item_group 정확 매칭
  const { data: groupData } = await supabase
    .from("products")
    .select("*")
    .eq("item_group", q)
    .order("category")
    .limit(20);

  if (groupData && groupData.length > 0) {
    return NextResponse.json({ products: groupData });
  }

  // 2차: aliases 배열 매칭
  const { data: aliasData } = await supabase
    .from("products")
    .select("*")
    .contains("aliases", [q])
    .order("category")
    .limit(20);

  if (aliasData && aliasData.length > 0) {
    return NextResponse.json({ products: aliasData });
  }

  // 3차: ilike 검색 (기존 + item_group)
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .or(`category.ilike.%${q}%,name.ilike.%${q}%,display_name.ilike.%${q}%,item_group.ilike.%${q}%`)
    .order("category")
    .limit(20);

  if (error) {
    console.error("[products/search] error:", error);
    // Supabase 테이블이 없으면 로컬 JSON fallback
    try {
      const products = (await import("@/lib/data/products.json")).default;
      const filtered = products.filter(
        (p: { category: string; name: string; displayName: string }) =>
          p.category.includes(q) || p.name.includes(q) || p.displayName.includes(q)
      ).slice(0, 20).map((p: { category: string; name: string; displayName: string; width: number; depth: number; height: number; volume: number; unitPrice: number; weight: number }) => ({
        category: p.category,
        name: p.name,
        display_name: p.displayName,
        width: p.width,
        depth: p.depth,
        height: p.height,
        volume: p.volume,
        unit_price: p.unitPrice,
        weight: p.weight,
      }));
      return NextResponse.json({ products: filtered });
    } catch {
      return NextResponse.json({ products: [] });
    }
  }

  return NextResponse.json({ products: data ?? [] });
}
