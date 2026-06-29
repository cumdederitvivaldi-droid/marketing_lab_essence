// [CS-LAB-018] NPS 일회성 bulk 발송 — 사전 건수 조회 (preview)
//
// 모집단:
//   1. orders.status = 'completed' (결제완료) 이며 해당 월 (KST) 안의 주문
//   2. phone 기준 nps_responses 에 이전 발송 이력 없음 (평생 1회)
//   3. 채팅 세션 살아있음 (messages 의 마지막 created_at 이 7일 이내)
//
// 김원빈 / 강성진 전용.

import { NextRequest, NextResponse } from "next/server";
import { requireLabAccess, LabForbiddenError } from "@/lib/auth/lab-permission";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";

const SESSION_ALIVE_DAYS = 7;

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

function monthRangeKst(yyyymm: string): { startIso: string; endIso: string; label: string } {
  const [y, m] = yyyymm.split("-").map(Number);
  const startIso = new Date(`${yyyymm}-01T00:00:00+09:00`).toISOString();
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const endIso = new Date(`${nextY}-${String(nextM).padStart(2, "0")}-01T00:00:00+09:00`).toISOString();
  return { startIso, endIso, label: `${y}년 ${m}월` };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireLabAccess();
  } catch (e) {
    if (e instanceof LabForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // fromDate/toDate (YYYY-MM-DD KST) 우선. 없으면 month 기준 (default: 이번 달).
  const params = new URL(request.url).searchParams;
  const fromDateParam = params.get("fromDate");
  const toDateParam = params.get("toDate");
  const monthParam = params.get("month");
  const skipAliveCheck = params.get("skipSessionAliveCheck") === "true";
  const now = new Date();
  const nowKst = new Date(now.getTime() + 9 * 3600 * 1000);

  let startIso: string;
  let endIso: string;
  let label: string;
  if (fromDateParam && toDateParam) {
    startIso = new Date(`${fromDateParam}T00:00:00+09:00`).toISOString();
    endIso = new Date(`${toDateParam}T23:59:59.999+09:00`).toISOString();
    label = `${fromDateParam} ~ ${toDateParam}`;
  } else {
    const defaultMonth = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, "0")}`;
    const month = monthParam ?? defaultMonth;
    const range = monthRangeKst(month);
    startIso = range.startIso;
    endIso = range.endIso;
    label = range.label;
  }

  // 1. 기간 내 completed orders
  const orders = await paginate<OrderRow>(() =>
    supabase
      .from("orders")
      .select("id, session_id, customer_name, phone, status, date, created_at")
      .eq("status", "completed")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  );

  // 2. phone 정규화 + dedup (한 phone 의 가장 최근 order 유지)
  const byPhone = new Map<string, OrderRow>();
  for (const o of orders) {
    const norm = normalizePhone(o.phone);
    if (!norm) continue;
    const prev = byPhone.get(norm);
    if (!prev || prev.created_at < o.created_at) byPhone.set(norm, o);
  }

  // 3. 이미 발송된 phone 제외 (평생 1회)
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

  // 4. 세션 살아있는지 (messages 마지막 created_at 7일 이내) — skipSessionAliveCheck 면 SKIP
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
          .gte("created_at", aliveCutoff)
          .order("created_at", { ascending: false });
        for (const r of data ?? []) sessionAliveSet.add(r.session_id);
      }
    }
  }

  // 5. 같은 user_key 의 더 최신 conversation 이 있으면 skip — 재인입 고객 보호
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

  const eligible: { phone: string; customerName: string | null; orderId: string; sessionId: string | null }[] = [];
  let alreadySent = 0;
  let sessionDead = 0;
  let skippedNewerInquiry = 0;
  for (const [phone, o] of byPhone.entries()) {
    if (sentPhones.has(phone)) { alreadySent++; continue; }
    if (!o.session_id) { sessionDead++; continue; }
    if (!skipAliveCheck && !sessionAliveSet.has(o.session_id)) { sessionDead++; continue; }
    const uk = userKeyByOrderSession.get(o.session_id);
    if (uk) {
      const newest = newerByUserKey.get(uk.userKey);
      if (newest && newest > uk.createdAt) {
        skippedNewerInquiry++;
        continue;
      }
    }
    eligible.push({ phone, customerName: o.customer_name, orderId: o.id, sessionId: o.session_id });
  }

  return NextResponse.json({
    label,
    totalCompletedPhones: byPhone.size,
    eligibleCount: eligible.length,
    alreadySentCount: alreadySent,
    sessionDeadCount: sessionDead,
    skippedNewerInquiry,
    sampleNames: eligible.slice(0, 10).map((e) => e.customerName ?? "(이름없음)"),
  });
}
