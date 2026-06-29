// [CS-LAB-019] NPS 일회성 bulk 발송 — 실제 발송 (after() 백그라운드)
//
// preview 와 동일한 모집단:
//   1. orders.status = 'completed' 이며 해당 월 (KST) 안의 주문
//   2. nps_responses 에 phone 발송 이력 없음 (평생 1회)
//   3. 채팅 세션 살아있음 (messages 마지막 created_at 7일 이내)
//
// 확인 텍스트 "BULK_NPS_SEND" 필수. 김원빈 / 강성진 전용.

import { NextRequest, NextResponse, after } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import { sendRichMessage } from "@/lib/happytalk/client";
import { conversationStore } from "@/lib/store/conversations";
import { npsStore, NPS_SCORE_BUCKETS } from "@/lib/store/nps";

export const maxDuration = 300;

const SESSION_ALIVE_DAYS = 7;
const NPS_INTRO_MESSAGE = "커버링 방문수거를 이용해 주셔서 감사합니다 🙏\n답변은 익명으로 처리되니 부담 없이 솔직한 평을 부탁드릴게요 :)\n서비스에 얼마나 만족하셨는지 점수를 눌러 주세요.";

interface OrderRow {
  id: string;
  session_id: string | null;
  customer_name: string | null;
  phone: string | null;
  status: string;
  date: string | null;
  created_at: string;
}

function digitsOnly(raw: string): string { return raw.replace(/\D/g, ""); }

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = digitsOnly(raw);
  if (d.length === 11 && d.startsWith("010")) return d;
  return null;
}

function monthRangeKst(yyyymm: string): { startIso: string; endIso: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const startIso = new Date(`${yyyymm}-01T00:00:00+09:00`).toISOString();
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const endIso = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`).toISOString();
  return { startIso, endIso };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body.confirm !== "BULK_NPS_SEND") {
    return NextResponse.json({ error: "confirm 필드 필요 (BULK_NPS_SEND)" }, { status: 400 });
  }

  // fromDate/toDate (YYYY-MM-DD KST) 우선. 없으면 month (default: 이번 달).
  const now = new Date();
  const nowKst = new Date(now.getTime() + 9 * 3600 * 1000);
  let startIso: string;
  let endIso: string;
  let label: string;
  if (typeof body.fromDate === "string" && typeof body.toDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate)) {
    startIso = new Date(`${body.fromDate}T00:00:00+09:00`).toISOString();
    endIso = new Date(`${body.toDate}T23:59:59.999+09:00`).toISOString();
    label = `${body.fromDate} ~ ${body.toDate}`;
  } else {
    const defaultMonth = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = (typeof body.month === "string" && /^\d{4}-\d{2}$/.test(body.month)) ? body.month : defaultMonth;
    const range = monthRangeKst(month);
    startIso = range.startIso;
    endIso = range.endIso;
    label = `${month}월 (전체)`;
  }

  const orders = await paginate<OrderRow>(() =>
    supabase
      .from("orders")
      .select("id, session_id, customer_name, phone, status, date, created_at")
      .eq("status", "completed")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  );

  const byPhone = new Map<string, OrderRow>();
  for (const o of orders) {
    const norm = normalizePhone(o.phone);
    if (!norm) continue;
    const prev = byPhone.get(norm);
    if (!prev || prev.created_at < o.created_at) byPhone.set(norm, o);
  }

  const phones = [...byPhone.keys()];
  const sentPhones = new Set<string>();
  if (phones.length > 0) {
    const CHUNK = 250;
    for (let i = 0; i < phones.length; i += CHUNK) {
      const chunk = phones.slice(i, i + CHUNK);
      const allFormats = chunk.flatMap((d) => [d, `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`]);
      const { data } = await supabase
        .from("nps_responses")
        .select("phone")
        .in("phone", allFormats);
      for (const r of data ?? []) {
        const n = normalizePhone(r.phone);
        if (n) sentPhones.add(n);
      }
    }
  }

  const skipAliveCheck = body.skipSessionAliveCheck === true;
  const sessionAliveSet = new Set<string>();
  if (!skipAliveCheck) {
    const aliveCutoff = new Date(Date.now() - SESSION_ALIVE_DAYS * 86400000).toISOString();
    const sessionIds = [...byPhone.values()].map((o) => o.session_id).filter((s): s is string => !!s);
    if (sessionIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < sessionIds.length; i += CHUNK) {
        const chunk = sessionIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("messages")
          .select("session_id, created_at")
          .in("session_id", chunk)
          .gte("created_at", aliveCutoff);
        for (const r of data ?? []) sessionAliveSet.add(r.session_id);
      }
    }
  }

  // 같은 user_key 의 더 최신 conversation 이 있으면 skip — 재인입 고객에 NPS 발송 방지
  // (happytalk 는 user_key 기준 라우팅 → 신규 채팅창에 잘못 표시됨)
  const targetSessionIds = [...byPhone.values()].map((o) => o.session_id).filter((s): s is string => !!s);
  const userKeyByOrderSession = new Map<string, { userKey: string; createdAt: string }>();
  if (targetSessionIds.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < targetSessionIds.length; i += CHUNK) {
      const chunk = targetSessionIds.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("conversations")
        .select("session_id, user_key, created_at")
        .in("session_id", chunk);
      for (const c of data ?? []) {
        if (c.user_key) userKeyByOrderSession.set(c.session_id, { userKey: c.user_key, createdAt: c.created_at });
      }
    }
  }
  const userKeys = [...new Set([...userKeyByOrderSession.values()].map((v) => v.userKey))];
  const newerByUserKey = new Map<string, string>();
  if (userKeys.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < userKeys.length; i += CHUNK) {
      const chunk = userKeys.slice(i, i + CHUNK);
      const { data } = await supabase
        .from("conversations")
        .select("user_key, created_at")
        .in("user_key", chunk)
        .order("created_at", { ascending: false });
      for (const c of data ?? []) {
        if (!c.user_key) continue;
        if (!newerByUserKey.has(c.user_key)) newerByUserKey.set(c.user_key, c.created_at);
      }
    }
  }

  type Target = { phone: string; orderId: string; sessionId: string; customerName: string | null };
  const targets: Target[] = [];
  let skippedNewerInquiry = 0;
  for (const [phone, o] of byPhone.entries()) {
    if (sentPhones.has(phone)) continue;
    if (!o.session_id) continue;
    if (!skipAliveCheck && !sessionAliveSet.has(o.session_id)) continue;
    const uk = userKeyByOrderSession.get(o.session_id);
    if (uk) {
      const newest = newerByUserKey.get(uk.userKey);
      if (newest && newest > uk.createdAt) {
        skippedNewerInquiry++;
        continue;
      }
    }
    targets.push({ phone, orderId: o.id, sessionId: o.session_id, customerName: o.customer_name });
  }

  if (targets.length === 0) {
    return NextResponse.json({ started: false, eligibleCount: 0, message: "발송 대상 없음" });
  }

  // 백그라운드 발송 — Vercel after() 로 응답 후 진행 (60s maxDuration 내에서 처리, 200건 정도까지 안전)
  after(async () => {
    let success = 0;
    let failed = 0;
    for (const t of targets) {
      let insertedId: string | null = null;
      try {
        const conv = await conversationStore.getById(t.sessionId);
        if (!conv) { failed++; continue; }
        // 평생 1회 가드 — race condition (cron 과 동시 실행) 방지. 발송 실패 시 아래 catch 에서 row 삭제.
        const inserted = await npsStore.insertSent({
          phone: t.phone,
          orderId: t.orderId,
          sessionId: t.sessionId,
          customerName: t.customerName,
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
          t.sessionId,
          `[NPS 설문]\n${NPS_INTRO_MESSAGE}\n→ 1~2점 / 3점 / 4점 / 5점`,
          "AI",
          true,
        );
        success++;
      } catch (err) {
        console.error(`[bulk-send NPS] ${t.phone} 실패:`, err);
        failed++;
        // 발송 실패 시 nps_responses row rollback — 평생 1회 가드 잘못 trigger 방지
        if (insertedId) {
          try { await supabase.from("nps_responses").delete().eq("id", insertedId); }
          catch (rollbackErr) { console.error(`[bulk-send NPS] rollback 실패 ${t.phone}:`, rollbackErr); }
        }
      }
      // 300ms 텀 — 해피톡 rate limit 회피 (직렬 발송, ~3건/초)
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`[bulk-send NPS] 완료 — 성공 ${success} / 실패 ${failed}`);
  });

  return NextResponse.json({
    started: true,
    eligibleCount: targets.length,
    skippedNewerInquiry,
    label,
    message: `${targets.length}건 백그라운드 발송 시작 — 완료까지 ${Math.ceil(targets.length / 3)}초 예상 (재인입 ${skippedNewerInquiry}건 skip)`,
  }, { status: 202 });
}
