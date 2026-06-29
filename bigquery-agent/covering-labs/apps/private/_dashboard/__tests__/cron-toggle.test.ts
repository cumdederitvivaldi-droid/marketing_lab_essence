import { parseCronLines, toggleAppInCron, DISABLED_PREFIX } from "../lib/cron-toggle";

const SAMPLE_CRON = [
  "CRON_TZ=Asia/Seoul",
  "30 10,15 * * * cd /shared/apps/large-bag-delivery-batch && python3 src/main.py --mode register >> logs/batch.log 2>&1 # deploy:large-bag-delivery-batch",
  "0 21 * * * cd /shared/apps/vehicle-dispatch-monitor && python3 monitor.py --loop >> logs/batch.log 2>&1 # deploy:vehicle-dispatch-monitor",
  "0 10 * * 1 cd /shared/apps/new-region-weekly-monitor && python3 src/main.py >> logs/batch.log 2>&1 # deploy:new-region-weekly-monitor",
  "5 9 * * * cd /shared/apps/flarelane-d7-retention && python3 src/run_d7_event_batch.py >> logs/batch.log 2>&1 # deploy:flarelane-d7-retention",
].join("\n");

describe("parseCronLines", () => {
  test("deploy 태그가 붙은 4개 앱을 모두 파싱", () => {
    const apps = parseCronLines(SAMPLE_CRON).filter((l) => l.appName);
    expect(apps.map((l) => l.appName)).toEqual([
      "large-bag-delivery-batch",
      "vehicle-dispatch-monitor",
      "new-region-weekly-monitor",
      "flarelane-d7-retention",
    ]);
    expect(apps.every((l) => l.enabled)).toBe(true);
  });

  test("schedule 과 command 를 분리 추출", () => {
    const [app] = parseCronLines(SAMPLE_CRON).filter(
      (l) => l.appName === "large-bag-delivery-batch",
    );
    expect(app.schedule).toBe("30 10,15 * * *");
    expect(app.command).toContain("python3 src/main.py --mode register");
  });

  test("DISABLED prefix 가 붙은 라인은 enabled=false", () => {
    const disabledLine = DISABLED_PREFIX + "5 9 * * * cd /x && c >> logs/batch.log 2>&1 # deploy:foo";
    const [line] = parseCronLines(disabledLine);
    expect(line.appName).toBe("foo");
    expect(line.enabled).toBe(false);
    expect(line.schedule).toBe("5 9 * * *");
  });

  test("deploy 태그 없는 라인은 appName=null, enabled=false", () => {
    const [tz] = parseCronLines("CRON_TZ=Asia/Seoul");
    expect(tz.appName).toBeNull();
    expect(tz.enabled).toBe(false);
  });
});

describe("toggleAppInCron", () => {
  test("on → off 시 DISABLED prefix 추가", () => {
    const result = toggleAppInCron(SAMPLE_CRON, "flarelane-d7-retention", "off");
    const [line] = parseCronLines(result).filter((l) => l.appName === "flarelane-d7-retention");
    expect(line.enabled).toBe(false);
    expect(line.raw.startsWith(DISABLED_PREFIX)).toBe(true);
  });

  test("off → on 왕복 시 원본 복원", () => {
    const off = toggleAppInCron(SAMPLE_CRON, "flarelane-d7-retention", "off");
    const backOn = toggleAppInCron(off, "flarelane-d7-retention", "on");
    expect(backOn).toBe(SAMPLE_CRON);
  });

  test("idempotent: on 을 두 번 적용해도 결과 동일", () => {
    const once = toggleAppInCron(SAMPLE_CRON, "flarelane-d7-retention", "on");
    const twice = toggleAppInCron(once, "flarelane-d7-retention", "on");
    expect(once).toBe(twice);
  });

  test("idempotent: off 를 두 번 적용해도 결과 동일", () => {
    const once = toggleAppInCron(SAMPLE_CRON, "flarelane-d7-retention", "off");
    const twice = toggleAppInCron(once, "flarelane-d7-retention", "off");
    expect(once).toBe(twice);
  });

  test("존재하지 않는 앱 요청 시 Error", () => {
    expect(() => toggleAppInCron(SAMPLE_CRON, "no-such-app", "off")).toThrow(/not found/);
  });

  test("다른 앱 라인은 영향 없음", () => {
    const result = toggleAppInCron(SAMPLE_CRON, "flarelane-d7-retention", "off");
    const originalLines = SAMPLE_CRON.split("\n");
    const resultLines = result.split("\n");
    for (let i = 0; i < originalLines.length; i++) {
      if (originalLines[i].includes("deploy:flarelane-d7-retention")) continue;
      expect(resultLines[i]).toBe(originalLines[i]);
    }
  });

  test("schedule 은 토글 후에도 동일", () => {
    const off = toggleAppInCron(SAMPLE_CRON, "large-bag-delivery-batch", "off");
    const [line] = parseCronLines(off).filter((l) => l.appName === "large-bag-delivery-batch");
    expect(line.schedule).toBe("30 10,15 * * *");
  });

  test("command 는 토글 후에도 동일", () => {
    const off = toggleAppInCron(SAMPLE_CRON, "vehicle-dispatch-monitor", "off");
    const [line] = parseCronLines(off).filter((l) => l.appName === "vehicle-dispatch-monitor");
    expect(line.command).toContain("python3 monitor.py --loop");
  });
});
