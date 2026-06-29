import fs from "fs";
import path from "path";

const SHARED_APPS = "/shared/apps";

export type DeployMeta = {
  name: string;
  displayName: string;
  description: string;
  command: string;
};

export function readDeployMeta(appName: string): DeployMeta {
  const confPath = path.join(SHARED_APPS, appName, "deploy.yml");
  let displayName = appName;
  let description = "";
  let command = "";
  try {
    const raw = fs.readFileSync(confPath, "utf8");
    for (const line of raw.split("\n")) {
      const nm = line.match(/^name:\s*["']?([^"'\n#]+)["']?/);
      if (nm) displayName = nm[1].trim();
      const dm = line.match(/^description:\s*["']?([^"'\n#]+)["']?/);
      if (dm) description = dm[1].trim();
      const cm = line.match(/^command:\s*["']?([^"'\n#]+)["']?/);
      if (cm) command = cm[1].trim();
    }
  } catch {
    // deploy.yml 없는 경우 기본값 유지
  }
  return { name: appName, displayName, description, command };
}

export type LogFileInfo = {
  file: string;
  size: number;
  mtime: string; // ISO
};

export function listLogFiles(appName: string): LogFileInfo[] {
  const dir = path.join(SHARED_APPS, appName, "logs");
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".log"))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return { file: f, size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  } catch {
    return [];
  }
}

export function tailLogFile(
  appName: string,
  file: string,
  n: number,
): { lines: string[]; mtime: string | null; size: number } {
  const dir = path.join(SHARED_APPS, appName, "logs");
  // path traversal 차단: 파일명에 `/` 또는 `..` 포함 금지
  if (file.includes("/") || file.includes("..") || !file.endsWith(".log")) {
    throw new Error("invalid filename");
  }
  const full = path.join(dir, file);
  const st = fs.statSync(full);
  const content = fs.readFileSync(full, "utf8");
  const all = content.split("\n").filter((l) => l.length > 0);
  return {
    lines: all.slice(-n),
    mtime: st.mtime.toISOString(),
    size: st.size,
  };
}
