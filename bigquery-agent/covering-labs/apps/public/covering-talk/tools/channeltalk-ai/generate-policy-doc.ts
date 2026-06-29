/**
 * 커버링 정책문서 자동 생성 (전수 분석 방식)
 *
 * 전체 5,332건을 100건씩 Haiku가 요약 → 53개 요약본을 JSON으로 저장
 * → 이 요약본들을 기반으로 최종 정책문서 작성
 *
 * 실행: npx tsx tools/channeltalk-ai/generate-policy-doc.ts
 * 입력: tools/channeltalk-ai/consultation-pairs-classified.json
 * 출력:
 *   - tools/channeltalk-ai/policy-summaries.json  (100건씩 요약 결과)
 *   - tools/channeltalk-ai/policy-document.md      (최종 통합 정책문서)
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
const MODEL = "claude-haiku-4-5-20251001";
const CHUNK_SIZE = 100;
const DELAY_MS = 500;

const INPUT_FILE = path.join(__dirname, "consultation-pairs-classified.json");
const FALLBACK_INPUT = path.join(__dirname, "consultation-pairs.json");
const SUMMARIES_FILE = path.join(__dirname, "policy-summaries.json");
const OUTPUT_FILE = path.join(__dirname, "policy-document.md");

interface ConsultationPair {
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  managerName: string;
  chatCreatedAt: string;
  category?: string;
}

interface ChunkSummary {
  chunkIndex: number;
  pairCount: number;
  topTags: string[];
  topCategories: string[];
  summary: string;
}

// ─── 100건 요약 ───

async function summarizeChunk(
  pairs: ConsultationPair[],
  chunkIndex: number
): Promise<ChunkSummary> {
  // 태그/카테고리 분포 집계
  const tagCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  for (const p of pairs) {
    if (p.tag) tagCounts.set(p.tag, (tagCounts.get(p.tag) || 0) + 1);
    if (p.category)
      catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);
  const topCategories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);

  // 상담 내용 블록 구성 (최대 토큰 절약을 위해 핵심만)
  const conversationsBlock = pairs
    .map(
      (p, i) =>
        `[${i + 1}] 태그:${p.tag || "없음"} 카테고리:${p.category || "없음"}\nQ: ${p.questionText.substring(0, 150)}\nA: ${p.answerText.substring(0, 300)}`
    )
    .join("\n---\n");

  const prompt = `아래는 커버링(생활폐기물 야간수거 서비스) 고객 상담 ${pairs.length}건입니다.

이 상담들에서 발견되는 **서비스 정책, 규칙, 절차, 수치, 예외사항**을 모두 추출하세요.
- 구체적 숫자/시간/조건 반드시 포함 (예: "15kg 미만", "오후 10시까지", "영업일 2-3일")
- 표준 처리 절차 (어떤 상황 → 어떤 대응)
- 고객 유형별 차이점
- 빈번하게 등장하는 패턴

상담 데이터:
${conversationsBlock}

핵심 정책/규칙만 불릿포인트로 간결하게 정리하세요. 중복은 제거하되 빈도가 높은 내용을 우선하세요.`;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const summary =
      response.content[0].type === "text" ? response.content[0].text : "";

    return { chunkIndex, pairCount: pairs.length, topTags, topCategories, summary };
  } catch (err) {
    console.error(`  청크 ${chunkIndex} 요약 실패:`, err);
    return {
      chunkIndex,
      pairCount: pairs.length,
      topTags,
      topCategories,
      summary: `(요약 실패 — 주요 태그: ${topTags.join(", ")})`,
    };
  }
}

// ─── 메인 ───

async function main() {
  console.log("정책문서 생성 시작 (전수 분석 방식)...\n");

  const inputFile = fs.existsSync(INPUT_FILE) ? INPUT_FILE : FALLBACK_INPUT;
  const pairs: ConsultationPair[] = JSON.parse(
    fs.readFileSync(inputFile, "utf-8")
  );
  console.log(`총 ${pairs.length}개 Q&A 쌍 로드 (${path.basename(inputFile)})`);

  const totalChunks = Math.ceil(pairs.length / CHUNK_SIZE);
  console.log(`${CHUNK_SIZE}건씩 ${totalChunks}개 청크로 분할\n`);

  // 이전 진행 상황 확인
  let summaries: ChunkSummary[] = [];
  let startChunk = 0;
  if (fs.existsSync(SUMMARIES_FILE)) {
    summaries = JSON.parse(fs.readFileSync(SUMMARIES_FILE, "utf-8"));
    startChunk = summaries.length;
    if (startChunk > 0 && startChunk < totalChunks) {
      console.log(`이전 진행에서 이어서 시작: ${startChunk}/${totalChunks} 완료\n`);
    }
  }

  // 청크별 요약
  for (let i = startChunk; i < totalChunks; i++) {
    const chunk = pairs.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);

    console.log(`  [${i + 1}/${totalChunks}] ${chunk.length}건 요약 중...`);

    const summary = await summarizeChunk(chunk, i);
    summaries.push(summary);

    // 중간 저장 (중단 대비)
    fs.writeFileSync(
      SUMMARIES_FILE,
      JSON.stringify(summaries, null, 2),
      "utf-8"
    );

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n${summaries.length}개 청크 요약 완료`);
  console.log(`요약본 저장: ${SUMMARIES_FILE}`);
  console.log(`\n이제 policy-summaries.json을 기반으로 최종 정책문서를 작성하세요.`);

  // 통합 태그/카테고리 분포도 출력
  const allTags = new Map<string, number>();
  const allCats = new Map<string, number>();
  for (const p of pairs) {
    if (p.tag) allTags.set(p.tag, (allTags.get(p.tag) || 0) + 1);
    if (p.category) allCats.set(p.category, (allCats.get(p.category) || 0) + 1);
  }

  console.log(`\n전체 태그 분포 (상위 20):`);
  [...allTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([t, c]) => console.log(`  ${t}: ${c}건`));

  console.log(`\n전체 카테고리 분포:`);
  [...allCats.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([c, n]) => console.log(`  ${c}: ${n}건`));
}

main().catch(console.error);
