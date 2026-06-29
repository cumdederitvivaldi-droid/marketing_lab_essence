/**
 * 채널톡 상담 데이터 파싱 — Q&A 쌍 추출
 *
 * - 2026.01.01 ~ 2026.03.22 상담 데이터에서 고객 질문 + 매니저 답변 쌍 추출
 * - 단편 메시지 병합 (30초 이내 연속 메시지 → 하나로 합침)
 * - 시스템/워크플로우 메시지 필터링
 *
 * 실행: npx tsx tools/channeltalk-ai/parse-consultations.ts
 * 출력: tools/channeltalk-ai/consultation-pairs.json
 */

import * as fs from "fs";
import * as path from "path";

// ─── 타입 정의 ───

interface ChatMeta {
  id: string;
  tags: string[];
  assigneeName: string;
  userName: string;
  createdAt: number;
}

interface RawMessage {
  id: string;
  personType: "user" | "bot" | "manager";
  plainText?: string;
  blocks?: Array<{
    type: string;
    value?: string;
    blocks?: Array<{ value?: string }>;
  }>;
  options?: string[];
  createdAt: number;
  workflowButton?: boolean;
}

interface MergedMessage {
  personType: "user" | "bot" | "manager";
  text: string;
  startedAt: number;
  lastTimestamp: number;
}

interface ConsultationPair {
  chatId: string;
  questionText: string;
  answerText: string;
  tag: string | null;
  managerName: string;
  chatCreatedAt: string; // ISO string
}

// ─── 경로 ───

const BACKUP_DIR = path.join(__dirname, "..", "backup");
const MESSAGES_DIR = path.join(BACKUP_DIR, "messages");
const OUTPUT_FILE = path.join(__dirname, "consultation-pairs.json");

const CHAT_FILES = [
  path.join(BACKUP_DIR, "chats_2026-01-01_to_2026-03-12.json"),
  path.join(BACKUP_DIR, "chats_2026-03-13_to_2026-03-22.json"),
];

// ─── 설정 ───

const MERGE_WINDOW_MS = 30_000; // 30초 이내 연속 메시지 병합
const MIN_ANSWER_LENGTH = 20; // 최소 답변 길이
const MIN_QUESTION_LENGTH = 2; // 최소 질문 길이

// 제외할 태그 패턴
const EXCLUDE_TAG_PREFIXES = ["고객유형/"];
const EXCLUDE_TAGS = new Set(["무응종결", "중복"]);

// ─── 유틸리티 ───

function extractText(msg: RawMessage): string {
  if (msg.plainText) return msg.plainText.trim();

  if (!msg.blocks || msg.blocks.length === 0) return "";

  return msg.blocks
    .filter((b) => b.type === "text" || b.type === "bullets")
    .map((b) => {
      if (b.type === "bullets") {
        return (b.blocks || []).map((bb) => `${bb.value || ""}`).join("\n");
      }
      return b.value || "";
    })
    .join("\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function isSystemMessage(msg: RawMessage): boolean {
  if (!msg.options) return false;
  return (
    msg.options.includes("silentToUser") || msg.options.includes("private")
  );
}

function filterTag(tags: string[]): string | null {
  const filtered = tags.filter(
    (t) =>
      !EXCLUDE_TAG_PREFIXES.some((prefix) => t.startsWith(prefix)) &&
      !EXCLUDE_TAGS.has(t)
  );
  // 가장 구체적인 태그 (경로가 긴 것) 반환
  if (filtered.length === 0) return null;
  return filtered.sort((a, b) => b.length - a.length)[0];
}

// ─── 단편 메시지 병합 ───

function mergeFragmentedMessages(messages: RawMessage[]): MergedMessage[] {
  const merged: MergedMessage[] = [];
  let current: MergedMessage | null = null;

  for (const msg of messages) {
    if (isSystemMessage(msg)) continue;
    if (msg.personType === "bot") continue; // 봇 메시지 스킵

    const text = extractText(msg);
    if (!text || text.length < MIN_QUESTION_LENGTH) continue;

    // 워크플로우 버튼 클릭은 스킵
    if (msg.workflowButton) continue;

    if (
      current &&
      msg.personType === current.personType &&
      msg.createdAt - current.lastTimestamp < MERGE_WINDOW_MS
    ) {
      current.text += " " + text;
      current.lastTimestamp = msg.createdAt;
    } else {
      if (current) merged.push(current);
      current = {
        personType: msg.personType,
        text,
        startedAt: msg.createdAt,
        lastTimestamp: msg.createdAt,
      };
    }
  }

  if (current) merged.push(current);
  return merged;
}

// ─── Q&A 쌍 추출 ───

function extractQAPairs(
  merged: MergedMessage[],
  chatMeta: ChatMeta
): ConsultationPair[] {
  const pairs: ConsultationPair[] = [];
  const tag = filterTag(chatMeta.tags);

  for (let i = 0; i < merged.length; i++) {
    if (merged[i].personType !== "user") continue;

    // 연속된 user 메시지를 하나의 질문으로 합침
    let questionText = merged[i].text;
    let j = i + 1;
    while (j < merged.length && merged[j].personType === "user") {
      questionText += " " + merged[j].text;
      j++;
    }

    // 다음 manager 응답 찾기
    if (j < merged.length && merged[j].personType === "manager") {
      const answerText = merged[j].text;

      if (
        answerText.length >= MIN_ANSWER_LENGTH &&
        questionText.length >= MIN_QUESTION_LENGTH
      ) {
        pairs.push({
          chatId: chatMeta.id,
          questionText: questionText.trim(),
          answerText: answerText.trim(),
          tag,
          managerName: chatMeta.assigneeName,
          chatCreatedAt: new Date(chatMeta.createdAt).toISOString(),
        });
      }

      i = j; // manager 응답 이후부터 다시 탐색
    } else {
      i = j - 1; // manager 없으면 다음 user부터
    }
  }

  return pairs;
}

// ─── 메인 ───

async function main() {
  console.log("상담 데이터 파싱 시작...\n");

  // 1. 채팅 메타데이터 로드
  const chatMetaMap = new Map<string, ChatMeta>();

  for (const chatFile of CHAT_FILES) {
    if (!fs.existsSync(chatFile)) {
      console.log(`⚠️ 파일 없음: ${chatFile}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(chatFile, "utf-8"));
    const chats = data.chats || data;

    for (const chat of chats) {
      chatMetaMap.set(chat.id, {
        id: chat.id,
        tags: chat.tags || [],
        assigneeName: chat._assigneeName || "",
        userName: chat._userName || chat.name || "",
        createdAt: chat.createdAt,
      });
    }

    console.log(
      `${path.basename(chatFile)}: ${(data.chats || data).length}개 채팅 로드`
    );
  }

  console.log(`\n총 ${chatMetaMap.size}개 채팅 메타데이터 로드\n`);

  // 2. 메시지 파일 순회 & Q&A 추출
  const allPairs: ConsultationPair[] = [];
  const messageFiles = fs
    .readdirSync(MESSAGES_DIR)
    .filter((f) => f.endsWith(".json"));

  let processed = 0;
  let skipped = 0;

  for (const file of messageFiles) {
    const chatId = path.basename(file, ".json");
    const meta = chatMetaMap.get(chatId);

    if (!meta) {
      skipped++;
      continue;
    }

    try {
      const messages: RawMessage[] = JSON.parse(
        fs.readFileSync(path.join(MESSAGES_DIR, file), "utf-8")
      );

      const merged = mergeFragmentedMessages(messages);
      const pairs = extractQAPairs(merged, meta);
      allPairs.push(...pairs);
    } catch {
      // 파싱 실패 시 스킵
      skipped++;
    }

    processed++;
    if (processed % 5000 === 0) {
      console.log(
        `  처리: ${processed}/${messageFiles.length} (Q&A: ${allPairs.length}건)`
      );
    }
  }

  console.log(`\n파싱 완료:`);
  console.log(`  - 처리: ${processed}건`);
  console.log(`  - 스킵: ${skipped}건`);
  console.log(`  - Q&A 쌍: ${allPairs.length}건`);

  // 3. 태그 분포 출력
  const tagCounts = new Map<string, number>();
  for (const pair of allPairs) {
    const tag = pair.tag || "(태그 없음)";
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }

  console.log(`\n태그별 분포:`);
  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sortedTags.slice(0, 20)) {
    console.log(`  ${tag}: ${count}건`);
  }
  if (sortedTags.length > 20) {
    console.log(`  ... 외 ${sortedTags.length - 20}개 태그`);
  }

  // 4. 저장
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allPairs, null, 2), "utf-8");
  console.log(`\n저장 완료: ${OUTPUT_FILE}`);
}

main().catch(console.error);
