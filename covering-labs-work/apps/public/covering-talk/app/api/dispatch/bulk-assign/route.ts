import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { driverStore } from "@/lib/store/drivers";

// [CS-DSP-014] 외부 배차표 textarea 붙여넣기 → orders.driver_name 일괄 매칭
//   포맷: 탭 구분 — 날짜 / 고객명(채널) / 시간대 / [선택] / 주소 / [기사명 또는 비고] / 전화번호 / 품목
//   매칭 키: phone (마지막 8자리), driver 검증: drivers.name 화이트리스트.

interface ParsedRow {
  date: string | null;
  customerName: string | null;
  phone: string | null;
  driverCandidate: string | null;
  raw: string;
}

interface AssignResult {
  raw: string;
  status: "assigned" | "no_driver_match" | "no_order_match" | "skipped";
  customerName: string | null;
  phone: string | null;
  driverName: string | null;
  message?: string;
}

const PHONE_REGEX = /01[0-9]-?\d{3,4}-?\d{4}/;
const DATE_REGEX = /^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$/;

function normalizePhone(s: string): string {
  return s.replace(/\D/g, "").slice(-11);
}

function parseLine(line: string): ParsedRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const cols = trimmed.split(/\t+/).map((c) => c.trim());
  const phoneIdx = cols.findIndex((c) => PHONE_REGEX.test(c));
  if (phoneIdx < 0) return null;
  const phoneMatch = cols[phoneIdx].match(PHONE_REGEX)?.[0];
  const phone = phoneMatch ? normalizePhone(phoneMatch) : null;
  const date = cols[0] && DATE_REGEX.test(cols[0])
    ? cols[0].replace(/[.\/]/g, "-")
    : null;
  const customerName = cols[1] ? cols[1].replace(/\s*\(.*?\)\s*/g, "").trim() : null;
  const driverCandidate = phoneIdx > 0 ? cols[phoneIdx - 1] : null;
  return { date, customerName, phone, driverCandidate, raw: trimmed };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const text = String(body.text ?? "");
    if (!text.trim()) {
      return NextResponse.json({ error: "text 필수" }, { status: 400 });
    }

    const drivers = await driverStore.getAll({ activeOnly: true });
    const driverByName = new Map(drivers.map((d) => [d.name.trim(), d]));

    const rows = text.split(/\r?\n/).map(parseLine).filter((r): r is ParsedRow => r !== null);
    if (rows.length === 0) {
      return NextResponse.json({ summary: { total: 0, assigned: 0, no_driver: 0, no_order: 0 }, results: [] });
    }

    const results: AssignResult[] = [];

    for (const row of rows) {
      if (!row.phone) {
        results.push({ raw: row.raw, status: "skipped", customerName: row.customerName, phone: null, driverName: null, message: "전화번호 없음" });
        continue;
      }

      const driverMatch = row.driverCandidate ? driverByName.get(row.driverCandidate.trim()) : undefined;

      // phone 매칭 — DB 는 `010-XXXX-XXXX` 대시 포함, parsedRow.phone 은 digit-only.
      //   last4 로 후보 넓힌 뒤 메모리에서 normalizePhone() 동일성 비교.
      const last4 = row.phone.slice(-4);
      const { data: candidates } = await supabase
        .from("orders")
        .select("id, customer_name, phone, date")
        .ilike("phone", `%${last4}%`)
        .in("status", ["confirmed", "payment_requested", "prepaid", "completed"])
        .order("date", { ascending: false })
        .limit(50);

      const orders = (candidates ?? []).filter((o) => normalizePhone(String(o.phone ?? "")) === row.phone);

      if (orders.length === 0) {
        results.push({ raw: row.raw, status: "no_order_match", customerName: row.customerName, phone: row.phone, driverName: driverMatch?.name ?? null, message: "해당 전화번호의 orders 없음" });
        continue;
      }

      // 같은 날짜 우선, 없으면 가장 최근 — 다중 매칭 방어
      const sameDate = row.date ? orders.find((o) => o.date === row.date) : null;
      const targetOrder = sameDate ?? orders[0];

      if (!driverMatch) {
        results.push({ raw: row.raw, status: "no_driver_match", customerName: row.customerName, phone: row.phone, driverName: row.driverCandidate ?? null, message: "drivers 화이트리스트에 없음 (배정전 유지)" });
        continue;
      }

      const { error: updateErr } = await supabase
        .from("orders")
        .update({
          driver_id: driverMatch.id,
          driver_name: driverMatch.name,
          driver_phone: driverMatch.phone ?? null,
        })
        .eq("id", targetOrder.id);

      if (updateErr) {
        console.error("[bulk-assign] orders update 실패:", updateErr);
        results.push({
          raw: row.raw,
          status: "skipped",
          customerName: targetOrder.customer_name,
          phone: targetOrder.phone,
          driverName: driverMatch.name,
          message: `DB 오류: ${updateErr.message}`,
        });
        continue;
      }

      results.push({ raw: row.raw, status: "assigned", customerName: targetOrder.customer_name, phone: targetOrder.phone, driverName: driverMatch.name });
    }

    const summary = {
      total: results.length,
      assigned: results.filter((r) => r.status === "assigned").length,
      no_driver: results.filter((r) => r.status === "no_driver_match").length,
      no_order: results.filter((r) => r.status === "no_order_match").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    };

    return NextResponse.json({ summary, results });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
