/**
 * Supabase 1000행 제한을 우회하기 위한 페이지네이션 헬퍼.
 *
 * Supabase REST 는 한 번의 select 에 최대 1000행만 반환한다.
 * 대시보드 집계 쿼리는 수만 건을 다룰 수 있으므로 .range() 로 분할 호출 후 합친다.
 *
 * 사용법:
 *   const rows = await paginate<MyRow>(() =>
 *     supabase.from("orders").select("...").eq("status", "completed")
 *   );
 */

const PAGE_SIZE = 1000;

// supabase PostgrestFilterBuilder 의 정확한 generic 형은 호출자가 다양하므로
// 최소한의 .range() 시그니처만 요구한다
interface RangeableBuilder {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
}

export async function paginate<T>(buildQuery: () => unknown): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const builder = buildQuery() as RangeableBuilder;
    const { data, error } = await builder.range(from, to);
    if (error) {
      // 부분 데이터 silent 반환 금지 — 호출자가 try/catch 로 처리하도록 throw.
      // (1000행+ 데이터에서 page2 실패 시 page1 만 반환되면 집계 수치가 무음으로 깎임)
      throw new Error(`paginate failed at offset ${from}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}
