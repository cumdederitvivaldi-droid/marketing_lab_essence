// [CS-CRON-014] NPS 일일 자동 발송 크론
// 매일 12:00 KST (= 03:00 UTC) — 어제 수거일이고 결제완료된 주문에 NPS 설문 발송.
//
// 가드:
//   - phone 평생 1회 (nps_responses UNIQUE)
//   - 채팅 세션 살아있음 (messages 마지막 created_at 7일 이내)

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { sendRichMessage } from "@/lib/happytalk/client";
import { conversationStore } from "@/lib/store/conversations";
import { npsStore, NPS_SCORE_BUCKETS } from "@/lib/store/nps";

export const maxDuration = 60;

const SESSION_ALIVE_DAYS = 7;
const NPS_INTRO_MESSAGE = "어제 커버링 방문수거를 이용해 주셔서 감사합니다 🙏\n답변은 익명으로 처리되니 부담 없이 솔직한 평을 부탁드릴게요 :)\n서비스에 얼마나 만족하셨는지 점수를 눌러 주세요.";

interface OrderRow {
  id: string;
  session_id: string | null;
  customer_name: string | null;
  phone: string | null;
}

function digitsOnly(raw: string): string { return raw.replace(/\D/g, ""); }
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = digitsOnly(raw);
  if (d.length === 11 && d.startsWith("010")) return d;
  return null;
}

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  // KST 기준 어제 (수거일)
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600 * 1000);
  const yKst = new Date(kstNow);
  yKst.setUTCDate(yKst.getUTCDate() - 1);
  const yesterdayStr = yKst.toISOString().slice(0, 10);

  try {
    const orders = await paginate<OrderRow>(() =>
      supabase
        .from("orders")
        .select("id, session_id, customer_name, phone")
        .eq("date", yesterdayStr)
        .eq("status", "completed"),
    );

    if (orders.length === 0) {
      return NextResponse.json({ ok: true, date: yesterdayStr, sent: 0, scanned: 0 });
    }

    // phone 정규화 + dedup
    const byPhone = new Map<string, OrderRow>();
    for (const o of orders) {
      const norm = normalizePhone(o.phone);
      if (!norm) continue;
      if (!byPhone.has(norm)) byPhone.set(norm, o);
    }

    // 평생 1회 가드 — nps_responses 에 이미 있는 phone 제외
    const phones = [...byPhone.keys()];
    const sentPhones = new Set<string>();
    if (phones.length > 0) {
      const allFormats = phones.flatMap((d) => [d, `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`]);
      const { data } = await supabase
        .from("nps_responses")
        .select("phone")
        .in("phone", allFormats);
      for (const r of data ?? []) {
        const n = normalizePhone(r.phone);
        if (n) sentPhones.add(n);
      }
    }

    // 세션 alive 체크
    const aliveCutoff = new Date(Date.now() - SESSION_ALIVE_DAYS * 86400000).toISOString();
    const sessionAlive = new Set<string>();
    const sessionIds = [...byPhone.values()].map((o) => o.session_id).filter((s): s is string => !!s);
    if (sessionIds.length > 0) {
      const { data } = await supabase
        .from("messages")
        .select("session_id, created_at")
        .in("session_id", sessionIds)
        .gte("created_at", aliveCutoff);
      for (const r of data ?? []) sessionAlive.add(r.session_id);
    }

    let sent = 0;
    let skippedSent = 0;
    let skippedDead = 0;
    let skippedNewerInquiry = 0;
    let failed = 0;

    for (const [phone, o] of byPhone.entries()) {
      if (sentPhones.has(phone)) { skippedSent++; continue; }
      if (!o.session_id || !sessionAlive.has(o.session_id)) { skippedDead++; continue; }

      let insertedId: string | null = null;
      try {
        const conv = await conversationStore.getById(o.session_id);
        if (!conv) { failed++; continue; }

        // 같은 user_key 의 더 최신 conversation 이 있으면 skip — 재인입 고객 보호
        if (conv.userKey) {
          const { data: newer } = await supabase
            .from("conversations")
            .select("session_id, created_at")
            .eq("user_key", conv.userKey)
            .gt("created_at", conv.createdAt)
            .limit(1);
          if (newer && newer.length > 0) {
            skippedNewerInquiry++;
            continue;
          }
        }
        const inserted = await npsStore.insertSent({
          phone,
          orderId: o.id,
          sessionId: o.session_id,
          customerName: o.customer_name,
        });
        if (!inserted) { failed++; continue; }
        insertedId = inserted.id;

        await sendRichMessage({
          user_key: conv.userKey,
          sender_key: conv.senderKey,
          message: NPS_INTRO_MESSAGE,
          buttons: NPS_SCORE_BUCKETS.map((name) => ({ name, type: "BK" })),
        });
        await conversationStore.addAssistantMessage(
          o.session_id,
          `[NPS 설문]\n${NPS_INTRO_MESSAGE}\n→ 1~2점 / 3점 / 4점 / 5점`,
          "AI",
          true,
        );
        sent++;
      } catch (err) {
        console.error(`[cron/nps-daily] ${phone} 실패:`, err);
        failed++;
        if (insertedId) {
          try { await supabase.from("nps_responses").delete().eq("id", insertedId); }
          catch (rollbackErr) { console.error(`[cron/nps-daily] rollback 실패 ${phone}:`, rollbackErr); }
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    return NextResponse.json({
      ok: true,
      date: yesterdayStr,
      scanned: byPhone.size,
      sent,
      skippedAlreadySent: skippedSent,
      skippedSessionDead: skippedDead,
      skippedNewerInquiry,
      failed,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/nps-daily] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
