import { NextRequest, NextResponse } from "next/server";
import { listAllUserChatCases, listManagers } from "@/lib/channeltalk/client";
import { getCurrentUser } from "@/lib/auth/session";

// [CS-CT-018] 채널톡 상담 통계 (cases API 기반)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  try {
    const now = Date.now();
    const from = now - days * 24 * 60 * 60 * 1000;

    const [cases, managers] = await Promise.all([
      listAllUserChatCases({ from, to: now }),
      listManagers(),
    ]);

    const managerMap = new Map(managers.map((m) => [m.id, { name: m.name, avatarUrl: m.avatarUrl }]));

    // 헬퍼: 배열의 첫 번째 유효 값
    const first = (arr?: number[]) => arr?.find((v) => v > 0) ?? 0;
    const avg = (nums: number[]) => nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
    const median = (nums: number[]) => {
      if (nums.length === 0) return 0;
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    };

    // 1. 응답 시간 통계 — 전체 시간 + 운영 시간 둘 다 수집
    const totalWT: number[] = [];   // 전체 시간 — 첫 응답
    const totalART: number[] = [];  // 전체 시간 — 평균 응답
    const totalRT: number[] = [];   // 전체 시간 — 상담 종료
    const opWT: number[] = [];      // 운영 시간 — 첫 응답
    const opART: number[] = [];     // 운영 시간 — 평균 응답
    const opRT: number[] = [];      // 운영 시간 — 상담 종료

    for (const c of cases) {
      const wt = first(c.waitingTime);
      if (wt > 0) totalWT.push(wt);
      if (c.avgReplyTime && c.avgReplyTime > 0) totalART.push(c.avgReplyTime);
      if (c.resolutionTime && c.resolutionTime > 0) totalRT.push(c.resolutionTime);
      const owt = first(c.operationWaitingTime);
      if (owt > 0) opWT.push(owt);
      const oart = first(c.operationAvgReplyTime);
      if (oart > 0) opART.push(oart);
      const ort = first(c.operationResolutionTime);
      if (ort > 0) opRT.push(ort);
    }

    // 2. 담당자별 통계
    const assigneeData: Record<string, {
      count: number;
      resolved: number;
      replyCount: number;
      caseTimes: number[];    // 활동시간 산정용 (case createdAt min/max)
      totalWT: number[];      // 첫 응답 (전체 시간)
      opWT: number[];         // 첫 응답 (운영 시간)
      totalART: number[];     // 평균 답변 시간 (전체)
      opART: number[];        // 평균 답변 시간 (운영)
      totalRT: number[];      // 종결 시간 (전체)
      opRT: number[];         // 종결 시간 (운영)
      avatarUrl?: string;
    }> = {};
    for (const c of cases) {
      if (c.assigneeId) {
        const mgr = managerMap.get(c.assigneeId);
        const name = mgr?.name ?? c.assigneeId;
        if (!assigneeData[name]) assigneeData[name] = {
          count: 0, resolved: 0, replyCount: 0, caseTimes: [],
          totalWT: [], opWT: [], totalART: [], opART: [], totalRT: [], opRT: [],
          avatarUrl: mgr?.avatarUrl,
        };
        const a = assigneeData[name];
        a.count++;
        a.caseTimes.push(c.createdAt);
        if (c.closedAt && c.closedAt.length > 0) a.resolved++;
        if (c.replyCount && c.replyCount > 0) a.replyCount += c.replyCount;
        const wt = first(c.waitingTime);
        if (wt > 0) a.totalWT.push(wt);
        const owt = first(c.operationWaitingTime);
        if (owt > 0) a.opWT.push(owt);
        if (c.avgReplyTime && c.avgReplyTime > 0) a.totalART.push(c.avgReplyTime);
        const oart = first(c.operationAvgReplyTime);
        if (oart > 0) a.opART.push(oart);
        if (c.resolutionTime && c.resolutionTime > 0) a.totalRT.push(c.resolutionTime);
        const ort = first(c.operationResolutionTime);
        if (ort > 0) a.opRT.push(ort);
      }
    }

    // 3. 태그별 통계
    const tagCounts: Record<string, number> = {};
    const tagCategoryCounts: Record<string, number> = {};
    for (const c of cases) {
      for (const tag of c.tags ?? []) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        const cat = tag.includes("/") ? tag.split("/")[0] : tag;
        tagCategoryCounts[cat] = (tagCategoryCounts[cat] ?? 0) + 1;
      }
    }

    // 4. 일별 트렌드 — KST 자정 기준 버킷팅 (Vercel 서버 timezone=UTC 영향 차단)
    const KST_OFFSET = 9 * 60 * 60 * 1000;
    // "오늘 KST 자정"의 UTC ms
    const kstNowShifted = new Date(now + KST_OFFSET);
    kstNowShifted.setUTCHours(0, 0, 0, 0);
    const todayKstStartUtcMs = kstNowShifted.getTime() - KST_OFFSET;

    const dailyTrend: Array<{ date: string; total: number; closed: number; opened: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayS = todayKstStartUtcMs - i * 24 * 60 * 60 * 1000;
      const dayE = dayS + 24 * 60 * 60 * 1000 - 1;
      const dayC = cases.filter((c) => c.createdAt >= dayS && c.createdAt <= dayE);
      const closedCount = dayC.filter((c) => c.closedAt && c.closedAt.length > 0).length;
      // 라벨용 KST 날짜 문자열
      const labelDate = new Date(dayS + KST_OFFSET).toISOString().slice(0, 10);
      dailyTrend.push({
        date: labelDate,
        total: dayC.length,
        closed: closedCount,
        opened: dayC.length - closedCount,
      });
    }

    // 5. 시간대별/요일별 분포 — KST 기준 (UTC+9 적용)
    const hourlyDist = new Array(24).fill(0);
    const dayOfWeekDist = new Array(7).fill(0);
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const c of cases) {
      const dtKst = new Date(c.createdAt + KST_OFFSET);
      const hour = dtKst.getUTCHours();
      const dow = dtKst.getUTCDay();
      hourlyDist[hour]++;
      dayOfWeekDist[dow]++;
      heatmap[dow][hour]++;
    }

    // 6. 상태 카운트 (closedAt이 있으면 종료)
    let closedTotal = 0;
    let snoozedTotal = 0;
    for (const c of cases) {
      if (c.closedAt && c.closedAt.length > 0) closedTotal++;
      else if (c.snoozedTime && c.snoozedTime.some((v) => v > 0)) snoozedTotal++;
    }
    const openedTotal = cases.length - closedTotal - snoozedTotal;

    // 7. 이관율 (동일 채팅에 여러 케이스 = 이관)
    const chatCaseCounts = new Map<string, number>();
    for (const c of cases) {
      chatCaseCounts.set(c.userChatId, (chatCaseCounts.get(c.userChatId) ?? 0) + 1);
    }
    const reassigned = [...chatCaseCounts.values()].filter((cnt) => cnt > 1).length;

    // 8. 분포별 데이터 (시간 범위별 카운트)
    const DIST_RANGES = [
      { label: "3분 미만", max: 3 * 60 * 1000 },
      { label: "3분~10분", max: 10 * 60 * 1000 },
      { label: "10분~30분", max: 30 * 60 * 1000 },
      { label: "30분~1시간", max: 60 * 60 * 1000 },
      { label: "1시간 이상", max: Infinity },
    ];
    function buildDist(arr: number[]) {
      const buckets = DIST_RANGES.map((r) => ({ label: r.label, count: 0 }));
      for (const v of arr) {
        for (let i = 0; i < DIST_RANGES.length; i++) {
          if (v < DIST_RANGES[i].max) { buckets[i].count++; break; }
          if (i === DIST_RANGES.length - 1) { buckets[i].count++; }
        }
      }
      const total = arr.length || 1;
      return buckets.map((b) => ({ ...b, pct: Math.round((b.count / total) * 1000) / 10 }));
    }

    const distribution = {
      total: {
        firstResponse: buildDist(totalWT),
        avgReply: buildDist(totalART),
        resolution: buildDist(totalRT),
      },
      operation: {
        firstResponse: buildDist(opWT),
        avgReply: buildDist(opART),
        resolution: buildDist(opRT),
      },
    };

    return NextResponse.json({
      period: { days, from: new Date(from).toISOString(), to: new Date(now).toISOString() },
      total: cases.length,
      stateCount: { opened: openedTotal, closed: closedTotal, snoozed: snoozedTotal },
      responseTime: {
        total: {
          firstResponse: { avg: avg(totalWT), median: median(totalWT), count: totalWT.length },
          avgReply: { avg: avg(totalART), median: median(totalART), count: totalART.length },
          resolution: { avg: avg(totalRT), median: median(totalRT), count: totalRT.length },
        },
        operation: {
          firstResponse: { avg: avg(opWT), median: median(opWT), count: opWT.length },
          avgReply: { avg: avg(opART), median: median(opART), count: opART.length },
          resolution: { avg: avg(opRT), median: median(opRT), count: opRT.length },
        },
      },
      reassignRate: cases.length > 0 ? Math.round((reassigned / cases.length) * 1000) / 10 : 0,
      operatorLeaderboard: Object.entries(assigneeData)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, d]) => {
          // 활동시간: case createdAt 의 min~max (시간 단위, 1 decimal)
          const activeHours = d.caseTimes.length >= 2
            ? Math.round(((Math.max(...d.caseTimes) - Math.min(...d.caseTimes)) / 3600000) * 10) / 10
            : 0;
          const repliesPerHour = activeHours >= 0.1
            ? Math.round((d.replyCount / activeHours) * 10) / 10
            : null;
          const closuresPerHour = activeHours >= 0.1
            ? Math.round((d.resolved / activeHours) * 10) / 10
            : null;
          const repliesPerCase = d.count > 0
            ? Math.round((d.replyCount / d.count) * 100) / 100
            : 0;
          return {
            name,
            avatarUrl: d.avatarUrl ?? null,
            count: d.count,
            resolved: d.resolved,
            replyCount: d.replyCount,
            repliesPerCase,
            activeHours,
            repliesPerHour,
            closuresPerHour,
            avgFirstResponseTotal: avg(d.totalWT),
            avgFirstResponseOp: avg(d.opWT),
            medianFirstResponseTotal: median(d.totalWT),
            medianFirstResponseOp: median(d.opWT),
            avgReplyTotal: avg(d.totalART),
            avgReplyOp: avg(d.opART),
            medianReplyTotal: median(d.totalART),
            medianReplyOp: median(d.opART),
            avgResolutionTotal: avg(d.totalRT),
            avgResolutionOp: avg(d.opRT),
            medianResolutionTotal: median(d.totalRT),
            medianResolutionOp: median(d.opRT),
          };
        }),
      tagCounts: Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count })),
      tagCategoryCounts: Object.entries(tagCategoryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
      dailyTrend,
      hourlyDist,
      dayOfWeekDist,
      heatmap,
      distribution,
    });
  } catch (err) {
    console.error("[CT] stats error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
