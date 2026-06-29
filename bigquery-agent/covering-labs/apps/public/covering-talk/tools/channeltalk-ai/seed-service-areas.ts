/**
 * 서비스 지역 CSV → Supabase service_areas 테이블 시드
 *
 * 사용법:
 *   npx tsx tools/channeltalk-ai/seed-service-areas.ts
 *
 * CSV 파일: /Users/wonbinkim/Desktop/chatingbot/커버링 B2C 서비스 지역 - 서비스지역 (26.2.10 Update).csv
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!
);

interface ServiceArea {
  province: string;
  city: string;
  pickup_days: string;
  unavailable_dongs: string;
  available_dongs: string;
  note: string;
  opened_at: string;
}

/**
 * CSV 파싱 — 멀티라인 필드(따옴표로 감싸진) 처리
 */
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuote = false;
  const fields: string[] = [];

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];

    if (inQuote) {
      if (ch === '"') {
        // 다음 문자도 " 이면 이스케이프된 따옴표
        if (csvText[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && csvText[i + 1] === "\n") i++;
        fields.push(current.trim());
        current = "";
        if (fields.length > 0) rows.push([...fields]);
        fields.length = 0;
      } else {
        current += ch;
      }
    }
  }
  // 마지막 행
  if (current || fields.length > 0) {
    fields.push(current.trim());
    rows.push([...fields]);
  }

  return rows;
}

/**
 * CSV 행을 정리하여 service_areas 레코드로 변환
 * 고양시, 평택시 등은 CSV에서 멀티라인으로 분할되어 있으므로 병합 필요
 */
function buildServiceAreas(rows: string[][]): ServiceArea[] {
  // 첫 행은 헤더
  const dataRows = rows.slice(1);
  const areas: ServiceArea[] = [];

  let pending: ServiceArea | null = null;

  for (const row of dataRows) {
    const [col0, col1, col2, col3, col4, col5, col6] = row.map((c) => c ?? "");

    // province가 있는 행 = 새 레코드 시작
    if (col0 && col1) {
      if (pending) areas.push(pending);
      pending = {
        province: col0.trim(),
        city: col1.trim(),
        pickup_days: col2.trim(),
        unavailable_dongs: cleanDongs(col3),
        available_dongs: cleanDongs(col4),
        note: col5.trim(),
        opened_at: col6?.trim() ?? "",
      };
    } else if (pending) {
      // 멀티라인 연속 행 — 이전 레코드에 내용 추가
      if (col0) pending.unavailable_dongs += ", " + cleanDongs(col0);
      if (col1) pending.available_dongs += ", " + cleanDongs(col1);
      if (col3) pending.unavailable_dongs += ", " + cleanDongs(col3);
      if (col4) pending.available_dongs += ", " + cleanDongs(col4);
    }
  }
  if (pending) areas.push(pending);

  return areas;
}

function cleanDongs(raw: string): string {
  return raw
    .replace(/\n/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/, ,/g, ",")
    .replace(/^[\s,-]+|[\s,-]+$/g, "")
    .trim();
}

async function main() {
  const csvPath = path.resolve(
    __dirname,
    "../../../커버링 B2C 서비스 지역 - 서비스지역 (26.2.10 Update).csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.error("CSV 파일을 찾을 수 없습니다:", csvPath);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCSV(csvText);
  console.log(`CSV 파싱 완료: ${rows.length}개 행`);

  const areas = buildServiceAreas(rows);
  console.log(`서비스 지역 레코드: ${areas.length}개`);

  // 미리보기
  for (const a of areas) {
    console.log(`  [${a.province}] ${a.city} — ${a.pickup_days} | 가능: ${a.available_dongs.slice(0, 50)}...`);
  }

  // 기존 데이터 삭제 후 삽입
  const { error: delErr } = await supabase.from("service_areas").delete().neq("id", 0);
  if (delErr) {
    console.error("기존 데이터 삭제 실패:", delErr);
    process.exit(1);
  }

  const { data, error } = await supabase.from("service_areas").insert(areas).select("id");
  if (error) {
    console.error("삽입 실패:", error);
    process.exit(1);
  }

  console.log(`\n✅ ${data.length}개 서비스 지역 삽입 완료`);
}

main().catch(console.error);
