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

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

/** A fake service: records every signal it gets, and exits `exitAfter` ms after the first one. */
const SERVICE = `
const fs = require("node:fs");
const [name, mode] = process.argv.slice(2);
const log = (line) => fs.appendFileSync(name + ".log", line + "\\n");
log("ready");
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log(sig);
    if (mode !== "ignore") setTimeout(() => process.exit(0), 50);
  });
}
if (mode === "crash") setTimeout(() => process.exit(7), 400);
setInterval(() => {}, 1000);
`;

/** A throwaway checkout holding a COPY of dev.sh and three fake apps whose `dev` scripts are the fake service. */
function fixture(modes: { web?: string; site?: string; worker?: string }) {
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

/** Start dev.sh (its own process group, as under `just`); resolves with the exit code once it ends. */
function start(dir: string, env: Record<string, string> = {}) {
  const child = spawn("bash", [path.join(dir, "scripts/dev.sh")], {
    env: { PATH: process.env.PATH ?? "", HOME: dir, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code) => {
      resolve(code);
    });
  });
  return { child, exited, stderr: () => stderr };
}

const allReady = (dir: string) => () =>
  ["web", "site", "worker"].every((app) => logOf(dir, app).includes("ready"));

describe("dev.sh", () => {
  it("forwards Ctrl+C once to each service, then exits 0", async () => {
    const dir = fixture({});
    const run = start(dir);
    await until(allReady(dir));
    run.child.kill("SIGINT");
    expect(await run.exited).toBe(0);
    for (const app of ["web", "site", "worker"]) {
      expect(logOf(dir, app)).toEqual(["ready", "SIGINT"]);
    }
  });

  it("forwards TERM once and exits 0", async () => {
    const dir = fixture({});
    const run = start(dir);
    await until(allReady(dir));
    run.child.kill("SIGTERM");
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
    run.child.kill("SIGINT");
    expect(await run.exited).toBe(0);
    expect(Date.now() - signalled).toBeGreaterThanOrEqual(900);
    expect(logOf(dir, "web")).toEqual(["ready", "SIGINT"]);
    expect(run.stderr()).toContain("killing");
  });
});
