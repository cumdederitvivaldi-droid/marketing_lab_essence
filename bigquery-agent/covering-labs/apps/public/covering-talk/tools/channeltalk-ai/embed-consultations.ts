/**
 * 상담 Q&A 임베딩 생성 & Supabase 저장
 *
 * consultation-pairs-classified.json → Voyage AI 임베딩 → consultation_embeddings 테이블
 *
 * 실행: npx tsx tools/channeltalk-ai/embed-consultations.ts
 * 사전조건: migrations/003_consultation_embeddings.sql 실행 완료
 */

import * as fs from "fs";
import * as path from "path";

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const BATCH_SIZE = 128;
const DELAY_MS = 200;
const SUPABASE_BATCH_SIZE = 200;

const INPUT_FILE = path.join(
  __dirname,
  "consultation-pairs-classified.json"
);
const PROGRESS_FILE = path.join(__dirname, "embed-progress.json");

interface ConsultationPair {
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  managerName: string;
  chatCreatedAt: string;
  category?: string;
}

// ─── Voyage AI 직접 호출 (스크립트 전용) ───

function getVoyageKey(): string {
  const key = process.env.VOYAGE_AI_API_KEY;
  if (!key) throw new Error("VOYAGE_AI_API_KEY 환경변수가 설정되지 않았습니다");
  return key;
}

async function embedBatchDirect(
  texts: string[]
): Promise<(number[] | null)[]> {
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
    } catch (err) {
      console.error(`[Voyage] 배치 ${i}~${i + chunk.length} 실패:`, err);
    }

    if (i + BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  return results;
}

// ─── Supabase 직접 호출 (스크립트 전용) ───

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 설정되지 않았습니다");
  return { url, key };
}

async function insertToSupabase(
  rows: Array<{
    chat_id: string;
    question_text: string;
    answer_text: string;
    tag: string | null;
    category: string | null;
    embedding: string;
    manager_name: string;
    chat_created_at: string;
  }>
): Promise<boolean> {
  const { url, key } = getSupabaseConfig();

  try {
    const res = await fetch(
      `${url}/rest/v1/consultation_embeddings`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
      }
    );

    if (!res.ok) {
      console.error(`[Supabase] INSERT 오류 ${res.status}:`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Supabase] INSERT 실패:", err);
    return false;
  }
}

// ─── 진행 상황 관리 ───

function loadProgress(): number {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
      return data.lastProcessed || 0;
    }
  } catch {}
  return 0;
}

function saveProgress(lastProcessed: number) {
  fs.writeFileSync(
    PROGRESS_FILE,
    JSON.stringify({ lastProcessed, timestamp: new Date().toISOString() }),
    "utf-8"
  );
}

// ─── 메인 ───

async function main() {
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

  console.log("임베딩 생성 & DB 저장 시작...\n");

  const pairs: ConsultationPair[] = JSON.parse(
    fs.readFileSync(INPUT_FILE, "utf-8")
  );
  console.log(`총 ${pairs.length}개 Q&A 쌍 로드`);

  const startFrom = loadProgress();
  if (startFrom > 0) {
    console.log(`이전 진행에서 이어서 시작: ${startFrom}번째부터\n`);
  }

  let embedded = 0;
  let failed = 0;
  let inserted = 0;

  // SUPABASE_BATCH_SIZE 단위로 처리
  for (let i = startFrom; i < pairs.length; i += SUPABASE_BATCH_SIZE) {
    const chunk = pairs.slice(i, i + SUPABASE_BATCH_SIZE);
    const texts = chunk.map((p) => p.questionText);

    // 임베딩 생성
    const embeddings = await embedBatchDirect(texts);

    // DB 저장용 행 생성
    const rows: Array<{
      chat_id: string;
      question_text: string;
      answer_text: string;
      tag: string | null;
      category: string | null;
      embedding: string;
      manager_name: string;
      chat_created_at: string;
    }> = [];

    for (let j = 0; j < chunk.length; j++) {
      const emb = embeddings[j];
      if (!emb) {
        failed++;
        continue;
      }

      rows.push({
        chat_id: chunk[j].chatId,
        question_text: chunk[j].questionText,
        answer_text: chunk[j].answerText,
        tag: chunk[j].tag || null,
        category: chunk[j].category || null,
        embedding: JSON.stringify(emb),
        manager_name: chunk[j].managerName,
        chat_created_at: chunk[j].chatCreatedAt,
      });

      embedded++;
    }

    // Supabase에 삽입
    if (rows.length > 0) {
      const success = await insertToSupabase(rows);
      if (success) {
        inserted += rows.length;
      } else {
        console.error(`  청크 ${i}~${i + chunk.length} Supabase 삽입 실패`);
      }
    }

    // 진행 상황 저장
    saveProgress(i + chunk.length);

    const progress = Math.min(i + chunk.length, pairs.length);
    console.log(
      `  진행: ${progress}/${pairs.length} (임베딩: ${embedded}, 삽입: ${inserted}, 실패: ${failed})`
    );
  }

  console.log(`\n완료:`);
  console.log(`  - 임베딩 생성: ${embedded}건`);
  console.log(`  - DB 삽입: ${inserted}건`);
  console.log(`  - 실패: ${failed}건`);

  // 진행 파일 정리
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }
}

main().catch(console.error);
