import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// [CS-ADM-013] ABC 시간안내 발송 → 예약 이탈·블록/지정 집계
// - 발송 감지: 2가지 경로
//   (a) 공식 [시간안내 발송] 버튼 템플릿 — MARKER_1 + MARKER_2 동시 포함
//   (b) 상담사 수기 블록 안내 — A/B/C 3개 블록 범위를 모두 명시 (예: "A: 오전9:00~오후12:00 ...")
// - 예약: 같은 session_id + 날짜로 orders 에 non-cancelled 레코드
// - 블록 예약: time_slot 이 A/B/C 블록 포맷(예: "오전 9:00~오후 12:00") 과 정확히 일치
// - 지정 예약: 블록 포맷 외 (예: "오후 3:00", "13:30", 블록 밖 범위)
// - 이탈: 예약 없고 발송 후 1시간 이상 경과
// - 진행 중: 예약 없고 발송 후 1시간 이내

const MARKER_1 = "수거 가능한 시간대입니다";
const MARKER_2 = "아래 버튼 중 원하시는 시간대를 선택해 주세요";
const ONE_HOUR = 60 * 60 * 1000;

// 블록 예약으로 간주할 time_slot 패턴 (한글/24h 양쪽). 공백 무시 비교.
// "오전 9:00~오전 12:00" 은 자정이 아니라 정오 의미로 잘못 저장된 경우가 있어 A 블록으로 관용 인정.
const BLOCK_SLOT_PATTERNS = [
  // A (9~12)
  "오전9:00~오후12:00", "오전9:00~오전12:00", "9:00~12:00", "09:00~12:00",
  // B (13~16)
  "오후1:00~오후4:00", "13:00~16:00",
  // C (17~20)
  "오후5:00~오후8:00", "17:00~20:00",
];

function normalizeSlot(ts: string): string {
  return (ts || "").replace(/\s/g, "");
}

function isBlockSlot(ts: string): boolean {
  if (!ts) return false;
  const n = normalizeSlot(ts);
  return BLOCK_SLOT_PATTERNS.some((p) => n === p);
}

/** 메시지 내용이 "수기 블록 안내" (A/B/C 세 블록 범위 모두 언급) 인지 */
function isManualBlockAnnouncement(content: string): boolean {
  const n = normalizeSlot(content);
  const hasA = n.includes("오전9:00~오후12:00") || n.includes("09:00~12:00") || /오전9:00.*오후12:00|오전\s*9시.*12시/.test(content);
  const hasB = n.includes("오후1:00~오후4:00") || n.includes("13:00~16:00") || /오후1:00.*오후4:00|오후\s*1시.*4시/.test(content);
  const hasC = n.includes("오후5:00~오후8:00") || n.includes("17:00~20:00") || /오후5:00.*오후8:00|오후\s*5시.*8시/.test(content);
  return hasA && hasB && hasC;
}

/** 메시지 내용에서 "MM월 DD일" 패턴으로 목표 날짜 추출 (현재 연도 가정) */
function parseTargetDate(content: string): string | null {
  const m = content.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  const y = new Date().getFullYear();
  return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export async function GET(): Promise<NextResponse> {
  try {
    // 1. 발송 후보 메시지 조회 — 공식 템플릿 OR 수기 블록 안내.
    //    수기 안내는 A/B/C 블록 범위 중 하나라도 포함하면 후보로 fetch 후 JS 에서 세 블록 모두 있는지 정밀 검증.
    const { data: sends, error } = await supabase
      .from("messages")
      .select("id, session_id, content, created_at")
      .eq("role", "assistant")
      .or(
        [
          `content.ilike.%${MARKER_1}%`,
          `content.ilike.%오전9:00~오후12:00%`,
          `content.ilike.%오전 9:00~오후 12:00%`,
          `content.ilike.%오전9시~12시%`,
          `content.ilike.%오전 9시~12시%`,
        ].join(","),
      )
      .order("created_at", { ascending: true });
    if (error) throw error;

    // 2. 발송 이벤트 생성
    const events: { sessionId: string; targetDate: string | null; sentAt: string; source: "template" | "manual" }[] = [];
    for (const m of sends || []) {
      const content = String(m.content || "");
      const isTemplate = content.includes(MARKER_1) && content.includes(MARKER_2);
      const isManual = !isTemplate && isManualBlockAnnouncement(content);
      if (!isTemplate && !isManual) continue;
      events.push({
        sessionId: m.session_id as string,
        targetDate: parseTargetDate(content),
        sentAt: m.created_at as string,
        source: isTemplate ? "template" : "manual",
      });
    }

    // 3. 관련 session 의 conversations (이름 + collected_info fallback) + orders 로드.
    //    취소(cancelled) 레코드도 포함 — "블록으로 예약 시도했다가 취소" 도 전환 성공으로 카운트.
    const sessionIds = [...new Set(events.map((e) => e.sessionId).filter(Boolean))];
    const slotByKey = new Map<string, string>();             // `${sid}|${date}` → time_slot
    const anyBookingBySession = new Map<string, string>();   // sid → time_slot 한 건
    const fallbackDateBySession = new Map<string, string>();
    const convMetaBySession = new Map<string, { name: string; phone: string; exists: boolean }>();

    if (sessionIds.length > 0) {
      // bookings 테이블은 deprecated — orders 만 조회
      const [ordersRes, convRes] = await Promise.all([
        supabase.from("orders").select("session_id, date, time_slot, status").in("session_id", sessionIds),
        supabase.from("conversations").select("session_id, name, phone, collected_info").in("session_id", sessionIds),
      ]);
      if (ordersRes.error) throw ordersRes.error;
      if (convRes.error) throw convRes.error;

      const upsert = (sid: string | null, d: string | null, ts: string | null) => {
        if (!sid) return;
        if (d) {
          const key = `${sid}|${d}`;
          const prev = slotByKey.get(key);
          if (!prev || (!isBlockSlot(prev) && isBlockSlot(ts || ""))) {
            slotByKey.set(key, ts || "");
          }
        }
        const prevSess = anyBookingBySession.get(sid);
        if (!prevSess || (!isBlockSlot(prevSess) && isBlockSlot(ts || ""))) {
          anyBookingBySession.set(sid, ts || "");
        }
      };
      for (const o of ordersRes.data || []) upsert(o.session_id, o.date, o.time_slot);

      for (const c of convRes.data || []) {
        const ci = (c.collected_info || {}) as Record<string, unknown>;
        const d = (ci.requestedDate as string | undefined)
          || (ci.selectedDate as string | undefined)
          || (ci._abcSlotsSent as { date?: string } | undefined)?.date
          || null;
        if (c.session_id && d) fallbackDateBySession.set(c.session_id as string, d);
        if (c.session_id) {
          convMetaBySession.set(c.session_id as string, {
            name: (c.name as string) || "",
            phone: (c.phone as string) || "",
            exists: true,
          });
        }
      }
    }

    // 4. 분류 + 카테고리별 세션 상세 수집
    type FunnelItem = {
      sessionId: string;
      name: string;
      phone: string;
      sentAt: string;
      source: "template" | "manual";
      targetDate: string | null;
      timeSlot: string | null;
    };
    const details: Record<"block" | "specific" | "otherDate" | "pending" | "churn", FunnelItem[]> = {
      block: [], specific: [], otherDate: [], pending: [], churn: [],
    };
    let manualCount = 0;

    const now = Date.now();

    for (const e of events) {
      if (e.source === "manual") manualCount++;

      // conversation 이 삭제된 세션은 스킵 (orphan messages)
      const meta = convMetaBySession.get(e.sessionId);
      if (!meta?.exists) continue;

      const date = e.targetDate || fallbackDateBySession.get(e.sessionId) || null;
      const sentAge = now - new Date(e.sentAt).getTime();
      const base: FunnelItem = {
        sessionId: e.sessionId,
        name: meta.name,
        phone: meta.phone,
        sentAt: e.sentAt,
        source: e.source,
        targetDate: date,
        timeSlot: null,
      };

      if (e.source === "template") {
        if (date && slotByKey.has(`${e.sessionId}|${date}`)) {
          const ts = slotByKey.get(`${e.sessionId}|${date}`) || "";
          base.timeSlot = ts;
          details[isBlockSlot(ts) ? "block" : "specific"].push(base);
        } else if (anyBookingBySession.has(e.sessionId)) {
          base.timeSlot = anyBookingBySession.get(e.sessionId) || "";
          details.otherDate.push(base);
        } else {
          details[sentAge < ONE_HOUR ? "pending" : "churn"].push(base);
        }
      } else {
        if (anyBookingBySession.has(e.sessionId)) {
          const ts = anyBookingBySession.get(e.sessionId) || "";
          base.timeSlot = ts;
          details[isBlockSlot(ts) ? "block" : "specific"].push(base);
        } else {
          details[sentAge < ONE_HOUR ? "pending" : "churn"].push(base);
        }
      }
    }

    const bookedBlock = details.block.length;
    const bookedSpecific = details.specific.length;
    const bookedOtherDate = details.otherDate.length;
    const pending = details.pending.length;
    const churn = details.churn.length;
    const total = bookedBlock + bookedSpecific + bookedOtherDate + pending + churn;
    const booked = bookedBlock + bookedSpecific;
    const denom = total;
    const conversionRate = denom > 0 ? Math.round(((booked + bookedOtherDate) / denom) * 1000) / 10 : 0;
    const churnRate = denom > 0 ? Math.round((churn / denom) * 1000) / 10 : 0;
    const blockAdoptionRate = booked > 0 ? Math.round((bookedBlock / booked) * 1000) / 10 : 0;

    return NextResponse.json({
      total,
      manualCount,
      booked,
      bookedBlock,
      bookedSpecific,
      bookedOtherDate,
      churn,
      pending,
      conversionRate,
      churnRate,
      blockAdoptionRate,
      details,
    });
  } catch (err) {
    console.error("[dashboard/abc-funnel] error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "집계 실패" }, { status: 500 });
  }
}
