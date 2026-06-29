import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabase } from "@/lib/supabase/client";

// [CS-CRON-003] 런치 lunch_orders → Google Sheet "단건_수거" + "단건_정산" 동기화 — 5분마다 (Vercel cron)

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_PICKUP = "단건_수거";
const SHEET_SETTLE = "단건_정산";

// 정산방식 DB→시트
const SETTLEMENT_MAP: Record<string, string> = {
  link_pay: "링크페이",
  monthly_invoice: "월말정산",
  tax_invoice: "세금계산서 발행",
};

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

function formatDate(d: string): string { return d.replace(/-/g, "."); }

/**
 * [CS-ETC-028] 런치 DB → 시트 동기화
 *
 * 5분마다 실행:
 * 1. lunch_orders에서 전체 조회
 * 2. 시트 기존 행과 매칭 (orderNumber 기준)
 * 3. 있으면 업데이트, 없으면 추가
 * 4. 단건_정산 시트도 동기화
 */
export async function GET() {
  try {
    // on/off 체크
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "lunch_sheet_sync_enabled").single();
    if (setting?.value !== true && setting?.value !== "true") {
      return NextResponse.json({ skipped: true, reason: "lunch_sheet_sync_enabled is off" });
    }
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return NextResponse.json({ skipped: true, reason: "Google credentials not set" });
    }

    const sheets = getSheets();

    // ── 1. 시트 읽기 ──
    const [pickupRes, settleRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_PICKUP}!A1:S5000` }),
      sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_SETTLE}!A1:I5000` }),
    ]);

    const pickupRows = pickupRes.data.values || [];
    const settleRows = settleRes.data.values || [];

    // 순번 → 시트 행 번호 매핑 (pickup)
    const pickupSeqMap = new Map<string, number>(); // 순번 → 1-based row
    for (let i = 1; i < pickupRows.length; i++) {
      const seq = (pickupRows[i]?.[0] ?? "").trim();
      if (seq && /^\d+$/.test(seq)) {
        pickupSeqMap.set(seq, i + 1);
      }
    }

    // 순번 → 시트 행 번호 매핑 (settle)
    const settleSeqMap = new Map<string, number>();
    for (let i = 1; i < settleRows.length; i++) {
      const seq = (settleRows[i]?.[0] ?? "").trim();
      if (seq && /^\d+$/.test(seq)) {
        settleSeqMap.set(seq, i + 1);
      }
    }

    // ── 매칭 맵 구축 ──
    // 1차: 주문번호(S열, index 18)로 매칭 — 가장 정확
    const pickupOrderNumMap = new Map<string, number>(); // order_number → 1-based row
    for (let i = 1; i < pickupRows.length; i++) {
      const orderNum = (pickupRows[i]?.[18] ?? "").trim();
      if (orderNum) {
        pickupOrderNumMap.set(orderNum, i + 1);
      }
    }

    // 2차: vendor_name+date+box_count 복합키 — 레거시 데이터용 (S열 비어있을 때)
    // 중복 키가 있으면 -1로 표시해서 ambiguous 처리
    const pickupCompositeMap = new Map<string, number>();
    for (let i = 1; i < pickupRows.length; i++) {
      const row = pickupRows[i] || [];
      const orderNum = (row[18] ?? "").trim();
      if (orderNum) continue; // 이미 주문번호 있는 행은 1차에서 처리
      const name = (row[2] ?? "").trim().toLowerCase();
      const date = (row[1] ?? "").trim();
      const count = (row[4] ?? "").trim();
      if (name && date) {
        const key = `${name}|${date}|${count}`;
        if (pickupCompositeMap.has(key)) {
          pickupCompositeMap.set(key, -1); // 중복 → ambiguous
        } else {
          pickupCompositeMap.set(key, i + 1);
        }
      }
    }

    // 비어있는 행 찾기 (pickup)
    let firstEmptyPickup = pickupRows.length + 1;
    for (let i = 1; i < pickupRows.length; i++) {
      const row = pickupRows[i] || [];
      if (!(row[0] ?? "").trim() && !(row[2] ?? "").trim()) {
        firstEmptyPickup = i + 1;
        break;
      }
    }

    // 비어있는 행 찾기 (settle)
    let firstEmptySettle = settleRows.length + 1;
    for (let i = 1; i < settleRows.length; i++) {
      const row = settleRows[i] || [];
      if (!(row[0] ?? "").trim() && !(row[2] ?? "").trim()) {
        firstEmptySettle = i + 1;
        break;
      }
    }

    // 최대 순번
    let maxSeq = 0;
    for (let i = 1; i < pickupRows.length; i++) {
      const s = parseInt((pickupRows[i]?.[0] ?? "").trim(), 10);
      if (!isNaN(s) && s > maxSeq) maxSeq = s;
    }
    let seqCounter = maxSeq;

    // ── 2. DB 조회 (4/15 이후만) ──
    const { data: orders, error: dbError } = await supabase
      .from("lunch_orders")
      .select("*")
      .gte("date", "2026-04-15")
      .order("date", { ascending: true });
    if (dbError) throw dbError;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ appended: 0, updated: 0, total: 0 });
    }

    const pickupUpdates: { range: string; values: string[][] }[] = [];
    const settleUpdates: { range: string; values: string[][] }[] = [];
    let appended = 0;
    let updated = 0;

    for (const o of orders) {
      const vendorName = (o.vendor_name ?? "").trim();
      const date = o.date ?? "";
      const status = o.status ?? "confirmed";
      if (!vendorName) continue;

      // 시트에서 이미 신사업/휴무로 필터된 행이 아닌지 확인
      if (vendorName.includes("(신사업)") || vendorName.includes("[신사업]")) continue;
      if (vendorName.includes("휴무")) continue;

      const isPickedUp = o.is_picked_up ? "완료" : "";
      const settlementLabel = SETTLEMENT_MAP[o.settlement_type] || "";
      const invoiceIssued = o.invoice_issued ? "발행 완료" : "";
      const isCompleted = status === "completed" ? "정산 완료" : (status === "payment_requested" ? "미정산" : "");
      const reqId = (o.payment_ids as { reqId?: string }[])?.[0]?.reqId;
      const bigoText = reqId ? `REQ:${reqId}` : (o.notes ?? "");

      // 매칭: 1차 주문번호(S열), 2차 vendor+date+count 복합키
      let existingPickupRow: number | undefined;
      if (o.order_number && pickupOrderNumMap.has(o.order_number)) {
        existingPickupRow = pickupOrderNumMap.get(o.order_number);
      } else {
        const compositeKey = `${vendorName.toLowerCase()}|${formatDate(date)}|${String(o.box_count ?? "").trim()}`;
        const compositeMatch = pickupCompositeMap.get(compositeKey);
        if (compositeMatch && compositeMatch > 0) {
          existingPickupRow = compositeMatch;
          // 사용한 키는 제거해서 다른 DB 주문이 같은 행에 매칭되는 것 방지
          pickupCompositeMap.delete(compositeKey);
        }
      }

      if (existingPickupRow) {
        // ── 기존 건 업데이트 (전체 필드) ──
        // 순번(A)은 유지, B~S 덮어쓰기 (수정된 주소/시간/개수 등 모두 반영)
        const existingSeq = (pickupRows[existingPickupRow - 1]?.[0] ?? "").trim();
        // J~L(배차 정보)는 시트에서 수동 관리하므로 기존 값 유지
        const existingRow = pickupRows[existingPickupRow - 1] || [];
        const keepDispatch = (existingRow[9] ?? "").trim();   // J: 배차
        const keepDriver = (existingRow[10] ?? "").trim();    // K: 기사님연락처
        const keepTransport = (existingRow[11] ?? "").trim(); // L: 운송가격
        const keepO = (existingRow[14] ?? "").trim();         // O: 배차완료

        const updatedRow = [
          existingSeq, formatDate(date), vendorName, o.pickup_time ?? "", o.box_count ?? "",
          o.pickup_address ?? "", "", o.site_contact ?? "", o.notes ?? "",
          keepDispatch, keepDriver, keepTransport, o.sorting_price ? String(o.sorting_price) : "",
          o.total_amount ? String(o.total_amount) : "", keepO,
          isPickedUp, settlementLabel,
          "", o.order_number ?? "",
        ];

        pickupUpdates.push({
          range: `${SHEET_PICKUP}!A${existingPickupRow}:S${existingPickupRow}`,
          values: [updatedRow],
        });

        // settle 매칭 (같은 순번으로)
        const existingSettleRow = existingSeq ? settleSeqMap.get(existingSeq) : undefined;
        if (existingSettleRow) {
          // settle: G(매출발행), H(정산완료), I(비고)
          settleUpdates.push({
            range: `${SHEET_SETTLE}!G${existingSettleRow}:I${existingSettleRow}`,
            values: [[invoiceIssued, isCompleted, bigoText]],
          });
        }
        updated++;
      } else {
        // ── 신규 건 추가 ──
        seqCounter++;
        const seq = String(seqCounter);

        // pickup 행: A(순번), B(날짜), C(신청자), D(수거시간), E(도시락개수), F(수거주소),
        //           G(사장님연락처), H(현장담당자), I(특이사항), J~K(배차), L(운송가격), M(선별가격),
        //           N(최종정산금액), O(배차완료), P(수거완료), Q(정산요청), R(빈칸), S(주문번호)
        const pickupRow = [
          seq, formatDate(date), vendorName, o.pickup_time ?? "", o.box_count ?? "",
          o.pickup_address ?? "", "", o.site_contact ?? "", o.notes ?? "",
          "", "", "", o.sorting_price ? String(o.sorting_price) : "",
          o.total_amount ? String(o.total_amount) : "", "",
          isPickedUp, settlementLabel,
          "", o.order_number ?? "",
        ];

        pickupUpdates.push({
          range: `${SHEET_PICKUP}!A${firstEmptyPickup}:S${firstEmptyPickup}`,
          values: [pickupRow],
        });

        // settle 행: A:E는 단건_수거에서 자동 채워지므로 G:I만 작성
        // G(매출발행), H(정산완료), I(비고)
        const settleRow = [invoiceIssued, isCompleted, bigoText];

        settleUpdates.push({
          range: `${SHEET_SETTLE}!G${firstEmptySettle}:I${firstEmptySettle}`,
          values: [settleRow],
        });

        firstEmptyPickup++;
        firstEmptySettle++;
        appended++;
      }
    }

    // ── 3. 배치 업데이트 ──
    const allUpdates = [...pickupUpdates, ...settleUpdates];
    if (allUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          valueInputOption: "RAW",
          data: allUpdates.map((u) => ({
            range: u.range,
            values: u.values,
          })),
        },
      });
    }

    console.log(`[lunch-sheet-push] 완료: 추가=${appended}, 업데이트=${updated}, 전체=${orders.length}`);
    return NextResponse.json({ ok: true, appended, updated, total: orders.length });
  } catch (err) {
    console.error("[lunch-sheet-push] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
