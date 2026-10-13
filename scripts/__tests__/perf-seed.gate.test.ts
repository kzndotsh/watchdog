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

const SCRIPTS = path.resolve(import.meta.dirname, "..");
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});

/**
 * Runs a COPY of a script with stub `psql` and `pnpm` on PATH (no repo .env, no database). The
 * stubs append their arguments and stdin to `calls.txt`, so a test sees what would have run.
 */
function run(
  script: "perf-seed.sh" | "ensure-pg-stat-statements.sh",
  args: string[],
  databaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/watchdog"
) {
  const dir = mkdtempSync(path.join(tmpdir(), "perf-seed-"));
  dirs.push(dir);
  mkdirSync(path.join(dir, "scripts/perf-seed"), { recursive: true });
  copyFileSync(path.join(SCRIPTS, script), path.join(dir, `scripts/${script}`));
  writeFileSync(path.join(dir, "scripts/perf-seed/seed.sql"), "select 1;\n");
  mkdirSync(path.join(dir, "bin"));
  const calls = path.join(dir, "calls.txt");
  for (const tool of ["psql", "pnpm"]) {
    writeFileSync(
      path.join(dir, `bin/${tool}`),
      `#!/bin/sh\necho "${tool} $*" >> "${calls}"\nif [ ! -t 0 ]; then cat >> "${calls}"; fi\n`
    );
    chmodSync(path.join(dir, `bin/${tool}`), 0o755);
  }
  const res = spawnSync(
    "bash",
    [path.join(dir, `scripts/${script}`), ...args],
    {
      cwd: dir,
      encoding: "utf-8",
      input: "",
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
    calls: existsSync(calls) ? readFileSync(calls, "utf-8") : "",
  };
}

describe("perf-seed.sh database name guard", () => {
  it.each([
    "watchdog",
    "watchdog_test",
    "watchdog_e2e",
    "watchdog_e2e_s6",
    "watchdog_s6",
    "postgres",
    "template1",
  ])("refuses the protected database %s for up and down", (name) => {
    for (const command of ["up", "down"]) {
      const res = run("perf-seed.sh", [command, name]);
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("refusing");
      expect(res.calls).toBe("");
    }
  });

  it.each([
    "wd_perf_x;drop",
    'wd_perf_x"',
    "wd_perf_x?host=evil.example",
    "wd_perf_x/other",
    "wd_perf_x@evil",
    "wd_perf_x#frag",
    "wd_perf_x%20y",
    "wd_perf_x y",
    "WD_PERF_X",
    "other_db",
    "wd_perf_",
  ])("rejects the name %j before running anything", (name) => {
    const res = run("perf-seed.sh", ["up", name]);
    expect(res.code).not.toBe(0);
    expect(res.output).toContain("must match");
    expect(res.calls).toBe("");
  });

  it("refuses a non-loopback host", () => {
    const res = run(
      "perf-seed.sh",
      ["up", "wd_perf_x"],
      "postgresql://postgres:pw@127.0.0.1@evil.example.com:5432/watchdog"
    );
    expect(res.code).not.toBe(0);
    expect(res.output).toContain("not loopback");
    expect(res.calls).toBe("");
  });
});

describe("perf-seed.sh commands", () => {
  it("passes the database name as a quoted psql identifier, never inline", () => {
    const up = run("perf-seed.sh", ["up", "wd_perf_x"]);
    expect(up.code).toBe(0);
    expect(up.calls).toContain('CREATE DATABASE :"db"');
    expect(up.calls).toContain('GRANT CONNECT, CREATE ON DATABASE :"db"');
    expect(up.calls).not.toMatch(/(CREATE|DROP) DATABASE "?wd_perf_x/);
    const down = run("perf-seed.sh", ["down", "wd_perf_x"]);
    expect(down.code).toBe(0);
    expect(down.calls).toContain('DROP DATABASE IF EXISTS :"db" WITH (FORCE)');
  });

  it("prints a watchdog_app URL on the validated host, not the migrate credentials", () => {
    const res = run(
      "perf-seed.sh",
      ["up", "wd_perf_x"],
      "postgresql://admin:s3cret@[::1]:5433/watchdog"
    );
    expect(res.code).toBe(0);
    expect(res.output).toContain(
      "postgresql://watchdog_app:watchdog@[::1]:5433/wd_perf_x"
    );
    expect(res.output).not.toContain("s3cret");
  });
});

describe("ensure-pg-stat-statements.sh", () => {
  it.each([
    "postgresql://postgres:postgres@127.0.0.1:5432/watchdog",
    "postgresql://postgres@localhost/watchdog",
    "postgresql://postgres:postgres@[::1]:5432/watchdog",
    "postgresql://127.0.0.1/watchdog",
    "postgresql://localhost",
  ])("accepts the loopback URL %s", (url) => {
    const res = run("ensure-pg-stat-statements.sh", ["watchdog"], url);
    expect(res.code).toBe(0);
    expect(res.output).not.toContain("not loopback");
  });

  it.each([
    "postgresql://postgres:pw@db.example.com/watchdog",
    "postgresql://127.0.0.1@evil.example.com/watchdog",
    "postgresql://postgres:pw@evil.example.com/watchdog?host=127.0.0.1",
  ])("refuses the non-loopback URL %s", (url) => {
    const res = run("ensure-pg-stat-statements.sh", ["watchdog"], url);
    expect(res.code).not.toBe(0);
    expect(res.output).toContain("not loopback");
    expect(res.calls).toBe("");
  });

  it.each([
    "watchdog?host=other.example",
    "watchdog/x",
    "watchdog@evil",
    "watchdog#x",
    "watchdog%20x",
    "watchdog x",
    'watchdog"',
  ])("rejects the database argument %j", (name) => {
    const res = run("ensure-pg-stat-statements.sh", [name]);
    expect(res.code).not.toBe(0);
    expect(res.output).toContain("database name");
    expect(res.calls).toBe("");
  });
});
