import { NextRequest, NextResponse } from "next/server";
import { tailLogFile } from "@/lib/deploy-meta";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ name: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { name } = await params;
  const url = new URL(req.url);
  const file = url.searchParams.get("file") ?? "batch.log";
  const tailRaw = url.searchParams.get("tail") ?? "100";
  const tail = Math.max(1, Math.min(500, Number.parseInt(tailRaw, 10) || 100));

  try {
    const result = tailLogFile(name, file, tail);
    return NextResponse.json({ name, file, tail, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/invalid filename/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    if (/ENOENT/.test(msg)) {
      return NextResponse.json({ error: `log file not found: ${file}` }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
