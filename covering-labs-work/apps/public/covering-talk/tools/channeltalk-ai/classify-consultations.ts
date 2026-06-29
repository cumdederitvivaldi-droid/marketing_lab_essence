/**
 * 상담 Q&A 쌍 카테고리 분류 (Haiku)
 *
 * consultation-pairs.json의 각 항목에 AI 카테고리를 추가.
 * 배치 처리: 20개씩 묶어서 Haiku에게 분류 요청.
 *
 * 실행: npx tsx tools/channeltalk-ai/classify-consultations.ts
 * 입력: tools/channeltalk-ai/consultation-pairs.json
 * 출력: tools/channeltalk-ai/consultation-pairs-classified.json
 */

import Anthropic from "@anthropic-ai/sdk";
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

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const BATCH_SIZE = 20;
const DELAY_MS = 300; // API 호출 간 딜레이

const INPUT_FILE = path.join(__dirname, "consultation-pairs.json");
const OUTPUT_FILE = path.join(__dirname, "consultation-pairs-classified.json");

// ─── 카테고리 목록 ───

const CATEGORIES = [
  "배차/차량추적",
  "오인수거/미수거",
  "가격/결제/쿠폰",
  "봉투/수거용품",
  "배출방법/이용문의",
  "구독관리/해지",
  "일정변경/스킵",
  "출입/접근문제",
  "앱/시스템오류",
  "환불/보상",
  "주소/개인정보변경",
  "신규가입/이용안내",
  "무게/측정문제",
  "배송/봉투배송",
  "기타",
] as const;

type Category = (typeof CATEGORIES)[number];

interface ConsultationPair {
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  managerName: string;
  chatCreatedAt: string;
  category?: string;
}

// ─── 분류 함수 ───

async function classifyBatch(
  pairs: ConsultationPair[],
  batchIndex: number
): Promise<string[]> {
  const questionsBlock = pairs
    .map((p, i) => `[${i}] ${p.questionText.substring(0, 200)}`)
    .join("\n");

  const prompt = `아래는 커버링(생활폐기물 수거 서비스) 고객 상담 질문들입니다.
각 질문을 아래 카테고리 중 하나로 분류해주세요.

카테고리 목록:
${CATEGORIES.map((c) => `- ${c}`).join("\n")}

질문 목록:
${questionsBlock}

응답 형식 (JSON 배열만 출력, 설명 없이):
["카테고리1", "카테고리2", ...]

질문 순서대로 정확히 ${pairs.length}개의 카테고리를 배열로 반환하세요.`;

  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // JSON 배열 추출
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) {
      console.error(`  배치 ${batchIndex}: JSON 파싱 실패`);
      return pairs.map(() => "기타");
    }

    const categories: string[] = JSON.parse(match[0]);

    // 유효한 카테고리인지 검증
    return categories.map((c) =>
      CATEGORIES.includes(c as Category) ? c : "기타"
    );
  } catch (err) {
    console.error(`  배치 ${batchIndex} API 오류:`, err);
    return pairs.map(() => "기타");
  }
}

// ─── 메인 ───

async function main() {
  console.log("카테고리 분류 시작...\n");

  const pairs: ConsultationPair[] = JSON.parse(
    fs.readFileSync(INPUT_FILE, "utf-8")
  );
  console.log(`총 ${pairs.length}개 Q&A 쌍 로드\n`);

  const totalBatches = Math.ceil(pairs.length / BATCH_SIZE);

  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    const batch = pairs.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

    const categories = await classifyBatch(batch, batchIndex);

    for (let j = 0; j < batch.length; j++) {
      pairs[i + j].category = categories[j] || "기타";
    }

    if (batchIndex % 10 === 0 || batchIndex === totalBatches) {
      console.log(`  배치 ${batchIndex}/${totalBatches} 완료`);
    }

    // Rate limit
    if (i + BATCH_SIZE < pairs.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  // 카테고리 분포 출력
  const catCounts = new Map<string, number>();
  for (const p of pairs) {
    const cat = p.category || "기타";
    catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
  }

  console.log("\n카테고리 분포:");
  const sorted = [...catCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`  ${cat}: ${count}건`);
  }

  // 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(pairs, null, 2), "utf-8");
  console.log(`\n저장 완료: ${OUTPUT_FILE}`);
}

main().catch(console.error);
