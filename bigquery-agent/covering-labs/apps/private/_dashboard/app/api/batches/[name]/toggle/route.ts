import { NextRequest, NextResponse } from "next/server";
import { parseCronLines } from "@/lib/cron-toggle";
import { toggleApp } from "@/lib/crontab-io";
import { readDeployMeta } from "@/lib/deploy-meta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { name } = await params;
  let body: { desired?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const desired = body.desired;
  if (desired !== "on" && desired !== "off") {
    return NextResponse.json(
      { error: "desired must be 'on' or 'off'" },
      { status: 400 },
    );
  }

  try {
    const confirmed = await toggleApp(name, desired);
    const lines = parseCronLines(confirmed.raw).filter((l) => l.appName === name);
    const line = lines[0];
    const meta = readDeployMeta(name);

    return NextResponse.json({
      name,
      displayName: meta.displayName,
      enabled: confirmed.enabled,
      schedule: line?.schedule ?? "",
      command: line?.command ?? meta.command,
      confirmedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
