/**
 * 누락된 임베딩만 재삽입
 *
 * DB에 이미 있는 chat_id를 조회 → 없는 것만 임베딩 + 삽입
 *
 * 실행: npx tsx tools/channeltalk-ai/embed-missing.ts
 */

import * as fs from "fs";
import * as path from "path";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const BATCH_SIZE = 128;
const INSERT_BATCH = 100; // 타임아웃 방지 위해 작은 배치
const DELAY_MS = 200;

// .env.local 로드
const envPath = path.join(__dirname, "..", "..", ".env.local");
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

interface ConsultationPair {
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  managerName: string;
  chatCreatedAt: string;
  category?: string;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수 필요");
  return { url, key };
}

async function getExistingChatIds(): Promise<Set<string>> {
  const { url, key } = getSupabaseConfig();
  // chat_id 목록 조회 (distinct는 지원 안 되므로 전체 가져옴)
  const ids = new Set<string>();
  let offset = 0;
  const limit = 1000;

  while (true) {
    const res = await fetch(
      `${url}/rest/v1/consultation_embeddings?select=chat_id,question_text&offset=${offset}&limit=${limit}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }
    );
    if (!res.ok) break;
    const rows: Array<{ chat_id: string; question_text: string }> = await res.json();
    if (rows.length === 0) break;
    for (const r of rows) {
      ids.add(`${r.chat_id}::${r.question_text.substring(0, 50)}`);
    }
    offset += limit;
  }

  return ids;
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
          Authorization: `Bearer ${process.env.VOYAGE_AI_API_KEY}`,
        },
        body: JSON.stringify({ input: chunk, model: VOYAGE_MODEL }),
      });
      if (!res.ok) { console.error(`[Voyage] ${res.status}`); continue; }
      const data = await res.json();
      for (let j = 0; j < chunk.length; j++) {
        results[i + j] = data.data?.[j]?.embedding ?? null;
      }
    } catch (err) {
      console.error("[Voyage] 배치 실패:", err);
    }
    if (i + BATCH_SIZE < texts.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  return results;
}

async function insertToSupabase(rows: any[]): Promise<boolean> {
  const { url, key } = getSupabaseConfig();
  try {
    const res = await fetch(`${url}/rest/v1/consultation_embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      console.error(`[Supabase] ${res.status}:`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] 실패:", err);
    return false;
  }
}

async function main() {
  console.log("누락된 임베딩 재삽입 시작...\n");

  const inputFile = path.join(__dirname, "consultation-pairs-classified.json");
  const pairs: ConsultationPair[] = JSON.parse(fs.readFileSync(inputFile, "utf-8"));
  console.log(`총 ${pairs.length}개 Q&A 쌍`);

  // DB에 있는 것 확인
  console.log("DB 기존 데이터 조회 중...");
  const existing = await getExistingChatIds();
  console.log(`DB에 ${existing.size}건 존재\n`);

  // 누락된 것 필터링
  const missing = pairs.filter(
    (p) => !existing.has(`${p.chatId}::${p.questionText.substring(0, 50)}`)
  );
  console.log(`누락: ${missing.length}건\n`);

  if (missing.length === 0) {
    console.log("모든 데이터가 이미 DB에 있습니다.");
    return;
  }

  let inserted = 0;
  for (let i = 0; i < missing.length; i += INSERT_BATCH) {
    const chunk = missing.slice(i, i + INSERT_BATCH);
    const texts = chunk.map((p) => p.questionText);
    const embeddings = await embedBatchDirect(texts);

    const rows = chunk
      .map((p, j) => {
        const emb = embeddings[j];
        if (!emb) return null;
        return {
          chat_id: p.chatId,
          question_text: p.questionText,
          answer_text: p.answerText,
          tag: p.tag || null,
          category: p.category || null,
          embedding: JSON.stringify(emb),
          manager_name: p.managerName,
          chat_created_at: p.chatCreatedAt,
        };
      })
      .filter(Boolean);

    if (rows.length > 0) {
      const ok = await insertToSupabase(rows);
      if (ok) inserted += rows.length;
    }

    console.log(`  ${Math.min(i + INSERT_BATCH, missing.length)}/${missing.length} (삽입: ${inserted})`);
  }

  console.log(`\n완료: ${inserted}건 삽입`);
}

main().catch(console.error);
