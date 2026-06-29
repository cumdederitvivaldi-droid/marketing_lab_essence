import { NextResponse } from "next/server";
import { parseCronLines } from "@/lib/cron-toggle";
import { readCrontab } from "@/lib/crontab-io";
import { readDeployMeta, listLogFiles, tailLogFile } from "@/lib/deploy-meta";

export const dynamic = "force-dynamic";

function scheduleToHuman(cron: string): string {
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [min, hour, dom, month, dow] = p;
  if (cron.trim() === "* * * * *") return "매분";
  if (min.startsWith("*/") && hour === "*" && dom === "*") return `매 ${min.slice(2)}분마다`;
  if (hour.startsWith("*/") && dom === "*") return `매 ${hour.slice(2)}시간마다`;
  if (min !== "*" && hour !== "*" && dom === "*" && month === "*" && dow === "*")
    return `매일 ${hour}:${min.padStart(2, "0")}`;
  if (min !== "*" && hour === "*" && dom === "*") return `매시 ${min}분`;
  if (dow !== "*" && dom === "*" && /^\d$/.test(dow)) {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    const d = days[Number(dow)] ?? dow;
    return `매주 ${d}요일 ${hour}:${min.padStart(2, "0")}`;
  }
  return cron;
}

export async function GET() {
  try {
    let raw = "";
    try {
      raw = readCrontab();
    } catch {
      raw = "";
    }
    const cronLines = parseCronLines(raw).filter((l) => l.appName);

    const batches = cronLines.map((line) => {
      const appName = line.appName as string;
      const meta = readDeployMeta(appName);
      const logFiles = listLogFiles(appName);

      let lastLines: string[] = [];
      let lastLogAt: string | null = null;
      const primary = logFiles.find((f) => f.file === "batch.log") ?? logFiles[0];
      if (primary) {
        try {
          const tail = tailLogFile(appName, primary.file, 50);
          lastLines = tail.lines;
          lastLogAt = tail.mtime;
        } catch {
          // ignore
        }
      }

      const schedule = line.schedule ?? "";
      return {
        name: appName,
        displayName: meta.displayName,
        description: meta.description,
        command: meta.command || line.command || "",
        schedule,
        scheduleHuman: scheduleToHuman(schedule),
        enabled: line.enabled,
        lastLines,
        lastLogAt,
        logFiles: logFiles.map((f) => f.file),
      };
    });

    return NextResponse.json({ batches, updatedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      { batches: [], error: String(err), updatedAt: new Date().toISOString() },
      { status: 500 },
    );
  }
}
