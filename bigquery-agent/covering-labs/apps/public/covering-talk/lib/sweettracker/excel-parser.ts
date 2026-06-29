import * as XLSX from "xlsx";
import type { ParsedRecipientRow, BrandMessageButton, BrandMessageCoupon } from "./types";

// FW (Wide Image) 텍스트 76자 제한
const FW_TEXT_LIMIT = 76;

function cleanPhone(raw: unknown): string {
  if (raw == null) return "";
  return String(raw).replace(/[\s\-()]/g, "");
}

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

function parseButton(row: unknown[], startCol: number): BrandMessageButton | undefined {
  // 버튼 6컬럼: 타입, 이름, Mobile, PC, Android, iOS
  const type = cellStr(row, startCol);
  const name = cellStr(row, startCol + 1);
  if (!type && !name) return undefined;
  return {
    name,
    type,
    url_mobile: cellStr(row, startCol + 2) || undefined,
    url_pc: cellStr(row, startCol + 3) || undefined,
    scheme_android: cellStr(row, startCol + 4) || undefined,
    scheme_ios: cellStr(row, startCol + 5) || undefined,
  };
}

// Excel 컬럼 매핑 (0-based):
// A(0)=전화번호, B(1)=메시지, C-H(2-7)=버튼1, I-N(8-13)=버튼2,
// O-T(14-19)=버튼3, U-Z(20-25)=버튼4, AA-AF(26-31)=버튼5,
// AG(32)=와이드 Y/N, AH(33)=이미지URL, AI(34)=이미지링크,
// AJ-AO(35-40)=쿠폰(이름/설명/Mobile/PC/Android/iOS)
export function parseSweetTrackerExcel(buffer: Buffer): ParsedRecipientRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // raw 배열로 읽기 — header 없이
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  // R1-R4 (인덱스 0-3) 스킵, R5(인덱스 4)부터 데이터
  const dataRows = allRows.slice(4);

  const results: ParsedRecipientRow[] = [];

  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;

    const phone = cleanPhone(row[0]);
    if (!phone) continue; // 빈 행 스킵

    const message = cellStr(row, 1);
    if (!message) continue;

    const isWideRaw = cellStr(row, 32).toUpperCase();
    const isWide = isWideRaw === "Y";
    const imageUrl = cellStr(row, 33) || undefined;
    const imageLink = cellStr(row, 34) || undefined;

    // 버튼 파싱 (최대 5개)
    const buttons: BrandMessageButton[] = [];
    const buttonStartCols = [2, 8, 14, 20, 26];
    for (const startCol of buttonStartCols) {
      const btn = parseButton(row, startCol);
      if (btn) buttons.push(btn);
    }

    // 쿠폰 파싱 (AJ-AO = 35-40): 이름/설명/Mobile/PC/Android/iOS
    let coupon: BrandMessageCoupon | undefined;
    const couponName = cellStr(row, 35);
    if (couponName) {
      coupon = {
        name: couponName,
        desc: cellStr(row, 36) || undefined,
        url_mobile: cellStr(row, 37) || undefined,
        url_pc: cellStr(row, 38) || undefined,
        scheme_android: cellStr(row, 39) || undefined,
        scheme_ios: cellStr(row, 40) || undefined,
      };
    }

    // FW 텍스트 76자 초과 경고
    const wideMessageTooLong = isWide && message.length > FW_TEXT_LIMIT;

    results.push({
      phone,
      message,
      imageUrl,
      imageLink,
      isWide,
      buttons,
      coupon,
      wideMessageTooLong: wideMessageTooLong || undefined,
    });
  }

  return results;
}
