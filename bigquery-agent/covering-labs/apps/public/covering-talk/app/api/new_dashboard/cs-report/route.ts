import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { supabase } from "@/lib/supabase/client";
import { paginate } from "@/lib/dashboard/_paginate";
import Anthropic from "@anthropic-ai/sdk";

const ADMIN_DASHBOARD_ALLOWED_USERS = new Set(["강성진", "유대현", "김원빈"]);
const RECENT_LIMIT = 10;

interface MessageRow {
  session_id: string;
  role: string;
  content: string;
  sent_by: string | null;
  is_edited: boolean | null;
  created_at: string;
}

interface ConvRow {
  session_id: string;
  name: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

interface ReportMessage {
  role: string;
  content: string;
  sentBy: string | null;
  createdAt: string;
  isEdited: boolean;
}

interface ReportConversation {
  sessionId: string;
  customerName: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  messages: ReportMessage[];
}

interface AiReport {
  summary: string;
  strengths: string[];
  improvements: string[];
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const maxDuration = 60;

interface CounselorMetrics {
  total: number | null;
  quoteSent: number | null;
  booked: number | null;
  totalReplies: number;
  aiAsIs: number;
  aiEdited: number;
  aiAsIsRate: number | null;
  repliesPerHour: number | null;
  closuresPerHour: number | null;
  medianResponseTimeMin: number | null;
}

// [CS-ADM-025] CS Report — 상담사 최근 채팅 + 대시보드 metrics + AI 분석 (1시간 단위 캐시)
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ADMIN_DASHBOARD_ALLOWED_USERS.has(user.name)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const counselor = body.counselor as string | undefined;
    const fromDateKst = body.fromDateKst as string | undefined;
    const toDateKst = body.toDateKst as string | undefined;
    const metrics = body.metrics as CounselorMetrics | undefined;
    if (!counselor || !fromDateKst || !toDateKst) {
      return NextResponse.json({ error: "counselor/fromDateKst/toDateKst required" }, { status: 400 });
    }

    const fromIso = new Date(`${fromDateKst}T00:00:00+09:00`).toISOString();
    const toIso = new Date(`${toDateKst}T23:59:59+09:00`).toISOString();

    // 1. 해당 상담사가 응답한 messages 의 session_id list (최근 순)
    const counselorMsgs = await paginate<{ session_id: string; created_at: string }>(() =>
      supabase
        .from("messages")
        .select("session_id, created_at")
        .eq("sent_by", counselor)
        .eq("role", "assistant")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false }),
    );

    // distinct session — 이미 가장 최근 created_at 순으로 정렬됨
    const seen = new Set<string>();
    const recentSessionIds: string[] = [];
    for (const m of counselorMsgs) {
      if (!seen.has(m.session_id)) {
        seen.add(m.session_id);
        recentSessionIds.push(m.session_id);
        if (recentSessionIds.length >= RECENT_LIMIT) break;
      }
    }

    if (recentSessionIds.length === 0) {
      return NextResponse.json({
        counselor, conversations: [], aiReport: null, cachedAt: null,
      });
    }

    // 2. 캐시 조회 — dashboard_insights 재사용 (period_key + journey_hash 컬럼).
    //    period_key = counselor + period 만. 같은 기간이면 영구 hit.
    //    "오늘" 같은 변동 기간도 해당 일이 끝날 때까지 같은 key 유지 → 비용 절약.
    const periodKey = `cs-report:${counselor}:${fromDateKst}:${toDateKst}`;
    const journeyHash = "v2";
    const { data: cacheRow } = await supabase
      .from("dashboard_insights")
      .select("insight_text, generated_at")
      .eq("period_key", periodKey)
      .eq("journey_hash", journeyHash)
      .maybeSingle();
    if (cacheRow) {
      try {
        const cached = JSON.parse(cacheRow.insight_text) as { conversations: ReportConversation[]; aiReport: AiReport | null };
        return NextResponse.json({
          counselor,
          conversations: cached.conversations ?? [],
          aiReport: cached.aiReport ?? null,
          cachedAt: cacheRow.generated_at,
        });
      } catch { /* 캐시 파싱 실패 시 새로 생성 */ }
    }

    // 3. conversation meta + 모든 messages fetch
    const [convs, allMsgs] = await Promise.all([
      paginate<ConvRow>(() =>
        supabase
          .from("conversations")
          .select("session_id, name, phone, status, created_at")
          .in("session_id", recentSessionIds),
      ),
      paginate<MessageRow>(() =>
        supabase
          .from("messages")
          .select("session_id, role, content, sent_by, is_edited, created_at")
          .in("session_id", recentSessionIds)
          .order("created_at", { ascending: true }),
      ),
    ]);

    const convMap = new Map(convs.map((c) => [c.session_id, c]));
    const msgMap = new Map<string, ReportMessage[]>();
    for (const m of allMsgs) {
      const arr = msgMap.get(m.session_id) ?? [];
      arr.push({
        role: m.role,
        content: m.content,
        sentBy: m.sent_by,
        createdAt: m.created_at,
        isEdited: !!m.is_edited,
      });
      msgMap.set(m.session_id, arr);
    }

    const conversations: ReportConversation[] = recentSessionIds.map((sid) => {
      const c = convMap.get(sid);
      return {
        sessionId: sid,
        customerName: c?.name ?? null,
        phone: c?.phone ?? null,
        status: c?.status ?? "unknown",
        createdAt: c?.created_at ?? new Date().toISOString(),
        messages: msgMap.get(sid) ?? [],
      };
    });

    // 4. AI 분석 (Haiku) — 채팅 + metrics 종합 분석
    const aiReport = await classifyCounselor(counselor, conversations, metrics);

    // 5. 캐시 upsert (1시간 ttl — hour key 가 바뀌면 자동 새 row)
    try {
      await supabase.from("dashboard_insights").upsert({
        period_key: periodKey,
        journey_hash: journeyHash,
        insight_text: JSON.stringify({ conversations, aiReport }),
      }, { onConflict: "period_key,journey_hash" });
    } catch (cacheErr) {
      console.warn("[cs-report] cache 저장 실패:", cacheErr);
    }

    return NextResponse.json({
      counselor, conversations, aiReport, cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cs-report] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

const SYSTEM_PROMPT = `당신은 방문수거 상담 코칭 분석가입니다.
주어진 상담사의 (1) 기간 metrics 와 (2) 최근 채팅 N건을 종합 분석해 잘하는 점·개선 포인트를 도출합니다.

분석 기준 (metrics):
- 견적 전환율 (견적/상담), 예약 전환율 (예약/상담)
- AI 자동 답변 비율 (AI 의존도 vs 직접 응답)
- 시간당 답변·종료 (생산성)
- 응답 중위 시간 (속도)

분석 기준 (채팅):
- 톤·매너 (친절·존댓말·이모지 적절성)
- 응답 간결성·정확성
- 정보 수집 정확도 (주소·층·품목·일정)
- 견적 안내 명확성
- 예약 확정 흐름 능숙도
- 고객 의문/불만 응대

출력 JSON 스키마 (반드시 이 형식만):
{
  "summary": "1~2문장 총평 (metrics + 채팅 종합)",
  "strengths": ["잘하는 점 1", "잘하는 점 2", ...],   // 0~4개, 빈 배열 허용
  "improvements": ["개선 포인트 1", ...]                // 0~4개, 빈 배열 허용
}

규칙 (반드시 준수):
1. **"개선 포인트"는 진짜 문제가 보일 때만 적는다.** 짚을 게 없으면 빈 배열로 둔다. 4개를 채우려고 사소한 흠을 만들어내거나 추측하지 말 것.
2. **전환율 수치(견적/예약)만으로 "저조" 판정 금지.** 방문수거 사업 특성상 한 자릿수~10%대 전환율도 정상 범위다. 전환율 자체를 단점으로 언급하지 말고, 채팅에서 명백한 응대 실수가 같이 보일 때 그 응대 실수를 단점으로 적을 것.
3. **고객이 부정 신호(재질문·항의·혼란·이탈 의도·불만 표현)를 보이지 않은 상담은 단점으로 잡지 말 것.** 상담사가 무난히 진행했고 고객이 불편을 표하지 않았다면 그 채팅은 "잘한 케이스"이지 단점이 아니다.
4. summary 80자 이내. strengths/improvements 각 항목 35자 이내.
5. metrics 수치는 동료 평균과 비교하지 말고 절대값 기반 평가 (예: "응답 중위 5분 이내 빠른 편").
6. 채팅에 보이는 행동 + metrics 수치만 근거로. 추측 금지.
7. 채팅 참조 시 반드시 "#N (고객명)" 형식 사용 (예: "#3 (홍길동) 응답 늦음"). session id 길게 노출 금지.
8. 마크다운/설명 금지. JSON만.`;

interface CounselorMetrics2 {
  total: number | null;
  quoteSent: number | null;
  booked: number | null;
  totalReplies: number;
  aiAsIs: number;
  aiEdited: number;
  aiAsIsRate: number | null;
  repliesPerHour: number | null;
  closuresPerHour: number | null;
  medianResponseTimeMin: number | null;
}

function formatMetricsBlock(m: CounselorMetrics2 | undefined): string {
  if (!m) return "[metrics 없음]";
  const quoteRate = m.total && m.quoteSent ? `${Math.round((m.quoteSent / m.total) * 100)}%` : "—";
  const bookedRate = m.total && m.booked ? `${Math.round((m.booked / m.total) * 100)}%` : "—";
  return [
    "[기간 metrics]",
    `상담: ${m.total ?? "—"}건`,
    `견적: ${m.quoteSent ?? "—"}건 (${quoteRate})`,
    `예약: ${m.booked ?? "—"}건 (${bookedRate})`,
    `총답변: ${m.totalReplies}건 (AI 채택 ${m.aiAsIs}건 / 직접 작성 ${m.aiEdited}건, AI 의존도 ${m.aiAsIsRate ?? "—"}%)`,
    `시간당: 답변 ${m.repliesPerHour ?? "—"} · 종료 ${m.closuresPerHour ?? "—"}`,
    `응답 중위: ${m.medianResponseTimeMin ?? "—"}분`,
  ].join("\n");
}

async function classifyCounselor(
  counselor: string,
  conversations: ReportConversation[],
  metrics: CounselorMetrics2 | undefined,
): Promise<AiReport | null> {
  if (conversations.length === 0) return null;

  // 상담사 응답만 추출 (token 절약). AI 가 참조할 때 #N (고객명/session) 형식 — 그리드 인덱스와 매칭.
  // 고객명 없는 단순 문의 케이스는 session id 로 식별 (예약고객 아니면 성함 모름).
  const samples: string[] = [];
  conversations.forEach((c, idx) => {
    const userMsgs = c.messages.filter((m) => m.role === "user").slice(-3);
    const counselorMsgs = c.messages.filter((m) => m.role === "assistant" && m.sentBy === counselor);
    if (counselorMsgs.length === 0) return;
    const ident = c.customerName || `세션 ${c.sessionId}`;
    const label = `채팅 #${idx + 1} (${ident})`;
    const compact = [
      `[${label}]`,
      ...userMsgs.map((m) => `고객: ${m.content.slice(0, 200)}`),
      ...counselorMsgs.slice(-5).map((m) => `${counselor}: ${m.content.slice(0, 200)}`),
    ].join("\n");
    samples.push(compact);
  });
  if (samples.length === 0) return null;

  const prompt = `상담사: ${counselor}\n\n${formatMetricsBlock(metrics)}\n\n[최근 ${samples.length}건 채팅]\n\n${samples.join("\n\n---\n\n")}\n\n위 metrics + 채팅 기반 JSON 리포트:`;

  try {
    const res = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<AiReport>;
    return {
      summary: parsed.summary ?? "",
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 4) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.slice(0, 4) : [],
    };
  } catch (err) {
    console.error("[cs-report] Sonnet 호출 실패:", err);
    return null;
  }
}
