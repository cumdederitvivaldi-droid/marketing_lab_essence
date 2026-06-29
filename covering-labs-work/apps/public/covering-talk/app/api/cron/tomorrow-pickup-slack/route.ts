import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

function getSlackToken() { return process.env.SLACK_BOT_TOKEN ?? ""; }
function getSlackChannel() { return (process.env.SLACK_PICKUP_CHANNEL_ID ?? "C0AENH7JW2Y").trim(); }

// [CS-CRON-004] 방문수거 익일 수거 건 Slack 브리핑 — 매일 18시 KST (Vercel cron)

// 태그할 담당자
const MENTION_USERS = "<@U07865TB7F1> <@U0AAF0BJEUX>"; // 유대현, 김원빈

function parseTimeToMinutes(slot: string): number {
  if (!slot) return Infinity;
  const h24 = slot.match(/^(\d{1,2}):(\d{2})/);
  if (h24) return parseInt(h24[1]) * 60 + parseInt(h24[2]);
  const ampm = slot.match(/(오전|오후)\s*(\d{1,2}):?(\d{0,2})/);
  if (ampm) {
    let h = parseInt(ampm[2]);
    const m = parseInt(ampm[3]) || 0;
    if (ampm[1] === "오전" && h === 12) h = 0;
    if (ampm[1] === "오후" && h !== 12) h += 12;
    return h * 60 + m;
  }
  return Infinity;
}

function formatPrice(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

function getDayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

interface OrderItem {
  category?: string;
  name?: string;
  displayName?: string;
  quantity?: number;
}

async function postSlack(blocks: unknown[], threadTs?: string): Promise<string | null> {
  const token = getSlackToken();
  const channel = getSlackChannel();
  if (!token || !channel) {
    console.error("[slack] 토큰 또는 채널 없음:", { token: !!token, channel });
    return null;
  }
  try {
    const body: Record<string, unknown> = { channel, blocks };
    if (threadTs) body.thread_ts = threadTs;
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) console.error("[slack] 발송 실패:", data.error, data);
    else console.log("[slack] 발송 성공:", data.ts);
    return data.ok ? (data.ts as string) : null;
  } catch (e) {
    console.error("[slack] 예외:", e);
    return null;
  }
}

/**
 * [CS-NTF-012] 내일 수거 스케줄 슬랙 알림
 *
 * 매일 오후 6시(KST) 실행:
 * - orders 테이블에서 date = 내일 + 활성 상태 조회
 * - 요약 + 건별 상세를 슬랙 채널에 발송
 */
export async function GET(): Promise<NextResponse> {
  try {
    // KST 기준 내일
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const tomorrow = new Date(kst);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .eq("date", tomorrowStr)
      .in("status", ["confirmed", "payment_requested", "prepaid"]);

    if (error) throw error;
    if (!orders || orders.length === 0) {
      return NextResponse.json({ sent: 0, date: tomorrowStr });
    }

    // 시간순 정렬
    const sorted = [...orders].sort(
      (a, b) => parseTimeToMinutes(a.time_slot ?? "") - parseTimeToMinutes(b.time_slot ?? "")
    );

    const totalRevenue = sorted.reduce((s, o) => s + (o.total_price ?? 0), 0);
    const dateStr = tomorrowStr.slice(5).replace("-", "/");
    const dow = getDayName(tomorrowStr);

    // 건별 목록
    const listLines = sorted.map((o, i) => {
      const time = o.time_slot || "미정";
      const price = o.total_price > 0 ? formatPrice(o.total_price) : "미정";
      const statusTag = o.status === "payment_requested" ? "  💳결제요청" : "";
      return `${i + 1}. ${o.customer_name}  |  ${time}  |  ${price}${statusTag}`;
    }).join("\n");

    // 요약 메시지
    const summaryBlocks = [
      {
        type: "header",
        text: { type: "plain_text", text: `[방문수거] ${dateStr}(${dow}) 내일 수거 현황`, emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📦 총 *${sorted.length}건*  |  예상 매출 *${formatPrice(totalRevenue)}*\n\n${listLines}\n\n${MENTION_USERS}`,
        },
      },
    ];

    const summaryTs = await postSlack(summaryBlocks);

    // 슬랙 thread_ts 를 app_settings 에 저장 — auto-cancel cron 이 같은 thread 에 reply 하기 위함
    if (summaryTs) {
      try {
        const { supabase } = await import("@/lib/supabase/client");
        await supabase.from("app_settings").upsert(
          {
            key: "slack_latest_pickup_brief",
            value: { ts: summaryTs, postedAt: new Date().toISOString(), forDate: tomorrowStr },
          },
          { onConflict: "key" },
        );
      } catch (e) {
        console.warn("[tomorrow-pickup-slack] summaryTs 저장 실패:", e);
      }
    }

    // 건별 상세 (스레드)
    for (const [i, o] of sorted.entries()) {
      const items = Array.isArray(o.items)
        ? (o.items as OrderItem[]).map((it) =>
            `${it.displayName || it.name || it.category} x${it.quantity ?? 1}`
          ).join(", ")
        : "-";

      const envTags = [
        o.has_elevator ? "✅엘베" : "❌엘베",
        o.has_parking ? "✅주차" : "❌주차",
        o.has_ground_access ? "✅지상출입" : "❌지상출입",
      ].join("  ");

      const lines = [
        `*[${i + 1}/${sorted.length}] ${o.customer_name}*  #${o.order_number}`,
        ``,
        `📅 수거 날짜: ${tomorrowStr}`,
        `⏰ 수거 시간: ${o.time_slot || "미정"}`,
        `📍 수거 주소: ${o.address}${o.floor ? ` ${o.floor}층` : ""}`,
        `📦 품목: ${items}`,
        ...(o.memo ? [`📝 메모: ${o.memo}`] : []),
        ``,
        envTags,
        `📞 고객 연락처: ${o.phone}`,
        `💰 금액: ${o.total_price > 0 ? formatPrice(o.total_price) : "미정"}`,
        `👥 인원: ${o.crew_size ?? 1}인`,
      ];

      const detailBlocks = [
        { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
        { type: "divider" },
      ];

      await postSlack(detailBlocks, summaryTs ?? undefined);
    }

    // §6.1 100% 선결제 — 오늘 자동취소된 주문을 스레드 마지막에 보고.
    const cancelledCount = await reportTodayAutoCancelled(summaryTs);

    const slackOk = !!summaryTs;
    console.log(`[tomorrow-pickup-slack] ${tomorrowStr}: ${sorted.length}건, slack=${slackOk}, ts=${summaryTs}, 자동취소=${cancelledCount}`);
    return NextResponse.json({ sent: sorted.length, date: tomorrowStr, slackOk, autoCancelled: cancelledCount });
  } catch (e) {
    console.error("[tomorrow-pickup-slack] 오류:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 어제 18시 슬랙 ~ 오늘 18시 슬랙 사이에 취소된 "오늘(KST) 수거건" 을 스레드에 보고.
//   어제 슬랙에 올라갔던 건들의 변동을 운영팀이 한눈에 파악할 수 있도록.
async function reportTodayAutoCancelled(parentTs: string | null): Promise<number> {
  if (!parentTs) return 0;
  // 오늘 KST 날짜 (= 어제 슬랙에 "내일 수거" 로 올라간 건들의 date)
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayKst = kstNow.toISOString().slice(0, 10);
  // 어제 18시 KST 이후 갱신된 것만 (= 어제 슬랙 발송 이후)
  const yesterday18Kst = new Date(`${todayKst}T18:00:00+09:00`);
  yesterday18Kst.setDate(yesterday18Kst.getDate() - 1);

  const { data: rows, error } = await supabase
    .from("orders")
    .select("customer_name, phone, date, time_slot, order_number, updated_at")
    .eq("status", "cancelled")
    .eq("date", todayKst)
    .gte("updated_at", yesterday18Kst.toISOString())
    .order("updated_at", { ascending: true });
  if (error || !rows || rows.length === 0) return 0;

  const lines = rows.map((r) => {
    const phone = (r.phone || "").replace(/^010(\d{4})(\d{4})$/, "010-$1-$2") || "-";
    return `❌ 자동취소 (결제 미완료) — ${r.customer_name} / ${r.time_slot ?? "미정"} / ${phone}`;
  });
  const text = [
    `*어제 슬랙 이후 오늘(${todayKst}) 수거건 중 자동취소 ${rows.length}건*`,
    ``,
    ...lines,
  ].join("\n");
  await postSlack([{ type: "section", text: { type: "mrkdwn", text } }, { type: "divider" }], parentTs);
  return rows.length;
}
