/**
 * crontab 토글 순수 함수.
 *
 * 배치 cron 라인은 `scripts/deploy-app.sh` 가 아래 형식으로 등록한다:
 *   "<SCHEDULE> cd <APP_DIR> && <COMMAND> >> logs/batch.log 2>&1 # deploy:<APP_NAME>"
 *
 * 대시보드 토글은 해당 라인 앞에 `#[DISABLED] ` prefix 를 붙였다 떼는 방식으로
 * 주석 처리/해제한다. 다른 라인은 불변.
 *
 * - 추가 DB 없이 crontab 자체를 state store 로 사용
 * - deploy-app.sh 가 재배포 시 전체 라인을 다시 쓰므로, 그 시점에는 DISABLED 상태가 리셋됨
 *   (알려진 한계, PR 설명에 명시)
 */

export const DISABLED_PREFIX = "#[DISABLED] ";

export type CronLine = {
  /** 원본 라인 (주석/주석 해제 판단 용이성을 위해 보존). */
  raw: string;
  /** `# deploy:<name>` 태그가 있으면 해당 이름. 없으면 null. */
  appName: string | null;
  /** DISABLED prefix 가 없으면 true. appName 이 null 이면 항상 false. */
  enabled: boolean;
  /** cron 표현식 (5필드). 파싱 실패 시 null. */
  schedule: string | null;
  /** SCHEDULE 과 `# deploy:` 사이의 명령 부분. 파싱 실패 시 null. */
  command: string | null;
};

const DEPLOY_TAG_RE = /#\s*deploy:(\S+)\s*$/;

/**
 * crontab 원본 문자열을 라인 단위로 파싱한다.
 * `# deploy:<name>` 태그가 있는 라인만 appName 이 채워진다.
 */
export function parseCronLines(raw: string): CronLine[] {
  return raw.split("\n").map(parseOne);
}

function parseOne(line: string): CronLine {
  const appMatch = line.match(DEPLOY_TAG_RE);
  if (!appMatch) {
    return { raw: line, appName: null, enabled: false, schedule: null, command: null };
  }
  const appName = appMatch[1];

  const hasDisabled = line.startsWith(DISABLED_PREFIX);
  const content = hasDisabled ? line.slice(DISABLED_PREFIX.length) : line;

  // SCHEDULE = 첫 5 필드, COMMAND = 이후 공백~`# deploy:` 사이
  const parsed = content.match(/^((?:\S+\s+){4}\S+)\s+(.+?)\s+#\s*deploy:\S+\s*$/);
  const schedule = parsed ? parsed[1].trim() : null;
  const command = parsed ? parsed[2].trim() : null;

  return { raw: line, appName, enabled: !hasDisabled, schedule, command };
}

/**
 * 특정 앱의 cron 라인을 enable/disable 로 전환한다.
 * - desired='on':  DISABLED prefix 제거
 * - desired='off': DISABLED prefix 추가
 * - 이미 원하는 상태이면 no-op (idempotent)
 *
 * appName 에 해당하는 라인이 없으면 Error throw (호출부에서 404 로 변환).
 */
export function toggleAppInCron(
  raw: string,
  appName: string,
  desired: "on" | "off",
): string {
  const lines = raw.split("\n");
  let matched = false;

  const updated = lines.map((line) => {
    const appMatch = line.match(DEPLOY_TAG_RE);
    if (!appMatch) return line;
    // prefix 제거 전 기준으로 appName 검사 (prefix 뒤 본문의 tag 가 기준)
    if (appMatch[1] !== appName) return line;

    matched = true;
    const hasDisabled = line.startsWith(DISABLED_PREFIX);

    if (desired === "off" && !hasDisabled) return DISABLED_PREFIX + line;
    if (desired === "on" && hasDisabled) return line.slice(DISABLED_PREFIX.length);
    // 이미 원하는 상태이면 그대로
    return line;
  });

  if (!matched) {
    throw new Error(`App "${appName}" not found in crontab (no "# deploy:${appName}" tag)`);
  }

  return updated.join("\n");
}
