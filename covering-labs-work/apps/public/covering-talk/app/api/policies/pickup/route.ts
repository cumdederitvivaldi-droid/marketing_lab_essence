import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

let _cached: { text: string; headings: { level: number; text: string; slug: string }[] } | null = null;

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣\-]/g, "")
    .slice(0, 80);
}

function load(): typeof _cached {
  if (_cached) return _cached;
  try {
    const text = fs.readFileSync(
      path.join(process.cwd(), "lib", "ai", "pickup-policy.md"),
      "utf-8"
    );
    const headings: { level: number; text: string; slug: string }[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const m = rawLine.match(/^(#{1,4})\s+(.+?)\s*$/);
      if (m) {
        const level = m[1].length;
        const headingText = m[2].trim();
        headings.push({ level, text: headingText, slug: slugify(headingText) });
      }
    }
    _cached = { text, headings };
    return _cached;
  } catch {
    return null;
  }
}

// [CS-ETC-xxx] 방문수거 정책 문서 조회
export async function GET(): Promise<NextResponse> {
  const data = load();
  if (!data) {
    return NextResponse.json({ error: "정책 문서 없음" }, { status: 404 });
  }
  return NextResponse.json(data);
}
