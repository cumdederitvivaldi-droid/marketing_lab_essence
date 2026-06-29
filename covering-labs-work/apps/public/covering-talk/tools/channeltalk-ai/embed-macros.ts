/**
 * CS 매크로 CSV 파싱 → Voyage AI 임베딩 → macro_embeddings 테이블 저장
 *
 * 실행: npx tsx tools/channeltalk-ai/embed-macros.ts
 * 사전조건: migrations/004_macro_embeddings.sql 실행 완료
 */

import * as fs from "fs";
import * as path from "path";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const BATCH_SIZE = 64;
const DELAY_MS = 200;

const CSV_PATH = path.join(
  process.cwd(),
  "..",
  "CX_CS 매뉴얼 - CX_CS 매크로.csv"
);

interface Macro {
  name: string;
  category: string;
  content: string;
  tag: string;
  author: string;
  updatedAt: string;
}

// ─── CSV 파싱 ───

function parseCSV(csvPath: string): Macro[] {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const macros: Macro[] = [];

  // CSV에서 멀티라인 내용 처리 (따옴표로 감싸진 필드)
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        currentField += '"';
        i++; // skip next quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (ch === "\n") {
        currentRow.push(currentField);
        currentField = "";
        rows.push(currentRow);
        currentRow = [];
      } else if (ch !== "\r") {
        currentField += ch;
      }
    }
  }
  // last row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // 첫 행은 헤더, 나머지 파싱
  for (let i = 1; i < rows.length; i++) {
    const [name, content, tag, updatedAt, author] = rows[i];
    if (!name || !content || content.trim().length < 10) continue;

    // 카테고리 추출: "1_이용방법_봉투구매방법" → "이용방법"
    const parts = name.split("_");
    const category = parts.length >= 2 ? parts[1] : "기타";

    macros.push({
      name: name.trim(),
      category,
      content: content.trim(),
      tag: (tag || "").trim(),
      author: (author || "").trim(),
      updatedAt: (updatedAt || "").trim(),
    });
  }

  return macros;
}

// ─── Voyage AI 임베딩 ───

function getVoyageKey(): string {
  const key = process.env.VOYAGE_AI_API_KEY;
  if (!key) throw new Error("VOYAGE_AI_API_KEY 환경변수가 설정되지 않았습니다");
  return key;
}

async function embedBatchDirect(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getVoyageKey()}`,
        },
        body: JSON.stringify({ input: chunk, model: VOYAGE_MODEL }),
      });

      if (!res.ok) {
        console.error(`[Voyage] 배치 오류 ${res.status}:`, await res.text());
        continue;
      }

      const data = await res.json();
      for (let j = 0; j < chunk.length; j++) {
        results[i + j] = data.data?.[j]?.embedding ?? null;
      }
      console.log(`  임베딩 ${i + chunk.length}/${texts.length} 완료`);
    } catch (err) {
      console.error(`[Voyage] 배치 ${i}~${i + chunk.length} 실패:`, err);
    }

    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}

// ─── Supabase 저장 ───

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 설정되지 않았습니다");
  return { url, key };
}

async function clearTable() {
  const { url, key } = getSupabaseConfig();
  const res = await fetch(`${url}/rest/v1/macro_embeddings?id=gt.0`, {
    method: "DELETE",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) {
    console.warn(`테이블 클리어 실패 (${res.status}) — 테이블이 비어있을 수 있음`);
  }
}

async function insertToSupabase(
  rows: Array<{
    macro_name: string;
    macro_category: string;
    content: string;
    tag: string | null;
    author: string | null;
    updated_at: string | null;
    embedding: string;
  }>
) {
  const { url, key } = getSupabaseConfig();

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const res = await fetch(`${url}/rest/v1/macro_embeddings`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
    });

    if (!res.ok) {
      console.error(`[Supabase] INSERT 오류 ${res.status}:`, await res.text());
    } else {
      console.log(`  DB 저장 ${Math.min(i + 50, rows.length)}/${rows.length} 완료`);
    }
  }
}

// ─── 메인 ───

async function main() {
  // .env.local 로드
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }

  console.log("=== CS 매크로 임베딩 시작 ===\n");

  // 1. CSV 파싱
  console.log(`1. CSV 파싱: ${CSV_PATH}`);
  const macros = parseCSV(CSV_PATH);
  console.log(`   ${macros.length}개 매크로 파싱 완료\n`);

  // 카테고리 통계
  const catCounts = new Map<string, number>();
  for (const m of macros) {
    catCounts.set(m.category, (catCounts.get(m.category) || 0) + 1);
  }
  console.log("   카테고리 분포:");
  for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${cat}: ${count}개`);
  }
  console.log();

  // 2. 임베딩 생성
  console.log("2. Voyage AI 임베딩 생성...");
  const texts = macros.map((m) => m.content);
  const embeddings = await embedBatchDirect(texts);

  const validCount = embeddings.filter((e) => e !== null).length;
  console.log(`   ${validCount}/${macros.length} 임베딩 성공\n`);

  // 3. 기존 데이터 클리어 후 저장
  console.log("3. Supabase 저장...");
  await clearTable();

  const rows = macros
    .map((m, i) => {
      if (!embeddings[i]) return null;
      return {
        macro_name: m.name,
        macro_category: m.category,
        content: m.content,
        tag: m.tag || null,
        author: m.author || null,
        updated_at: (() => { try { const d = new Date(m.updatedAt); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; } })(),
        embedding: JSON.stringify(embeddings[i]),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  await insertToSupabase(rows);

  console.log(`\n=== 완료: ${rows.length}개 매크로 임베딩 저장됨 ===`);
}

main().catch(console.error);
