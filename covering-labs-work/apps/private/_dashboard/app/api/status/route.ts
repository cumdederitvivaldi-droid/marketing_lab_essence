import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SHARED = '/shared';


type AppInfo = {
  name: string;
  displayName: string;
  description: string;
  type: string;
  port: number | null;
  status: string;
  env: 'private' | 'public';
};

function parseDeployYml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^(\w+):\s*["']?([^"'\n#]*)["']?/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

function collectLocalApps(): AppInfo[] {
  let portRegistry: Record<string, number> = {};
  try {
    portRegistry = JSON.parse(fs.readFileSync(path.join(SHARED, 'port-registry.json'), 'utf8'));
  } catch {}

  const pm2Status: Record<string, string> = {};
  try {
    const raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8', timeout: 5000 });
    const list: { name: string; pm2_env?: { status?: string } }[] = JSON.parse(raw);
    for (const p of list) pm2Status[p.name] = p.pm2_env?.status ?? 'unknown';
  } catch {}

  const apps: AppInfo[] = [];
  const appsDir = path.join(SHARED, 'apps');
  let appDirs: string[] = [];
  try {
    appDirs = fs.readdirSync(appsDir).filter((d: string) => {
      try { return fs.statSync(path.join(appsDir, d)).isDirectory() && !d.startsWith('_'); }
      catch { return false; }
    });
  } catch {}

  for (const appName of appDirs) {
    try {
      const raw = fs.readFileSync(path.join(appsDir, appName, 'deploy.yml'), 'utf8');
      const cfg = parseDeployYml(raw);
      if (!cfg.type || cfg.type === 'batch') continue;
      apps.push({
        name: appName,
        displayName: cfg.name || appName,
        description: cfg.description || '',
        type: cfg.type,
        port: portRegistry[appName] ?? null,
        status: pm2Status[appName] ?? 'unknown',
        env: 'private',
      });
    } catch {}
  }
  return apps;
}

function fetchPublicApps(): { apps: AppInfo[]; error: string | null; updatedAt: string | null } {
  try {
    const tokenRaw = execSync(
      'curl -sf -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"',
      { encoding: 'utf8', timeout: 5000 },
    );
    const { access_token } = JSON.parse(tokenRaw) as { access_token: string };
    const raw = execSync(
      `curl -sf -H "Authorization: Bearer ${access_token}" "https://storage.googleapis.com/storage/v1/b/covering-labs/o/_dashboard%2Fpublic-status.json?alt=media"`,
      { encoding: 'utf8', timeout: 8000 },
    );
    const data = JSON.parse(raw) as { apps?: Array<Omit<AppInfo, 'env'>>; updatedAt?: string };
    const apps: AppInfo[] = (data.apps ?? []).map(a => ({ ...a, env: 'public' as const }));
    return { apps, error: null, updatedAt: data.updatedAt ?? null };
  } catch (err) {
    return { apps: [], error: err instanceof Error ? err.message : String(err), updatedAt: null };
  }
}

export async function GET() {
  try {
    const localApps = collectLocalApps();
    const publicResult = fetchPublicApps();
    const apps = [...localApps, ...publicResult.apps];
    return NextResponse.json({
      apps,
      publicError: publicResult.error,
      publicUpdatedAt: publicResult.updatedAt,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ apps: [], error: String(err), updatedAt: new Date().toISOString() });
  }
}
