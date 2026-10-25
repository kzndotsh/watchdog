import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve(import.meta.dirname, "../dev.sh");
const dirs: string[] = [];
const runs: Run[] = [];

type Run = {
  readonly pid: number;
  readonly exited: Promise<number | null>;
  /** The terminal's Ctrl+C: the signal goes to the whole process group. */
  readonly ctrlC: () => void;
  readonly kill: (signal: NodeJS.Signals) => void;
  readonly stdout: () => string;
  readonly stderr: () => string;
};

afterEach(async () => {
  // A failed assertion must not leave services running: stop every group, then remove the files.
  const started = runs.splice(0);
  for (const run of started) {
    try {
      process.kill(-run.pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  await Promise.all(started.map((run) => run.exited));
  for (const dir of dirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

/**
 * A fake service: records "ready" once its signal handlers exist, then every signal it gets,
 * and exits shortly after the first one (unless `ignore`). `crash` exits 7 once the web and
 * site fakes are ready, so the others are always running when it dies.
 */
const SERVICE = `
const fs = require("node:fs");
const [name, mode] = process.argv.slice(2);
const logOf = (n) => { try { return fs.readFileSync("../" + n + "/" + n + ".log", "utf8"); } catch { return ""; } };
const log = (line) => fs.appendFileSync(name + ".log", line + "\\n");
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log(sig);
    if (mode !== "ignore") setTimeout(() => process.exit(0), 50);
  });
}
log("ready");
if (mode === "crash") {
  const timer = setInterval(() => {
    if (logOf("web").includes("ready") && logOf("site").includes("ready")) process.exit(7);
  }, 25);
  timer.unref();
}
setInterval(() => {}, 1000);
`;

type Modes = { web?: string; site?: string; worker?: string };

/** A throwaway checkout holding a COPY of dev.sh and three fake apps whose `dev` scripts are the fake service. */
function fixture(modes: Modes = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "dev-sh-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "scripts"));
  copyFileSync(SCRIPT, path.join(dir, "scripts/dev.sh"));
  for (const app of ["web", "site", "worker"] as const) {
    const appDir = path.join(dir, "apps", app);
    mkdirSync(appDir, { recursive: true });
    writeFileSync(path.join(appDir, "svc.cjs"), SERVICE);
    const mode = modes[app] ?? "normal";
    writeFileSync(
      path.join(appDir, "package.json"),
      JSON.stringify({
        name: app,
        scripts: { dev: `node svc.cjs ${app} ${mode} --port 3000` },
      })
    );
  }
  return dir;
}

const until = (check: () => boolean) =>
  expect.poll(check, { interval: 50, timeout: 10_000 }).toBe(true);

const logOf = (dir: string, app: string) => {
  const file = path.join(dir, "apps", app, `${app}.log`);
  return existsSync(file) ? readFileSync(file, "utf-8").trim().split("\n") : [];
};

/**
 * Start dev.sh in its own process group, like a foreground job in a terminal (and under
 * `just`). Every run is stopped in `afterEach`.
 */
function start(dir: string, env: Record<string, string> = {}): Run {
  const child = spawn("bash", [path.join(dir, "scripts/dev.sh")], {
    detached: true,
    env: { PATH: process.env.PATH ?? "", HOME: dir, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => {
      resolve(code);
    });
  });
  const pid = child.pid ?? 0;
  const run: Run = {
    pid,
    exited,
    ctrlC: () => process.kill(-pid, "SIGINT"),
    kill: (signal) => child.kill(signal),
    stdout: () => stdout,
    stderr: () => stderr,
  };
  runs.push(run);
  return run;
}

const allReady = (dir: string) => () =>
  ["web", "site", "worker"].every((app) => logOf(dir, app).includes("ready"));

describe("dev.sh", () => {
  it("on a terminal Ctrl+C (SIGINT to the whole group) each service gets one signal, and it exits 0", async () => {
    const dir = fixture();
    const run = start(dir);
    await until(allReady(dir));
    run.ctrlC();
    expect(await run.exited).toBe(0);
    for (const app of ["web", "site", "worker"]) {
      expect(logOf(dir, app)).toEqual(["ready", "SIGINT"]);
    }
  });

  it("forwards TERM once and exits 0", async () => {
    const dir = fixture();
    const run = start(dir);
    await until(allReady(dir));
    run.kill("SIGTERM");
    expect(await run.exited).toBe(0);
    expect(logOf(dir, "worker")).toEqual(["ready", "SIGTERM"]);
  });

  it("stops the others with TERM and propagates the code when a service exits on its own", async () => {
    const dir = fixture({ worker: "crash" });
    const run = start(dir);
    expect(await run.exited).toBe(7);
    expect(logOf(dir, "web")).toEqual(["ready", "SIGTERM"]);
    expect(logOf(dir, "site")).toEqual(["ready", "SIGTERM"]);
    expect(run.stderr()).toContain("exited with code 7");
  });

  it("force-kills a service that ignores the signal after the grace period", async () => {
    const dir = fixture({ web: "ignore" });
    const run = start(dir, { WD_DEV_GRACE_SECONDS: "1" });
    await until(allReady(dir));
    const signalled = Date.now();
    run.ctrlC();
    expect(await run.exited).toBe(0);
    expect(Date.now() - signalled).toBeGreaterThanOrEqual(900);
    expect(logOf(dir, "web")).toEqual(["ready", "SIGINT"]);
    expect(run.stderr()).toContain("killing");
  });

  it("shuts down, rather than hanging, when Ctrl+C arrives while services are still starting", async () => {
    const dir = fixture();
    const run = start(dir);
    await until(() => run.stdout().includes("Starting web"));
    run.ctrlC();
    expect(await run.exited).toBe(0);
  });

  it("starts nothing when a later app has no dev script", async () => {
    const dir = fixture();
    writeFileSync(
      path.join(dir, "apps/worker/package.json"),
      JSON.stringify({ name: "worker", scripts: {} })
    );
    const run = start(dir);
    expect(await run.exited).toBe(2);
    expect(run.stderr()).toContain(
      "apps/worker/package.json has no dev script"
    );
    expect(existsSync(path.join(dir, "apps/web/web.log"))).toBe(false);
    expect(existsSync(path.join(dir, "apps/site/site.log"))).toBe(false);
  });

  it.each([
    ["WD_DEV_GRACE_SECONDS", "ten"],
    ["WD_DEV_GRACE_SECONDS", "1.5"],
    ["WD_DEV_GRACE_SECONDS", "-1"],
    ["WD_WEB_PORT", "0"],
    ["WD_WEB_PORT", "65536"],
    ["WD_WEB_PORT", "30a0"],
    ["WD_SITE_PORT", "3001/x"],
  ])("refuses %s=%j before starting anything", async (name, value) => {
    const dir = fixture();
    const run = start(dir, { [name]: value });
    expect(await run.exited).toBe(2);
    expect(run.stderr()).toContain(name);
    expect(existsSync(path.join(dir, "apps/web/web.log"))).toBe(false);
  });
});
