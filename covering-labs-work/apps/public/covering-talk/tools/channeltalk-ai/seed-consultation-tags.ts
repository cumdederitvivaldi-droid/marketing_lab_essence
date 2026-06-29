/**
 * 상담 태그 CSV → Supabase consultation_tags 테이블 시드
 *
 * 사용법:
 *   npx tsx tools/channeltalk-ai/seed-consultation-tags.ts
 *
 * CSV 파일: /Users/wonbinkim/Desktop/chatingbot/CX_CS 매뉴얼 - 채널톡 상담태그.csv
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

function parseCSV(csvText: string): Array<{ tag: string; description: string }> {
  const lines = csvText.split("\n");
  const results: Array<{ tag: string; description: string }> = [];

  // 첫 줄은 헤더, 두번째 줄은 안내 문구 — 스킵
  let i = 1;
  // 두번째 줄이 안내 문구인지 체크
  if (lines[1]?.startsWith('"태그가 달려도')) {
    i = 2; // 안내 줄도 스킵
  }

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 간단한 CSV 파싱: 첫 번째 콤마 기준 분리 (quoted 필드 고려)
    let tag = "";
    let description = "";

    if (line.startsWith('"')) {
      // quoted tag
      const endQuote = line.indexOf('"', 1);
      if (endQuote > 0) {
        tag = line.substring(1, endQuote);
        description = line.substring(endQuote + 2).replace(/^"/, "").replace(/"$/, "").trim();
      }
    } else {
      const commaIdx = line.indexOf(",");
      if (commaIdx > 0) {
        tag = line.substring(0, commaIdx).trim();
        description = line.substring(commaIdx + 1).replace(/^"/, "").replace(/"$/, "").trim();
      } else {
        tag = line;
      }
    }

    if (!tag) continue;

    // \r 제거
    tag = tag.replace(/\r/g, "").trim();
    description = description.replace(/\r/g, "").trim();

    results.push({ tag, description });
  }

  return results;
}

function extractCategory(tag: string): string {
  const slashIdx = tag.indexOf("/");
  return slashIdx > 0 ? tag.substring(0, slashIdx) : tag;
}

async function main() {
  const csvPath = path.resolve(__dirname, "../../../CX_CS 매뉴얼 - 채널톡 상담태그.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("CSV 파일을 찾을 수 없습니다:", csvPath);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, "utf-8");
  const tags = parseCSV(csvText);

  console.log(`파싱된 태그 수: ${tags.length}`);

  // 기존 데이터 삭제 후 재삽입
  const { error: delError } = await supabase.from("consultation_tags").delete().neq("id", 0);
  if (delError) {
    console.error("기존 데이터 삭제 실패:", delError);
    process.exit(1);
  }

  const rows = tags.map((t) => ({
    tag: t.tag,
    description: t.description,
    category: extractCategory(t.tag),
    is_active: true,
  }));

  // 50개씩 배치 삽입
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("consultation_tags").insert(batch);
    if (error) {
      console.error(`배치 ${i}~${i + batch.length} 삽입 실패:`, error);
    } else {
      console.log(`배치 ${i + 1}~${i + batch.length} 삽입 완료`);
    }
  }

  console.log(`✅ 총 ${rows.length}개 태그 시드 완료`);
}

main().catch(console.error);
