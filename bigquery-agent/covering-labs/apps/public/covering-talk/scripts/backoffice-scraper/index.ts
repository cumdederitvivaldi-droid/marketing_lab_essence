import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { getBrowser, closeBrowser } from "./browser.js";
import { ensureLoggedIn, resetLoginState } from "./auth.js";
import { scrapeCustomer, scrapeOrderDetail } from "./scraper.js";
import type { BackofficeRequest } from "./types.js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let channel: RealtimeChannel | null = null;
let processing = false;
const queue: BackofficeRequest[] = [];
const processedIds = new Set<string>();
let consecutiveFailures = 0;
let consecutiveEmpty = 0;
let requestCount = 0;
let lastRestartAt = Date.now();

const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_CONSECUTIVE_EMPTY = 5;
const RESTART_EVERY_REQUESTS = 100;       // 100건마다 재시작
const RESTART_EVERY_MS = 2 * 60 * 60 * 1000; // 2시간마다 재시작

/**
 * 브라우저 자동 재시작
 */
async function autoRestart(reason: string) {
  console.log(`[Main] 🔄 브라우저 재시작 (${reason})`);
  try { await closeBrowser(); } catch {}
  resetLoginState(); // 새 브라우저는 세션 없으므로 로그인 캐시 리셋
  await getBrowser();
  await ensureLoggedIn();
  consecutiveFailures = 0;
  consecutiveEmpty = 0;
  requestCount = 0;
  lastRestartAt = Date.now();
  console.log("[Main] ✅ 브라우저 재시작 완료");
}

/**
 * 주기적 재시작 필요 여부 체크
 */
function needsPeriodicRestart(): string | null {
  if (requestCount >= RESTART_EVERY_REQUESTS) return `${requestCount}건 처리`;
  if (Date.now() - lastRestartAt >= RESTART_EVERY_MS) return "2시간 경과";
  return null;
}

/**
 * 요청 처리 (순차 — 1탭이라 동시 실행 불가)
 */
async function handleRequest(request: BackofficeRequest) {
  const label = request.request_type === "order_detail"
    ? `주문상세: ${request.url?.split("/").pop() || "?"}`
    : `${request.phone?.slice(0, 3) || "?"}****${request.phone?.slice(-4) || "?"}`;
  console.log(`[Main] 요청 수신: ${request.id} (${label})`);

  // 주기적 재시작 체크 (요청 처리 전)
  const restartReason = needsPeriodicRestart();
  if (restartReason) {
    await autoRestart(restartReason);
  }
  requestCount++;

  try {
    await supabase
      .from("backoffice_requests")
      .update({ status: "processing" })
      .eq("id", request.id);

    const result = request.request_type === "order_detail" && request.url
      ? await scrapeOrderDetail(request.url)
      : await scrapeCustomer(request.phone);

    await supabase
      .from("backoffice_requests")
      .update({
        status: "completed",
        result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    console.log(`[Main] 요청 완료: ${request.id}`);
    consecutiveFailures = 0;

    // 빈 결과 연속 감지 (user_lookup만)
    if (request.request_type !== "order_detail") {
      const r = result as { userInfo?: unknown } | null;
      if (!r || !r.userInfo) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
          await autoRestart(`연속 ${consecutiveEmpty}건 빈 결과`);
        }
      } else {
        consecutiveEmpty = 0;
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error(`[Main] 요청 실패: ${request.id} —`, errorMessage);
    consecutiveFailures++;

    await supabase
      .from("backoffice_requests")
      .update({
        status: "error",
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      await autoRestart(`연속 ${consecutiveFailures}건 실패`);
    }
  }
}

/**
 * 큐 처리 루프 — 한 번에 하나씩 순차 처리
 */
async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    const req = queue.shift()!;
    await handleRequest(req);
  }

  processing = false;
}

/**
 * 요청 추가 (중복 방지)
 */
function enqueueRequest(request: BackofficeRequest) {
  if (processedIds.has(request.id)) return;
  if (queue.some((q) => q.id === request.id)) return;
  processedIds.add(request.id);
  queue.push(request);
  processQueue();
}

/**
 * DB에서 미처리 요청 가져오기
 */
async function fetchPendingRequests() {
  const { data } = await supabase
    .from("backoffice_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return;

  const now = Date.now();
  for (const req of data) {
    const age = now - new Date(req.created_at).getTime();
    if (age > 60_000) {
      await supabase.from("backoffice_requests").delete().eq("id", req.id);
      console.log(`[Main] 오래된 요청 삭제: ${req.id}`);
      continue;
    }
    enqueueRequest(req as BackofficeRequest);
  }
}

function subscribeToRequests() {
  channel = supabase
    .channel("backoffice-requests")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "backoffice_requests",
        filter: "status=eq.pending",
      },
      (payload) => {
        enqueueRequest(payload.new as BackofficeRequest);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[Main] Supabase Realtime 구독 완료 — 요청 대기 중...");
      } else if (status === "CHANNEL_ERROR") {
        console.error("[Main] Realtime 채널 에러 — 10초 후 재연결");
        setTimeout(() => {
          channel?.unsubscribe();
          subscribeToRequests();
        }, 10000);
      }
    });
}

async function main() {
  console.log("=".repeat(50));
  console.log("[Main] 백오피스 스크래퍼 시작");
  console.log(`[Main] Supabase: ${process.env.SUPABASE_URL}`);
  console.log(`[Main] Headless: ${process.env.HEADLESS !== "false"}`);
  console.log("=".repeat(50));

  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "BACKOFFICE_LOGIN_URL",
    "BACKOFFICE_SEARCH_URL",
    "BACKOFFICE_USERNAME",
    "BACKOFFICE_PASSWORD",
  ];
  for (const key of required) {
    if (!process.env[key]) {
      console.error(`[Main] 필수 환경변수 누락: ${key}`);
      process.exit(1);
    }
  }

  await getBrowser();
  await ensureLoggedIn();
  console.log("[Main] 브라우저 준비 완료");

  // Realtime 구독
  subscribeToRequests();

  // 밀린 요청 처리
  await fetchPendingRequests();

  // 3초 폴링 fallback
  setInterval(() => {
    fetchPendingRequests().catch(() => {});
  }, 3000);
}

async function shutdown() {
  console.log("\n[Main] 종료 중...");
  if (channel) {
    await channel.unsubscribe();
  }
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("[Main] 시작 실패:", err);
  process.exit(1);
});
