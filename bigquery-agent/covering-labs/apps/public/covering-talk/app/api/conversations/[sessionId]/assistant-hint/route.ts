import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { conversationStore } from "@/lib/store/conversations";
import { createMessage } from "@/lib/ai/ai-client";
import type { CollectedInfo } from "@/lib/ai/phases";
import { supabase } from "@/lib/supabase/client";
import type { ABCCapacitySettings } from "@/lib/dispatch/time-blocks";

// 2026년 한국 공식 공휴일 (설정 값 없을 때 fallback)
const KR_HOLIDAYS_2026_FALLBACK = [
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", // 삼일절
  "2026-03-02", // 삼일절 대체 (일요일 겹침)
  "2026-05-05", // 어린이날
  "2026-05-24", // 부처님 오신날
  "2026-05-25", // 부처님 오신날 대체
  "2026-06-06", // 현충일
  "2026-08-15", // 광복절
  "2026-08-17", // 광복절 대체
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
  "2026-10-03", // 개천절
  "2026-10-05", // 개천절 대체
  "2026-10-09", // 한글날
  "2026-12-25", // 크리스마스
];

let _holidaysCache: { data: string[]; expiresAt: number } | null = null;

async function getHolidays(): Promise<string[]> {
  const now = Date.now();
  if (_holidaysCache && _holidaysCache.expiresAt > now) return _holidaysCache.data;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "abc_capacity")
      .maybeSingle();
    const settings = (data?.value as ABCCapacitySettings | null) ?? null;
    const fromSettings = settings?.holidays ?? [];
    // 설정에 없는 날짜도 fallback에서 보완 (병합)
    const merged = Array.from(new Set([...fromSettings, ...KR_HOLIDAYS_2026_FALLBACK])).sort();
    _holidaysCache = { data: merged, expiresAt: now + 5 * 60 * 1000 }; // 5분 캐시
    return merged;
  } catch {
    _holidaysCache = { data: KR_HOLIDAYS_2026_FALLBACK, expiresAt: now + 5 * 60 * 1000 };
    return KR_HOLIDAYS_2026_FALLBACK;
  }
}

// 빌드 타임에 정책 문서 로드 (런타임 파일 I/O 최소화)
let _policy: string | null = null;
let _headings: string[] | null = null;
function loadPolicy(): string {
  if (_policy) return _policy;
  try {
    _policy = fs.readFileSync(
      path.join(process.cwd(), "lib", "ai", "pickup-policy.md"),
      "utf-8"
    );
    _headings = [];
    for (const line of _policy.split(/\r?\n/)) {
      const m = line.match(/^(#{1,4})\s+(.+?)\s*$/);
      if (m) _headings.push(m[2].trim());
    }
  } catch {
    _policy = "";
    _headings = [];
  }
  return _policy;
}
function getHeadings(): string[] {
  if (!_policy) loadPolicy();
  return _headings ?? [];
}

// [CS-CONV-061] 방문수거 어시스턴트 — 세션 맥락 기반 짧은 코칭 힌트
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  try {
    const { sessionId } = await params;
    const conv = await conversationStore.getById(sessionId);
    if (!conv) {
      return NextResponse.json({ error: "대화 없음" }, { status: 404 });
    }

    const policy = loadPolicy();
    if (!policy) {
      return NextResponse.json({ hint: null, error: "정책 문서 없음" }, { status: 200 });
    }

    const holidays = await getHolidays();

    // 최근 메시지 12개 (system 제외)
    const recent = (conv.messages ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => `${m.role === "user" ? "고객" : "상담사"}: ${m.content}`)
      .join("\n");

    const ci = (conv.collectedInfo || {}) as CollectedInfo & {
      requestedDate?: string | null;
      name?: string | null;
      phone?: string | null;
    };
    const collected: string[] = [];
    if (ci.address) collected.push(`주소: ${ci.address}`);
    if (ci.district) collected.push(`지역: ${ci.district}`);
    if (ci.floor != null) collected.push(`층: ${ci.floor}`);
    if (ci.elevator != null) collected.push(`엘리베이터: ${ci.elevator ? "있음" : "없음"}`);
    if (ci.parking != null) collected.push(`주차: ${ci.parking ? "가능" : "불가"}`);
    if (ci.name) collected.push(`성함: ${ci.name}`);
    if (ci.phone) collected.push(`연락처: ${ci.phone}`);
    if (ci.requestedDate) collected.push(`희망일: ${ci.requestedDate}`);
    if (ci.items && ci.items.length > 0) {
      const itemNames = ci.items.slice(0, 8).map((i) => {
        const it = i as unknown as { category?: string; spec?: string; name?: string; displayName?: string };
        return it.name || it.displayName || `${it.category ?? ""}${it.spec ? ` ${it.spec}` : ""}`.trim() || "(이름없음)";
      });
      collected.push(`품목(${ci.items.length}건): ${itemNames.join(", ")}`);
    }

    const headings = getHeadings();

    const systemBlocks = [
      {
        type: "text" as const,
        text: `너는 커버링 방문수거 상담사를 돕는 어시스턴트다. 아래 운영 정책을 숙지하고, 상담사가 현재 대화에서 놓치기 쉬운 점을 찾아 **한 문장(40자 이내)**으로 짧게 알려라.

출력 형식: **JSON 한 줄만**. 코드펜스나 설명 없이.
{"hint":"조언 한 문장","section":"관련 정책 헤딩 텍스트 또는 빈 문자열"}

hint 규칙:
- 문장 끝에 마침표 없이 자연스러운 구어체, 친근하지만 간결.
- 정책 위반·확인 미흡이 있으면 그것을 최우선.
- 없다면 다음 필요한 액션(정보 수집, 견적 발송, 예약 확정 등)을 한 가지 짚어라.
- "~하세요!" 같은 실행형 어미 권장.
- 중요도 없으면 응원 한 마디.
- 이모지·마크다운·따옴표 없이 순수 한글.

section 규칙:
- hint 내용이 정책 문서의 특정 섹션과 관련있으면 **해당 섹션의 정확한 heading 텍스트**를 넣어라 (예: "## 2-3. 할인/가격 흥정 대응").
- 정책 문서에 있는 heading 문자열을 그대로 써. 없는 heading을 만들지 마.
- 응원·일반 액션처럼 특정 정책과 무관하면 빈 문자열 "".

**공휴일 판단 규칙 (중요)**:
- 공휴일은 아래 "공휴일 목록"에 명시된 YYYY-MM-DD 날짜만 공휴일이다.
- 목록에 없는 날짜는 **평일**. 절대 추측하거나 임의로 공휴일이라고 말하지 마.
- "대현님 확인" 조언은 요청일이 공휴일 목록에 있을 때만 해라.`,
        cache_control: { type: "ephemeral" as const },
      },
      {
        type: "text" as const,
        text: `## 운영 정책\n\n${policy}`,
        cache_control: { type: "ephemeral" as const },
      },
      {
        type: "text" as const,
        text: `## 공휴일 목록 (이 목록에 있는 날짜만 공휴일로 인정)\n${holidays.map((d) => `- ${d}`).join("\n")}`,
        cache_control: { type: "ephemeral" as const },
      },
      {
        type: "text" as const,
        text: `## 정책 문서 heading 목록 (section 필드에 이 중 하나만 허용)\n${headings.map((h) => `- ${h}`).join("\n")}`,
        cache_control: { type: "ephemeral" as const },
      },
    ];

    // 요청 날짜가 공휴일인지 사전 계산 (AI 환각 방지)
    let holidayLine = "";
    if (ci.requestedDate) {
      const isHoliday = holidays.includes(ci.requestedDate);
      holidayLine = `\n## 요청일 공휴일 여부\n${ci.requestedDate} → ${isHoliday ? "공휴일 (대현님 확인 규칙 적용)" : "평일 (공휴일 아님 — 대현님 확인 불필요)"}`;
    }

    const userMessage = `## 현재 단계
${conv.currentPhase ?? "미확인"}

## 수집된 정보
${collected.length > 0 ? collected.join("\n") : "(없음)"}
${holidayLine}

## 최근 대화
${recent || "(없음)"}

위 상황에서 상담사에게 줄 가장 유용한 조언 한 문장만:`;

    const res = await createMessage({
      model: "haiku",
      max_tokens: 200,
      temperature: 0.4,
      system: systemBlocks,
      messages: [{ role: "user", content: userMessage }],
    });

    // JSON 파싱 — hint + section 추출. 실패 시 전체 텍스트를 hint로 폴백.
    const raw = (res.text || "").trim();
    let hint = "";
    let section = "";
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const jsonStart = cleaned.indexOf("{");
      const jsonEnd = cleaned.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
        if (typeof parsed.hint === "string") hint = parsed.hint;
        if (typeof parsed.section === "string") section = parsed.section;
      } else {
        hint = raw; // JSON 아닌 경우 전체를 hint로
      }
    } catch {
      hint = raw;
    }
    hint = hint.replace(/^["'「『]|["'」』]$/g, "").replace(/\n+/g, " ").slice(0, 80);
    section = section.trim().slice(0, 120);

    return NextResponse.json({ hint, section });
  } catch (err) {
    console.error("[assistant-hint] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "생성 실패" },
      { status: 500 }
    );
  }
}
