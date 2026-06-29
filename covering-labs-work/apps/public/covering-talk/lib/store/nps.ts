// NPS 응답 저장소 — 방문수거 결제완료 (orders.status='completed') 고객 대상.
// phone 기준 평생 1회 (재예약 고객도 한 번만 묻기).

import { supabase } from "@/lib/supabase/client";

export type NpsScoreBucket = "1~2점" | "3점" | "4점" | "5점";
export const NPS_SCORE_BUCKETS: readonly NpsScoreBucket[] = ["1~2점", "3점", "4점", "5점"] as const;

export interface NpsResponse {
  id: string;
  phone: string;
  orderId: string | null;
  sessionId: string | null;
  customerName: string | null;
  sentAt: string;
  scoreBucket: NpsScoreBucket | null;
  respondedAt: string | null;
  feedbackText: string | null;
  feedbackAt: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbToNps(row: any): NpsResponse {
  return {
    id: row.id,
    phone: row.phone,
    orderId: row.order_id ?? null,
    sessionId: row.session_id ?? null,
    customerName: row.customer_name ?? null,
    sentAt: row.sent_at,
    scoreBucket: row.score_bucket ?? null,
    respondedAt: row.responded_at ?? null,
    feedbackText: row.feedback_text ?? null,
    feedbackAt: row.feedback_at ?? null,
    createdAt: row.created_at,
  };
}

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export const npsStore = {
  /** phone 정규화 후 (digits only) 이미 발송 이력 있는지 확인 — 평생 1회 가드 */
  async hasBeenSent(rawPhone: string): Promise<boolean> {
    const digits = digitsOnly(rawPhone);
    if (digits.length !== 11) return false;
    const hyphenated = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    const { data } = await supabase
      .from("nps_responses")
      .select("id")
      .in("phone", [...new Set([digits, hyphenated, rawPhone])])
      .limit(1);
    return (data?.length ?? 0) > 0;
  },

  /** 발송 시 row insert (phone UNIQUE 라 중복 시도 시 실패) */
  async insertSent(args: {
    phone: string;
    orderId?: string | null;
    sessionId?: string | null;
    customerName?: string | null;
  }): Promise<NpsResponse | null> {
    const { data, error } = await supabase
      .from("nps_responses")
      .insert({
        phone: args.phone,
        order_id: args.orderId ?? null,
        session_id: args.sessionId ?? null,
        customer_name: args.customerName ?? null,
      })
      .select()
      .single();
    if (error) {
      console.error("[npsStore.insertSent]", error);
      return null;
    }
    return dbToNps(data);
  },

  /** phone 기준 row 조회 — 정규화 양쪽 표기 모두 시도 */
  async getByPhone(rawPhone: string): Promise<NpsResponse | null> {
    const digits = digitsOnly(rawPhone);
    if (digits.length !== 11) return null;
    const hyphenated = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    const { data } = await supabase
      .from("nps_responses")
      .select("*")
      .in("phone", [...new Set([digits, hyphenated, rawPhone])])
      .order("sent_at", { ascending: false })
      .limit(1);
    return data?.[0] ? dbToNps(data[0]) : null;
  },

  async setScore(id: string, scoreBucket: NpsScoreBucket): Promise<boolean> {
    const { error } = await supabase
      .from("nps_responses")
      .update({ score_bucket: scoreBucket, responded_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[npsStore.setScore]", error);
      return false;
    }
    return true;
  },

  async setFeedback(id: string, feedbackText: string): Promise<boolean> {
    const { error } = await supabase
      .from("nps_responses")
      .update({ feedback_text: feedbackText, feedback_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[npsStore.setFeedback]", error);
      return false;
    }
    return true;
  },
};
