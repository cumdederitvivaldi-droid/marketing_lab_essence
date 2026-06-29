import { spawnSync } from "child_process";
import { toggleAppInCron } from "./cron-toggle";

/**
 * 현재 실행 유저(대시보드 프로세스 = SA 유저)의 crontab 을 통째로 읽는다.
 * 실패 시 Error throw.
 */
export function readCrontab(): string {
  const result = spawnSync("crontab", ["-l"], { encoding: "utf8", timeout: 5000 });
  if (result.status !== 0) {
    // crontab 이 없으면 status=1, stderr="no crontab for X" — 빈 문자열 반환
    const stderr = result.stderr?.toString() ?? "";
    if (/no crontab/i.test(stderr)) return "";
    throw new Error(`crontab -l 실패: status=${result.status} stderr=${stderr}`);
  }
  return (result.stdout ?? "").toString();
}

/**
 * 새 crontab 원본을 stdin 으로 `crontab -` 에 교체 적용한다.
 * cron 데몬이 파일을 atomic 교체하므로 중간 상태 노출 없음.
 */
export function writeCrontab(raw: string): void {
  const result = spawnSync("crontab", ["-"], {
    input: raw,
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.status !== 0) {
    throw new Error(
      `crontab - 실패: status=${result.status} stderr=${result.stderr?.toString() ?? ""}`,
    );
  }
}

/**
 * per-app 토글 직렬화.
 * 동일 앱에 대해 동시 요청이 와도 직렬 처리 (더블클릭 안전).
 */
const locks = new Map<string, Promise<unknown>>();

export async function withAppLock<T>(appName: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(appName) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    appName,
    next.finally(() => {
      if (locks.get(appName) === next) locks.delete(appName);
    }),
  );
  return next;
}

/**
 * 앱 하나를 원하는 상태로 전환하고 확인된 최종 상태를 반환한다.
 * - 토글 전 crontab 읽기
 * - 순수 함수로 변경
 * - 쓰기
 * - 다시 읽어서 실제 반영 여부 확인 (confirmed)
 */
export async function toggleApp(
  appName: string,
  desired: "on" | "off",
): Promise<{ appName: string; enabled: boolean; raw: string }> {
  return withAppLock(appName, async () => {
    const current = readCrontab();
    const next = toggleAppInCron(current, appName, desired);

    // no-op 인 경우 crontab 재쓰기 생략
    if (next !== current) {
      writeCrontab(next);
    }

    const confirmed = readCrontab();
    const expectedDisabled = desired === "off";
    const appLineMatch = confirmed
      .split("\n")
      .find((l) => new RegExp(`#\\s*deploy:${appName}\\s*$`).test(l));
    const actualDisabled = appLineMatch?.startsWith("#[DISABLED] ") ?? false;

    if (expectedDisabled !== actualDisabled) {
      throw new Error(
        `토글 적용 후 검증 실패: app=${appName} desired=${desired} actual=${actualDisabled ? "off" : "on"}`,
      );
    }

    return { appName, enabled: !actualDisabled, raw: confirmed };
  });
}
