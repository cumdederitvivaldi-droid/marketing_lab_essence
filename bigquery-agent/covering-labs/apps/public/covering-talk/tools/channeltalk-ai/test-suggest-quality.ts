/**
 * AI 상담 추천 품질 테스트
 *
 * consultation-pairs-classified.json에서 랜덤 샘플을 추출하여
 * 추천 파이프라인의 품질을 측정.
 *
 * 실행: npx tsx tools/channeltalk-ai/test-suggest-quality.ts
 * 사전조건: embed-consultations.ts 실행 완료 (DB에 데이터 존재)
 */

import * as fs from "fs";
import * as path from "path";

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

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3-large";
const SAMPLE_SIZE = 50;
const DELAY_MS = 300;

const INPUT_FILE = path.join(__dirname, "consultation-pairs-classified.json");
const FALLBACK_INPUT = path.join(__dirname, "consultation-pairs.json");
const OUTPUT_FILE = path.join(__dirname, "test-results.json");

interface ConsultationPair {
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  managerName: string;
  chatCreatedAt: string;
  category?: string;
}

// ─── Voyage AI ───

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VOYAGE_AI_API_KEY}`,
      },
      body: JSON.stringify({ input: [text], model: VOYAGE_MODEL }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ─── Supabase RPC ───

async function matchConsultations(
  embedding: number[],
  threshold = 0.5,
  count = 10
): Promise<
  Array<{
    id: number;
    chat_id: string;
    question_text: string;
    answer_text: string;
    tag: string | null;
    category: string | null;
    similarity: number;
  }>
> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  const res = await fetch(`${url}/rest/v1/rpc/match_consultations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key!,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query_embedding: JSON.stringify(embedding),
      match_threshold: threshold,
      match_count: count,
    }),
  });

  if (!res.ok) {
    console.error("RPC 오류:", await res.text());
    return [];
  }

  return res.json();
}

// ─── 메인 ───

async function main() {
  console.log("품질 테스트 시작...\n");

  // 데이터 로드
  const inputFile = fs.existsSync(INPUT_FILE) ? INPUT_FILE : FALLBACK_INPUT;
  const allPairs: ConsultationPair[] = JSON.parse(
    fs.readFileSync(inputFile, "utf-8")
  );
  console.log(`총 ${allPairs.length}개 Q&A 쌍 로드 (${path.basename(inputFile)})\n`);

  // 랜덤 샘플링
  const shuffled = [...allPairs].sort(() => Math.random() - 0.5);
  const samples = shuffled.slice(0, SAMPLE_SIZE);

  let top1Hit = 0;
  let top3Hit = 0;
  let totalSimilarity = 0;
  let tested = 0;
  let failed = 0;

  const results: Array<{
    question: string;
    expectedAnswer: string;
    expectedTag: string | null;
    top3Answers: Array<{
      answer: string;
      similarity: number;
      tag: string | null;
      isMatch: boolean;
    }>;
    top1Match: boolean;
    top3Match: boolean;
  }> = [];

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];

    // 임베딩 생성
    const embedding = await embedText(sample.questionText);
    if (!embedding) {
      failed++;
      continue;
    }

    // 검색
    const matches = await matchConsultations(embedding);

    if (matches.length === 0) {
      results.push({
        question: sample.questionText,
        expectedAnswer: sample.answerText.substring(0, 100),
        expectedTag: sample.tag,
        top3Answers: [],
        top1Match: false,
        top3Match: false,
      });
      tested++;
      continue;
    }

    // 매칭 평가: 같은 chatId의 답변이 있으면 hit
    const top3 = matches.slice(0, 3);
    const isTop1Match = top3[0]?.chat_id === sample.chatId;
    const isTop3Match = top3.some((m) => m.chat_id === sample.chatId);

    if (isTop1Match) top1Hit++;
    if (isTop3Match) top3Hit++;
    totalSimilarity += top3[0]?.similarity || 0;
    tested++;

    results.push({
      question: sample.questionText.substring(0, 100),
      expectedAnswer: sample.answerText.substring(0, 100),
      expectedTag: sample.tag,
      top3Answers: top3.map((m) => ({
        answer: m.answer_text.substring(0, 100),
        similarity: m.similarity,
        tag: m.tag,
        isMatch: m.chat_id === sample.chatId,
      })),
      top1Match: isTop1Match,
      top3Match: isTop3Match,
    });

    if ((i + 1) % 10 === 0) {
      console.log(`  테스트 ${i + 1}/${samples.length}...`);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // 결과 출력
  const top1Rate = tested > 0 ? ((top1Hit / tested) * 100).toFixed(1) : "0";
  const top3Rate = tested > 0 ? ((top3Hit / tested) * 100).toFixed(1) : "0";
  const avgSim = tested > 0 ? (totalSimilarity / tested).toFixed(4) : "0";

  console.log(`\n========== 품질 테스트 결과 ==========`);
  console.log(`테스트: ${tested}건 (실패: ${failed}건)`);
  console.log(`Top-1 적중률: ${top1Rate}% (${top1Hit}/${tested})`);
  console.log(`Top-3 적중률: ${top3Rate}% (${top3Hit}/${tested})`);
  console.log(`평균 Top-1 유사도: ${avgSim}`);
  console.log(`======================================\n`);

  // 결과 저장
  const summary = {
    timestamp: new Date().toISOString(),
    sampleSize: SAMPLE_SIZE,
    tested,
    failed,
    top1Hit,
    top3Hit,
    top1Rate: parseFloat(top1Rate),
    top3Rate: parseFloat(top3Rate),
    avgSimilarity: parseFloat(avgSim),
    details: results,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`상세 결과: ${OUTPUT_FILE}`);
}

main().catch(console.error);
