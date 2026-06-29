import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase/client";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { OrderItem } from "@/lib/store/orders";

// [CS-CRON-002] 방문수거 orders → Google Sheet "단건_수거" 동기화 — 5분마다 (Vercel cron)

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_NAME = "단건_수거";
const SYNC_START_DATE = "2026-04-08";
const EXCLUDE_NAMES = ["미확인", "미등록", ""];

// 동기화 대상 orders 상태
const SYNC_STATUSES = ["confirmed", "payment_requested", "completed", "cancelled"];
const DISPATCH_DONE = new Set(["confirmed", "payment_requested", "completed"]);
const PICKUP_DONE = new Set(["completed"]);

// 컬럼 인덱스 (0-based)
const COL = {
  SEQ: 0, DATE: 1, APPLICANT: 2, TIME: 3,
  ADDRESS: 5, PHONE_FIELD: 7, NOTES: 8,
  TRANSPORT_PRICE: 11, FINAL_PRICE: 13,
  DISPATCH_DONE: 14, PICKUP_DONE: 15, ORDER_NUM: 18,
};

function colLetter(i: number) { return String.fromCharCode(65 + i); }

function getSheets() {
  return google.sheets({
    version: "v4",
    auth: new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    }),
  });
}

/** 이름에서 (신사업), (신산업), (접수처) 등 괄호 접미사 제거 후 소문자 */
function normName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

function formatDate(d: string): string { return d.replace(/-/g, "."); }

function formatPhone(p: string): string {
  const d = (p || "").replace(/[^0-9]/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  return p;
}

function formatItems(items: OrderItem[], memo: string): string {
  const parts = items.map((it) => `${it.displayName || it.name || it.category} ${it.quantity}`);
  const s = parts.join(", ");
  return memo ? (s ? `${s} / ${memo}` : memo) : s;
}

function formatTimeKorean(time: string): string {
  if (!time) return "";
  if (/오[전후]/.test(time)) return time;
  const range = time.match(/^(\d{1,2}:\d{2})\s*[~\-]\s*(\d{1,2}:\d{2})$/);
  if (range) return `${conv24to12(range[1])}~${conv24to12(range[2])}`;
  return conv24to12(time);
}
function conv24to12(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  const h = parseInt(m[1]);
  const min = m[2];
  if (h === 0) return `오전 12:${min}`;
  if (h < 12) return `오전 ${h}:${min}`;
  if (h === 12) return `오후 12:${min}`;
  return `오후 ${h - 12}:${min}`;
}

/**
 * [CS-ETC-024] 구글 시트 동기화 (orders → Google Sheets)
 *
 * 5분마다 실행:
 * 1. 시트 전체 읽기 → 이름+날짜+금액 기준 존재 여부 체크
 * 2. 없는 건만 A,C,D,F 비어있는 행부터 추가
 * 3. 기존 건: 취소/완료 상태 업데이트
 */
export async function GET() {
  try {
    // on/off
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "sheet_sync_enabled").single();
    if (setting?.value !== true && setting?.value !== "true") {
      return NextResponse.json({ skipped: true, reason: "sheet_sync_enabled is off" });
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return NextResponse.json({ skipped: true, reason: "Google credentials not set" });
    }

    const sheets = getSheets();

    // ── 1. 시트 전체 읽기 ──
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!A1:S5000`,
    });
    const rows = readRes.data.values || [];

    // 매칭: (1) 주문번호(S열) 우선, (2) 이름+날짜+전화번호끝4자리 폴백
    const matchMap = new Map<string, number>();     // 이름|날짜|전화 → 시트 행
    const orderNumMap = new Map<string, number>();   // 주문번호 → 시트 행

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const name = (row[COL.APPLICANT] ?? "").trim();
      const dateCell = (row[COL.DATE] ?? "").trim();

      // 주문번호(S열)로 매칭
      const orderNum = (row[COL.ORDER_NUM] ?? "").trim();
      if (orderNum) orderNumMap.set(orderNum, i + 1);

      if (!name && !dateCell) continue;
      const dateNorm = dateCell.replace(/\./g, "-");
      const phoneCell = (row[COL.PHONE_FIELD] ?? "").replace(/[^0-9]/g, "").slice(-4);
      const key = `${normName(name)}|${dateNorm}|${phoneCell}`;
      matchMap.set(key, i + 1);
    }

    // A,C,D,F 모두 비어있는 첫 번째 행 찾기 (1-based 시트 행 인덱스)
    //   주의: 발견된 위치 이후에 newRows.length 만큼 연속으로 비어있지 않으면
    //   bulk write 가 그 이후의 데이터 행을 덮어씀. 안전을 위해 마지막 데이터
    //   행 다음 위치도 함께 산출해 둔다.
    const isBlankRow = (idx: number): boolean => {
      const row = rows[idx] || [];
      const a = (row[COL.SEQ] ?? "").trim();
      const c = (row[COL.APPLICANT] ?? "").trim();
      const d = (row[COL.TIME] ?? "").trim();
      const f = (row[COL.ADDRESS] ?? "").trim();
      return !a && !c && !d && !f;
    };

    let firstEmptyRow = rows.length + 1; // 기본값: 마지막 데이터 행 다음 (항상 안전)
    for (let i = 1; i < rows.length; i++) {
      if (isBlankRow(i)) {
        firstEmptyRow = i + 1;
        break;
      }
    }

    // ── 2. orders 조회 ──
    const { data: orders, error: dbError } = await supabase
      .from("orders").select("*")
      .gte("date", SYNC_START_DATE)
      .in("status", SYNC_STATUSES);
    if (dbError) throw dbError;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ appended: 0, updated: 0, total: 0 });
    }

    // 순번 계산: 시트에서 가장 큰 순번
    let maxSeq = 0;
    for (let i = 1; i < rows.length; i++) {
      const s = parseInt((rows[i]?.[COL.SEQ] ?? "").trim(), 10);
      if (!isNaN(s) && s > maxSeq) maxSeq = s;
    }
    let seqCounter = maxSeq;

    const newRows: string[][] = [];
    const cellUpdates: { range: string; value: string }[] = [];
    let appendedCount = 0;
    let updatedCount = 0;

    for (const o of orders) {
      const name = ((o.customer_name as string) ?? "").trim();
      const orderNumber = (o.order_number as string) ?? "";
      const status = o.status as string;
      const items = (o.items as OrderItem[]) ?? [];
      const memo = ((o.memo as string) ?? "").trim();
      const price = o.total_price ? String(o.total_price) : "";

      if (!name || EXCLUDE_NAMES.includes(name)) continue;

      // ── 매칭: (1) 주문번호 우선 → (2) 이름+날짜+전화번호 폴백 ──
      const dateNorm = (o.date as string) ?? "";
      const phoneLast4 = ((o.phone as string) ?? "").replace(/[^0-9]/g, "").slice(-4);
      const matchKey = `${normName(name)}|${dateNorm}|${phoneLast4}`;
      const existingRow = (orderNumber ? orderNumMap.get(orderNumber) : undefined) ?? matchMap.get(matchKey);

      // 기존 건 → 변경된 필드 업데이트
      if (existingRow) {
        const oldRow = rows[existingRow - 1] || [];
        let changed = false;

        // B: 날짜
        const newDate = formatDate(o.date as string);
        if (newDate && newDate !== (oldRow[COL.DATE] ?? "").trim()) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.DATE)}${existingRow}`, value: newDate });
          changed = true;
        }
        // D: 시간
        const newTime = formatTimeKorean((o.time_slot as string) ?? "");
        if (newTime && newTime !== (oldRow[COL.TIME] ?? "").trim()) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.TIME)}${existingRow}`, value: newTime });
          changed = true;
        }
        // F: 주소
        const newAddr = (o.address as string) ?? "";
        if (newAddr && newAddr !== (oldRow[COL.ADDRESS] ?? "").trim()) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.ADDRESS)}${existingRow}`, value: newAddr });
          changed = true;
        }
        // I: 품목+메모
        const newNotes = formatItems(items, memo);
        if (newNotes && newNotes !== (oldRow[COL.NOTES] ?? "").trim()) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.NOTES)}${existingRow}`, value: newNotes });
          changed = true;
        }
        // L: 운송가격
        const oldTP = (oldRow[COL.TRANSPORT_PRICE] ?? "").trim().replace(/[,원\s]/g, "");
        if (price && price !== oldTP) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.TRANSPORT_PRICE)}${existingRow}`, value: price });
          changed = true;
        }
        // N: 최종정산금액
        const oldFP = (oldRow[COL.FINAL_PRICE] ?? "").trim().replace(/[,원\s]/g, "");
        if (status === "cancelled") {
          if (oldFP !== "취소") {
            cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.FINAL_PRICE)}${existingRow}`, value: "취소" });
            changed = true;
          }
        } else if (price && price !== oldFP) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.FINAL_PRICE)}${existingRow}`, value: price });
          changed = true;
        }
        // S: 주문번호
        if (orderNumber && (oldRow[COL.ORDER_NUM] ?? "").trim() !== orderNumber) {
          cellUpdates.push({ range: `${SHEET_NAME}!${colLetter(COL.ORDER_NUM)}${existingRow}`, value: orderNumber });
          changed = true;
        }

        if (changed) updatedCount++;
        continue;
      }

      // ── 신규 건: 활성 상태만 추가 ──
      if (status === "cancelled") continue; // 취소 건은 추가 안 함

      seqCounter++;
      const cleanName = name.replace(/\s*\([^)]*\)\s*$/g, "").trim();
      newRows.push([
        String(seqCounter),                          // A: 순번
        formatDate(o.date as string),                // B: 날짜
        `${cleanName}(신사업)`,                       // C: 고객명
        formatTimeKorean((o.time_slot as string) ?? ""), // D: 시간대
        "",                                          // E: 빈칸
        (o.address as string) ?? "",                 // F: 주소
        "",                                          // G: 빈칸
        formatPhone((o.phone as string) ?? ""),       // H: 연락처
        formatItems(items, memo),                    // I: 품목+메모
        "",                                          // J
        "",                                          // K
        price,                                       // L: 운송가격
        "",                                          // M
        price,                                       // N: 최종정산금액
        DISPATCH_DONE.has(status) ? "완료" : "",      // O: 배차완료
        PICKUP_DONE.has(status) ? "완료" : "",        // P: 수거완료
        "",                                          // Q
        "",                                          // R
        orderNumber,                                 // S: 주문번호
      ]);
      appendedCount++;
    }

    // ── 3. 시트 반영 ──
    // 기존 건 업데이트
    if (cellUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: cellUpdates.map((u) => ({ range: u.range, values: [[u.value]] })),
        },
      });
    }

    // 신규 건: 빈 행부터 차례로 쓰기.
    //   firstEmptyRow ~ firstEmptyRow + newRows.length - 1 사이가 연속 빈 행인지
    //   먼저 검증. 만약 중간에 데이터가 있으면 덮어쓰기 방지를 위해
    //   마지막 데이터 행 다음(rows.length + 1) 으로 fallback.
    if (newRows.length > 0) {
      let writeStartRow = firstEmptyRow;
      const sheetIdxStart = firstEmptyRow - 1; // 0-based
      const sheetIdxEnd = sheetIdxStart + newRows.length - 1;

      let allBlank = true;
      for (let i = sheetIdxStart; i <= sheetIdxEnd && i < rows.length; i++) {
        if (!isBlankRow(i)) { allBlank = false; break; }
      }

      if (!allBlank) {
        console.warn(`[sheet-sync] firstEmptyRow=${firstEmptyRow} 이후 ${newRows.length} 행 중 데이터가 있음 — append 모드로 fallback`);
        writeStartRow = rows.length + 1;
      }

      const endRow = writeStartRow + newRows.length - 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A${writeStartRow}:S${endRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: newRows },
      });
      firstEmptyRow = writeStartRow; // 로그/응답에 실제 사용한 row 반영
    }

    console.log(`[sheet-sync] total=${orders.length} appended=${appendedCount} updated=${updatedCount} cells=${cellUpdates.length} startRow=${firstEmptyRow}`);

    return NextResponse.json({
      appended: appendedCount,
      updated: updatedCount,
      total: orders.length,
      startRow: firstEmptyRow,
    });
  } catch (e) {
    console.error("[sheet-sync] 오류:", e);
    return NextResponse.json({ error: "동기화 실패", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
