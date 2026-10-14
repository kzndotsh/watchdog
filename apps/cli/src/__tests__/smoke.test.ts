import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, it, expect, vi } from "vitest";

import { firstJson, runWd } from "./run-wd";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const here = import.meta.dirname;
const mainTs = path.join(here, "../main.ts");
const repoRoot = path.resolve(here, "../../../..");

/** The one real process: the tsx entry point, to prove exit codes survive `process.exit`. */
function spawnWd(args: string[]): {
  status: number | null;
  stdout: string;
} {
  const result = spawnSync(
    path.join(repoRoot, "node_modules/.bin/tsx"),
    [mainTs, ...args],
    {
      cwd: repoRoot,
      encoding: "utf-8",
      env: {
        ...process.env,
        VITEST: undefined,
        WD_API_KEY: "test-key",
        WD_API_URL: "http://127.0.0.1:9/api/v1",
      },
    }
  );
  return { status: result.status, stdout: result.stdout ?? "" };
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

const API = {
  WD_API_KEY: "test-key",
  WD_API_URL: "http://127.0.0.1:9/api/v1",
};

describe("wd smoke", () => {
  it("prints --help without WD_API_KEY", async () => {
    const { status, stdout } = await runWd(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/COMMANDS/);
    expect(stdout).toMatch(/cases/);
  });

  it("lists evidence process and enrich on --help", async () => {
    const { status, stdout } = await runWd(["evidence", "--help"]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/process/);
    expect(stdout).toMatch(/enrich/);
  });

  it("rejects unknown flags with structured exit 2", async () => {
    const { status, stdout } = await runWd(
      ["cases", "list", "--bogus-flag"],
      API
    );
    expect(status).toBe(2);
    assertCliError(firstJson(stdout), "UNKNOWN_FLAG");
  });

  it("exits 2 with the structured error from the real entry point", () => {
    const { status, stdout } = spawnWd(["cases", "list", "--bogus-flag"]);
    expect(status).toBe(2);
    assertCliError(firstJson(stdout), "UNKNOWN_FLAG");
  }, 30_000);

  it("accepts glued short case flag values", async () => {
    // The network boundary: the request fails, but it must be sent, so the glued
    // case value parsed and the command ran.
    const fetchStub = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchStub);
    const { stdout } = await runWd(
      ["entities", "list", "-c00000000-0000-4000-8000-000000000001"],
      API
    );
    expect(fetchStub).toHaveBeenCalled();
    const error = asObject(
      Reflect.get(asObject(firstJson(stdout)), "error") ?? {}
    );
    expect(Reflect.get(error, "code")).not.toBe("UNKNOWN_FLAG");
    expect(Reflect.get(error, "code")).not.toBe("USAGE");
  });

  it("refuses confirmed child writes with custody envelope", async () => {
    const { status, stdout } = await runWd(
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
      API
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
