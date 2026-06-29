import { supabaseAdmin } from "@/lib/supabase/client";
import type { ParsedRecipientRow } from "@/lib/sweettracker/types";

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "failed"
  | "cancelled";

export interface BrandMessageCampaign {
  id: string;
  label: string;
  group_tag: string | null;
  message_type: string;
  scheduled_at: string | null;
  status: CampaignStatus;
  total_count: number;
  sent_count: number;
  failed_count: number;
  /** API GET 응답에서만 enrich — DB 컬럼 아님 */
  converted_count?: number;
  /** API GET 응답에서만 enrich — 전환된 주문들의 total_price 합계 */
  converted_revenue?: number;
  excel_filename: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface BrandMessageRecipient {
  id: string;
  campaign_id: string;
  phone: string;
  msgid: string;
  message: string;
  image_url: string | null;
  image_link: string | null;
  buttons: unknown | null;
  coupon: unknown | null;
  sent_at: string | null;
  result_code: string | null;
  result_message: string | null;
  origin_code: string | null;
  origin_error: string | null;
  converted_at: string | null;
  converted_kind: string | null;
  converted_session_id: string | null;
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  converted: number;
  /** 전환된 session 들의 orders.total_price 합계 */
  converted_revenue: number;
}

export async function createCampaign(params: {
  label: string;
  group_tag?: string;
  message_type: string;
  scheduled_at?: string | null;
  created_by: string;
  excel_filename?: string;
  notes?: string;
  total_count?: number;
}): Promise<BrandMessageCampaign> {
  const { data, error } = await supabaseAdmin
    .from("brand_message_campaigns")
    .insert({
      label: params.label,
      group_tag: params.group_tag ?? null,
      message_type: params.message_type,
      scheduled_at: params.scheduled_at ?? null,
      created_by: params.created_by,
      excel_filename: params.excel_filename ?? null,
      notes: params.notes ?? null,
      total_count: params.total_count ?? 0,
    })
    .select()
    .single();

  if (error) throw new Error(`캠페인 생성 실패: ${error.message}`);
  return data as BrandMessageCampaign;
}

export async function getCampaignById(id: string): Promise<BrandMessageCampaign | null> {
  const { data, error } = await supabaseAdmin
    .from("brand_message_campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`캠페인 조회 실패: ${error.message}`);
  }
  return data as BrandMessageCampaign;
}

export async function listCampaigns(params?: {
  limit?: number;
  status?: CampaignStatus;
}): Promise<BrandMessageCampaign[]> {
  let query = supabaseAdmin
    .from("brand_message_campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (params?.status) query = query.eq("status", params.status);
  if (params?.limit) query = query.limit(params.limit);

  const { data, error } = await query;
  if (error) throw new Error(`캠페인 목록 조회 실패: ${error.message}`);
  return (data ?? []) as BrandMessageCampaign[];
}

export async function updateCampaign(
  id: string,
  patch: Partial<BrandMessageCampaign>
): Promise<BrandMessageCampaign> {
  const { data, error } = await supabaseAdmin
    .from("brand_message_campaigns")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`캠페인 수정 실패: ${error.message}`);
  return data as BrandMessageCampaign;
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("brand_message_campaigns")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`캠페인 삭제 실패: ${error.message}`);
}

export async function bulkInsertRecipients(
  campaign_id: string,
  rows: ParsedRecipientRow[],
  getMsgid: (rowIdx: number) => string
): Promise<number> {
  const CHUNK_SIZE = 1000;
  let insertedCount = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const records = chunk.map((row, chunkIdx) => ({
      campaign_id,
      phone: row.phone,
      msgid: getMsgid(i + chunkIdx),
      message: row.message,
      image_url: row.imageUrl ?? null,
      image_link: row.imageLink ?? null,
      buttons: row.buttons.length > 0 ? row.buttons : null,
      coupon: row.coupon ?? null,
    }));

    const { error } = await supabaseAdmin
      .from("brand_message_recipients")
      .insert(records);

    if (error) throw new Error(`수신자 INSERT 실패 (chunk ${i}): ${error.message}`);
    insertedCount += chunk.length;
  }

  return insertedCount;
}

export async function getPendingRecipients(
  campaign_id: string,
  limit: number
): Promise<BrandMessageRecipient[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_message_recipients")
    .select("*")
    .eq("campaign_id", campaign_id)
    .is("sent_at", null)
    .limit(limit);

  if (error) throw new Error(`대기 수신자 조회 실패: ${error.message}`);
  return (data ?? []) as BrandMessageRecipient[];
}

export async function markRecipientResult(
  id: string,
  result: {
    sent_at?: string;
    result_code?: string;
    result_message?: string;
    origin_code?: string;
    origin_error?: string;
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("brand_message_recipients")
    .update(result)
    .eq("id", id);

  if (error) throw new Error(`수신자 결과 업데이트 실패: ${error.message}`);
}

// 여러 캠페인의 카운트 통계를 한 번의 RPC 호출로 산출.
//   기존 getCampaignStats 는 캠페인당 5 카운트 쿼리 → N 캠페인이면 5N 쿼리.
//   이 함수는 PostgreSQL COUNT(*) FILTER (...) GROUP BY 로 1쿼리. (migration 041 필수)
//   skipRevenue=false 면 결과를 받아 추가로 매출 계산 (캠페인당 추가 쿼리).
export async function getCampaignStatsBatch(
  campaign_ids: string[],
  opts?: { skipRevenue?: boolean },
): Promise<Map<string, CampaignStats>> {
  if (campaign_ids.length === 0) return new Map();

  const { data, error } = await supabaseAdmin.rpc("brand_message_campaign_stats", {
    campaign_ids,
  });
  if (error) throw new Error(`stats RPC 실패: ${error.message}`);

  const result = new Map<string, CampaignStats>();
  for (const row of (data as Array<{
    campaign_id: string; total: number; sent: number; failed: number;
    pending: number; converted: number;
  }> ?? [])) {
    result.set(row.campaign_id, {
      total: Number(row.total) || 0,
      sent: Number(row.sent) || 0,
      failed: Number(row.failed) || 0,
      pending: Number(row.pending) || 0,
      converted: Number(row.converted) || 0,
      converted_revenue: 0,
    });
  }
  // RPC 응답에 없는 캠페인 (recipient 0건) 도 빈 stats 채워줌
  for (const id of campaign_ids) {
    if (!result.has(id)) {
      result.set(id, { total: 0, sent: 0, failed: 0, pending: 0, converted: 0, converted_revenue: 0 });
    }
  }

  // 매출 합산 — converted 가 0 보다 큰 캠페인만 대상
  if (!opts?.skipRevenue) {
    const revenueTargets = [...result.entries()].filter(([, s]) => s.converted > 0).map(([id]) => id);
    await Promise.all(revenueTargets.map(async (id) => {
      const { data: convRows } = await supabaseAdmin
        .from("brand_message_recipients")
        .select("converted_session_id")
        .eq("campaign_id", id)
        .not("converted_session_id", "is", null);
      const sessionIds = (convRows ?? [])
        .map((r) => r.converted_session_id as string | null)
        .filter((v): v is string => !!v);
      if (sessionIds.length === 0) return;
      let rev = 0;
      const CHUNK = 500;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const { data: orders } = await supabaseAdmin
          .from("orders")
          .select("total_price")
          .in("session_id", chunk)
          .in("status", ["confirmed", "payment_requested", "prepaid", "completed"]);
        rev += (orders ?? []).reduce((s, o) => s + (Number(o.total_price) || 0), 0);
      }
      const stats = result.get(id);
      if (stats) stats.converted_revenue = rev;
    }));
  }

  return result;
}

export async function getCampaignStats(
  campaign_id: string,
  opts?: { skipRevenue?: boolean },
): Promise<CampaignStats> {
  // Supabase 기본 1000건 제한 우회 — count:exact head:true 로 행 로드 없이 카운트만.
  // K000 (카카오 비즈메시지 성공) / M000 (대체 SMS 성공) 모두 성공으로 카운트.
  const base = () => supabaseAdmin
    .from("brand_message_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaign_id);

  const [totalRes, sentRes, failedRes, pendingRes, convertedRes] = await Promise.all([
    base(),
    base().not("sent_at", "is", null).in("result_code", ["K000", "M000"]),
    base().not("sent_at", "is", null).not("result_code", "in", "(K000,M000)"),
    base().is("sent_at", null),
    base().not("converted_at", "is", null),
  ]);

  if (totalRes.error) throw new Error(`캠페인 통계 조회 실패: ${totalRes.error.message}`);

  // 전환 매출 — converted_session_id 들의 orders.total_price 합. active 상태(confirmed/payment_requested/completed) 만.
  // skipRevenue=true 면 0 으로 즉시 반환 (폴링 시 쿼리 부하 회피)
  let converted_revenue = 0;
  if (!opts?.skipRevenue && (convertedRes.count ?? 0) > 0) {
    const { data: convRows } = await supabaseAdmin
      .from("brand_message_recipients")
      .select("converted_session_id")
      .eq("campaign_id", campaign_id)
      .not("converted_session_id", "is", null);
    const sessionIds = (convRows ?? [])
      .map((r) => r.converted_session_id as string | null)
      .filter((v): v is string => !!v);
    if (sessionIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const { data: orders } = await supabaseAdmin
          .from("orders")
          .select("total_price")
          .in("session_id", chunk)
          .in("status", ["confirmed", "payment_requested", "prepaid", "completed"]);
        converted_revenue += (orders ?? []).reduce((s, o) => s + (Number(o.total_price) || 0), 0);
      }
    }
  }

  return {
    total: totalRes.count ?? 0,
    sent: sentRes.count ?? 0,
    failed: failedRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    converted: convertedRes.count ?? 0,
    converted_revenue,
  };
}

// 전화번호로 최근 발송된 브랜드메시지 캠페인 조회 — 상담 들어왔을 때 "어느 캠페인에서 왔는지" 표시용.
//   sent_at 이 14일 이내인 매칭 row 중 가장 최근 1건. 발송 안 됐거나 14일 초과면 null.
export async function lookupCampaignByPhone(phone: string): Promise<
  | {
      campaign_id: string;
      campaign_label: string;
      group_tag: string | null;
      sent_at: string;
      result_code: string | null;
    }
  | null
> {
  const normalized = phone.replace(/[\s\-()]/g, "");
  if (!normalized) return null;
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("brand_message_recipients")
    .select("campaign_id, sent_at, result_code, brand_message_campaigns!inner(label, group_tag)")
    .eq("phone", normalized)
    .not("sent_at", "is", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[brand-message] lookupByPhone error:", error.message);
    return null;
  }
  if (!data) return null;

  // join 결과 — Supabase 가 brand_message_campaigns 를 객체로 반환
  const camp = (data as unknown as { brand_message_campaigns: { label: string; group_tag: string | null } }).brand_message_campaigns;

  return {
    campaign_id: data.campaign_id as string,
    campaign_label: camp?.label ?? "(이름 없음)",
    group_tag: camp?.group_tag ?? null,
    sent_at: data.sent_at as string,
    result_code: (data.result_code as string | null) ?? null,
  };
}

// 캠페인 내 모든 수신자에게 동일한 메시지 내용 일괄 적용 (전화번호 제외).
// status='draft' 인 경우에만 호출 가능 — 발송 이후 변경 금지.
export async function bulkUpdateRecipientsContent(
  campaign_id: string,
  patch: {
    message?: string;
    image_url?: string | null;
    image_link?: string | null;
    buttons?: unknown[] | null;
    coupon?: unknown | null;
  }
): Promise<number> {
  const update: Record<string, unknown> = {};
  if (patch.message !== undefined) update.message = patch.message;
  if (patch.image_url !== undefined) update.image_url = patch.image_url;
  if (patch.image_link !== undefined) update.image_link = patch.image_link;
  if (patch.buttons !== undefined) update.buttons = patch.buttons;
  if (patch.coupon !== undefined) update.coupon = patch.coupon;

  if (Object.keys(update).length === 0) return 0;

  // count:exact 로 영향 받은 행 수 파악
  const { error, count } = await supabaseAdmin
    .from("brand_message_recipients")
    .update(update, { count: "exact" })
    .eq("campaign_id", campaign_id);

  if (error) throw new Error(`수신자 일괄 수정 실패: ${error.message}`);
  return count ?? 0;
}

// 캠페인 발송 후 7일 내 phone 매칭으로 orders 전환 backfill.
// converted_at IS NULL 인 수신자만 대상 → idempotent.
export async function backfillConversions(campaign_id: string): Promise<{ matched: number }> {
  const campaign = await getCampaignById(campaign_id);
  if (!campaign?.started_at) return { matched: 0 };

  const windowStart = campaign.started_at;
  const windowEnd = new Date(new Date(campaign.started_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // 전환 대상 수신자 페이징 (1000건씩)
  const allRecipients: BrandMessageRecipient[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("brand_message_recipients")
      .select("id, phone, sent_at")
      .eq("campaign_id", campaign_id)
      .not("sent_at", "is", null)
      .is("converted_at", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`수신자 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    allRecipients.push(...(data as BrandMessageRecipient[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  if (allRecipients.length === 0) return { matched: 0 };

  const recipientPhoneSet = new Set(allRecipients.map((r) => r.phone));

  // 윈도우 내 전환 대상 orders 페이징
  type OrderRow = { phone: string; created_at: string; session_id: string | null };
  const allOrders: OrderRow[] = [];
  offset = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("phone, created_at, session_id")
      .in("status", ["confirmed", "payment_requested", "prepaid", "completed"])
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`orders 조회 실패: ${error.message}`);
    if (!data || data.length === 0) break;
    allOrders.push(...(data as OrderRow[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // phone 매칭 (양쪽 normalize) + phone 별 가장 이른 order
  const normalize = (p: string) => p.replace(/[^0-9]/g, "");
  const bestOrderByPhone = new Map<string, OrderRow>();
  for (const order of allOrders) {
    const norm = normalize(order.phone);
    if (!recipientPhoneSet.has(norm)) continue;
    const existing = bestOrderByPhone.get(norm);
    if (!existing || order.created_at < existing.created_at) {
      bestOrderByPhone.set(norm, order);
    }
  }
  if (bestOrderByPhone.size === 0) return { matched: 0 };

  // 매칭된 수신자 update (병렬)
  const updates = allRecipients
    .filter((r) => bestOrderByPhone.has(r.phone))
    .map((r) => {
      const order = bestOrderByPhone.get(r.phone)!;
      return supabaseAdmin
        .from("brand_message_recipients")
        .update({
          converted_at: order.created_at,
          converted_kind: "order",
          converted_session_id: order.session_id,
        })
        .eq("id", r.id)
        .is("converted_at", null);
    });

  await Promise.all(updates);
  return { matched: bestOrderByPhone.size };
}

export async function getRecipients(params: {
  campaign_id: string;
  status?: "pending" | "sent" | "failed";
  limit?: number;
  offset?: number;
}): Promise<BrandMessageRecipient[]> {
  let query = supabaseAdmin
    .from("brand_message_recipients")
    .select("*")
    .eq("campaign_id", params.campaign_id)
    .order("id")
    .limit(params.limit ?? 100)
    .range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 100) - 1);

  if (params.status === "pending") {
    query = query.is("sent_at", null);
  } else if (params.status === "sent") {
    query = query.not("sent_at", "is", null).in("result_code", ["K000", "M000"]);
  } else if (params.status === "failed") {
    // sent_at 있고 + (result_code 가 K000/M000 둘 다 아님)
    query = query.not("sent_at", "is", null).not("result_code", "in", "(K000,M000)");
  }

  const { data, error } = await query;
  if (error) throw new Error(`수신자 목록 조회 실패: ${error.message}`);
  return (data ?? []) as BrandMessageRecipient[];
}
