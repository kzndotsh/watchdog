import { spawnSync } from "node:child_process";
import {
  chmodSync,
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

const SCRIPT = path.resolve(import.meta.dirname, "../ensure-readonly-role.sh");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

/** Runs a COPY of the script (no repo .env to override the URL) with a stub `psql` on PATH. */
function run(databaseUrl: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "readonly-role-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "scripts"));
  copyFileSync(SCRIPT, path.join(dir, "scripts/ensure-readonly-role.sh"));
  mkdirSync(path.join(dir, "bin"));
  const calls = path.join(dir, "psql-calls.txt");
  writeFileSync(
    path.join(dir, "bin/psql"),
    `#!/bin/sh\necho "$1" >> "${calls}"\ncat > /dev/null\n`
  );
  chmodSync(path.join(dir, "bin/psql"), 0o755);
  const res = spawnSync(
    "bash",
    [path.join(dir, "scripts/ensure-readonly-role.sh"), "watchdog"],
    {
      encoding: "utf-8",
      env: {
        HOME: dir,
        PATH: `${path.join(dir, "bin")}:${process.env.PATH ?? ""}`,
        DATABASE_URL_MIGRATE: databaseUrl,
      },
    }
  );
  return {
    code: res.status,
    output: `${res.stdout}${res.stderr}`,
    psqlCalls: existsSync(calls) ? readFileSync(calls, "utf-8") : "",
  };
}

describe("ensure-readonly-role.sh local-only guard", () => {
  it.each([
    "postgresql://postgres:postgres@127.0.0.1:5432/watchdog",
    "postgresql://postgres:postgres@localhost:5432/watchdog",
    "postgresql://postgres:postgres@[::1]:5432/watchdog",
    "postgresql://postgres@127.0.0.1/watchdog",
  ])("connects when the host is loopback: %s", (url) => {
    const res = run(url);
    expect(res.code).toBe(0);
    expect(res.psqlCalls).toContain("watchdog");
  });

  it.each([
    "postgresql://postgres:secret@db.example.com:5432/watchdog",
    "postgresql://postgres:secret@10.0.0.5:5432/watchdog",
    "postgresql://127.0.0.1@evil.example.com/watchdog",
    "postgresql://localhost:pw@evil.example.com:5432/watchdog",
    "postgresql://postgres:secret@evil.example.com:5432/watchdog?host=127.0.0.1",
  ])("fails before connecting when the host is not loopback: %s", (url) => {
    const res = run(url);
    expect(res.code).not.toBe(0);
    expect(res.output).toContain("LOCAL-ONLY");
    expect(res.psqlCalls).toBe("");
  });
});
