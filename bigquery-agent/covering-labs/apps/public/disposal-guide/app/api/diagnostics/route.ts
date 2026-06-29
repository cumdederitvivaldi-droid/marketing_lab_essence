import { readFileSync } from 'fs';
import { resolve } from 'path';
import { NextResponse } from 'next/server';
import { loadDisposalGuideConfigWithDiagnostics } from '@/src/lib/loadGuideConfig';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function readBuildId(): string | undefined {
  try {
    return readFileSync(resolve(process.cwd(), '.next/BUILD_ID'), 'utf8').trim() || undefined;
  } catch {
    return process.env.NEXT_BUILD_ID;
  }
}

function commitSha(): string | undefined {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA;
  return sha ? sha.slice(0, 12) : undefined;
}

export async function GET() {
  const { diagnostics } = await loadDisposalGuideConfigWithDiagnostics({ forceRefresh: true });

  return NextResponse.json(
    {
      ...diagnostics,
      buildId: readBuildId(),
      commit: commitSha(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
