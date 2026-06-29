import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_PICKUP = "단건_수거";
const SHEET_SETTLE = "단건_정산";

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

// ─── Types: 단건_수거 ─────────────────────────

export interface PickupRow {
  rowIndex: number;
  순번: string;
  날짜: string;
  신청자: string;
  수거시간: string;
  도시락개수: string;
  수거주소: string;
  사장님연락처: string;
  현장담당자: string;
  특이사항: string;
  배차: string;
  기사님연락처: string;
  운송가격: string;
  선별가격: string;
  최종정산금액: string;
  배차완료: string;
  수거완료: string;
  정산요청: string;
  주문번호: string;
}

function rowToPickup(values: string[], rowIndex: number): PickupRow {
  return {
    rowIndex,
    순번: values[0] || "",
    날짜: values[1] || "",
    신청자: values[2] || "",
    수거시간: values[3] || "",
    도시락개수: values[4] || "",
    수거주소: values[5] || "",
    사장님연락처: values[6] || "",
    현장담당자: values[7] || "",
    특이사항: values[8] || "",
    배차: values[9] || "",
    기사님연락처: values[10] || "",
    운송가격: values[11] || "",
    선별가격: values[12] || "",
    최종정산금액: values[13] || "",
    배차완료: values[14] || "",
    수거완료: values[15] || "",
    정산요청: values[16] || "",
    주문번호: values[18] || "",  // S열 (R=17은 빈칸)
  };
}

// ─── Types: 단건_정산 ─────────────────────────

export interface SettleRow {
  rowIndex: number;
  순번: string;       // A (자동)
  날짜: string;       // B (자동)
  신청자: string;     // C (자동)
  정산요청: string;   // D (자동)
  정산금액: string;   // E (자동)
  수거완료: string;   // F (자동)
  매출발행: string;   // G (수동)
  정산완료: string;   // H (수동)
  비고: string;       // I (수동)
}

function rowToSettle(values: string[], rowIndex: number): SettleRow {
  return {
    rowIndex,
    순번: values[0] || "",
    날짜: values[1] || "",
    신청자: values[2] || "",
    정산요청: values[3] || "",
    정산금액: values[4] || "",
    수거완료: values[5] || "",
    매출발행: values[6] || "",
    정산완료: values[7] || "",
    비고: values[8] || "",
  };
}

// ─── Read: 단건_수거 ──────────────────────────

export async function getAllPickupRows(): Promise<PickupRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PICKUP}!A2:S`,
  });

  const rows = res.data.values || [];
  return rows
    .map((row, i) => rowToPickup(row, i + 2))
    .filter((r) => /^\d+$/.test(r.순번.trim()) && r.신청자.trim() !== "");
}

// ─── Read: 단건_정산 ──────────────────────────

export async function getAllSettleRows(): Promise<SettleRow[]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_SETTLE}!A2:I`,
  });

  const rows = res.data.values || [];
  return rows
    .map((row, i) => rowToSettle(row, i + 2))
    .filter((r) => /^\d+$/.test(r.순번.trim()) && r.신청자.trim() !== "");
}

// ─── Update: 단건_수거 ────────────────────────

const PICKUP_FIELDS: Record<string, number> = {
  순번: 0, 날짜: 1, 신청자: 2, 수거시간: 3, 도시락개수: 4,
  수거주소: 5, 사장님연락처: 6, 현장담당자: 7, 특이사항: 8,
  배차: 9, 기사님연락처: 10, 운송가격: 11, 선별가격: 12,
  최종정산금액: 13, 배차완료: 14, 수거완료: 15, 정산요청: 16,
  주문번호: 18,  // S열 (R=17은 빈칸)
};

export async function updatePickupRow(
  rowIndex: number,
  updates: Partial<Omit<PickupRow, "rowIndex">>
): Promise<boolean> {
  const sheets = getSheets();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PICKUP}!A${rowIndex}:S${rowIndex}`,
  });

  const current = res.data.values?.[0] || [];
  const newRow = [...current];
  while (newRow.length < 19) newRow.push("");

  for (const [key, val] of Object.entries(updates)) {
    const col = PICKUP_FIELDS[key];
    if (col !== undefined && val !== undefined) {
      newRow[col] = val;
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PICKUP}!A${rowIndex}:S${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newRow] },
  });

  return true;
}

// ─── Update: 단건_정산 (G-I만 수정 가능) ──────

export async function updateSettleRow(
  rowIndex: number,
  updates: Partial<Pick<SettleRow, "매출발행" | "정산완료" | "비고">>
): Promise<boolean> {
  const sheets = getSheets();

  // G-I 열만 읽기/쓰기
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_SETTLE}!G${rowIndex}:I${rowIndex}`,
  });

  const current = res.data.values?.[0] || ["", "", ""];
  const newRow = [...current];
  while (newRow.length < 3) newRow.push("");

  if (updates.매출발행 !== undefined) newRow[0] = updates.매출발행;
  if (updates.정산완료 !== undefined) newRow[1] = updates.정산완료;
  if (updates.비고 !== undefined) newRow[2] = updates.비고;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_SETTLE}!G${rowIndex}:I${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [newRow] },
  });

  return true;
}

// ─── Append: 단건_수거 ──────────────────────────

export async function appendPickupRow(
  data: Omit<PickupRow, "rowIndex">
): Promise<{ rowIndex: number }> {
  const sheets = getSheets();

  // B,C열(날짜,신청자)이 비어있는 첫 번째 행을 찾아서 거기에 쓴다.
  // A열에 순번이 미리 채워져 있을 수 있으므로 append() 대신 update() 사용.
  const scan = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PICKUP}!A2:C`,
  });

  const allRows = scan.data.values || [];
  let targetRow = -1;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const colB = (row[1] || "").trim(); // 날짜
    const colC = (row[2] || "").trim(); // 신청자
    if (!colB && !colC) {
      targetRow = i + 2; // 시트 행번호 (1-indexed, 헤더=1이므로 +2)
      break;
    }
  }

  // 비어있는 행이 없으면 마지막 행 다음에 쓴다
  if (targetRow === -1) {
    targetRow = allRows.length + 2;
  }

  // 기존 A열 순번이 있으면 그걸 사용, 없으면 data.순번 사용
  const existingSeq = allRows[targetRow - 2]?.[0]?.toString().trim();
  const seqNo = existingSeq || data.순번;

  const values = [
    seqNo, data.날짜, data.신청자, data.수거시간,
    data.도시락개수, data.수거주소, data.사장님연락처,
    data.현장담당자, data.특이사항, data.배차,
    data.기사님연락처, data.운송가격, data.선별가격,
    data.최종정산금액, data.배차완료, data.수거완료, data.정산요청,
    "", data.주문번호 || "",
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_PICKUP}!A${targetRow}:S${targetRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });

  return { rowIndex: targetRow };
}

// ─── Next 순번 ──────────────────────────────────

export async function getNextPickupSeqNo(): Promise<string> {
  const rows = await getAllPickupRows();
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.순번, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

// ─── Legacy aliases ───────────────────────────

export type LunchRow = PickupRow;
export const getAllLunchRows = getAllPickupRows;
export const updateLunchRow = updatePickupRow;
