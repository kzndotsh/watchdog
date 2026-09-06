import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, it, expect } from "vitest";

const here = import.meta.dirname;
const mainTs = path.join(here, "../main.ts");
const repoRoot = path.resolve(here, "../../../..");

function runWd(
  args: string[],
  extraEnv: Record<string, string | undefined> = {}
): { status: number | null; stdout: string; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, VITEST: undefined };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) {
      // Unset inherited keys (e.g. WD_API_KEY) for --help smoke.
      Reflect.deleteProperty(env, key);
    } else {
      env[key] = value;
    }
  }
  const result = spawnSync(
    path.join(repoRoot, "node_modules/.bin/tsx"),
    [mainTs, ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env,
    }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function firstJson(stdout: string): unknown {
  const line = stdout
    .trim()
    .split("\n")
    .find((l) => l.startsWith("{"));
  expect(line, `expected JSON line in: ${stdout}`).toBeTruthy();
  return JSON.parse(line);
}

function asObject(value: unknown): object {
  if (typeof value !== "object" || value === null) {
    expect.fail(`expected object, got ${String(value)}`);
  }
  return value;
}

function assertCliError(body: unknown, expectedCode: string): void {
  const record = asObject(body);
  expect("ok" in record).toBeTruthy();
  expect("error" in record).toBeTruthy();
  expect(Reflect.get(record, "ok")).toBe(false);
  const error = asObject(Reflect.get(record, "error"));
  expect("code" in error).toBeTruthy();
  expect(Reflect.get(error, "code")).toBe(expectedCode);
}

describe("wd smoke", () => {
  it("prints --help without WD_API_KEY", () => {
    const { status, stdout } = runWd(["--help"], { WD_API_KEY: undefined });
    expect(status).toBe(0);
    expect(stdout).toMatch(/COMMANDS/);
    expect(stdout).toMatch(/cases/);
  });

  it("lists evidence process and enrich on --help", () => {
    const { status, stdout } = runWd(["evidence", "--help"], {
      WD_API_KEY: undefined,
    });
    expect(status).toBe(0);
    expect(stdout).toMatch(/process/);
    expect(stdout).toMatch(/enrich/);
  });

  it("rejects unknown flags with structured exit 2", () => {
    const { status, stdout } = runWd(["cases", "list", "--bogus-flag"], {
      WD_API_KEY: "test-key",
      WD_API_URL: "http://127.0.0.1:9/api/v1",
    });
    expect(status).toBe(2);
    assertCliError(firstJson(stdout), "UNKNOWN_FLAG");
  });

  it("refuses confirmed child writes with custody envelope", () => {
    const { status, stdout } = runWd(
      [
        "claims",
        "create",
        "-c",
        "00000000-0000-0000-0000-000000000000",
        "--entity",
        "x",
        "--text",
        "t",
        "--confidence",
        "confirmed",
        "--user-override",
      ],
      {
        WD_API_KEY: "test-key",
        WD_API_URL: "http://127.0.0.1:9/api/v1",
      }
    );
    expect(status).toBe(1);
    assertCliError(firstJson(stdout), "CUSTODY");
  });

  it("emitList empty shape is definitive", async () => {
    const { emitList } = await import("../io");
    const lines: string[] = [];
    const original = console.log;
    console.log = (msg?: unknown) => {
      lines.push(String(msg));
    };
    try {
      emitList({ items: [], help: ["wd cases list"] });
    } finally {
      console.log = original;
    }
    const firstLine = lines[0];
    expect(firstLine !== undefined).toBeTruthy();
    const record = asObject(JSON.parse(firstLine));
    expect("count" in record).toBeTruthy();
    expect("items" in record).toBeTruthy();
    expect(Reflect.get(record, "count")).toBe(0);
    expect(Reflect.get(record, "items")).toEqual([]);
  });
});
