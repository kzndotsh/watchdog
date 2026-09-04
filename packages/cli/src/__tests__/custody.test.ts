import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { refuseConfirmed, requireUserOverride } from "../custody";

vi.mock("../io", () => ({
  fail: vi.fn((code: string, message: string) => {
    throw new Error(`${code}: ${message}`);
  }),
}));

const here = import.meta.dirname;
const mainTs = path.join(here, "../main.ts");
const repoRoot = path.resolve(here, "../../../..");
const CASE_ID = "00000000-0000-4000-8000-000000000000";

function runWd(args: string[]): {
  status: number | null;
  stdout: string;
  stderr: string;
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
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertCustody(stdout: string): void {
  const line = stdout
    .trim()
    .split("\n")
    .find((row) => row.startsWith("{"));
  expect(line, `expected JSON line in: ${stdout}`).toBeTruthy();
  if (line === undefined) return;
  const body: unknown = JSON.parse(line);
  expect(isObject(body)).toBe(true);
  if (!isObject(body)) return;
  expect(isObject(body.error)).toBe(true);
  if (!isObject(body.error)) return;
  expect(body.error.code).toBe("CUSTODY");
}

describe("custody helpers", () => {
  it("requireUserOverride throws when override is disabled", () => {
    expect(() => {
      requireUserOverride(false);
    }).toThrow(/CUSTODY/);
  });

  it("refuseConfirmed throws for confirmed confidence", () => {
    expect(() => {
      refuseConfirmed("confirmed");
    }).toThrow(/CUSTODY/);
  });
});

describe("cli custody", () => {
  it(
    "requires --user-override on identifier, edge, event, and question creates",
    { timeout: 20_000 },
    () => {
      const commands: string[][] = [
        [
          "identifiers",
          "create",
          "-c",
          CASE_ID,
          "--entity",
          "ada",
          "--type",
          "email",
          "--value",
          "ada@mailhost.test",
          "--confidence",
          "unverified",
        ],
        [
          "edges",
          "create",
          "-c",
          CASE_ID,
          "--from",
          "ada",
          "--to",
          "host",
          "--predicate",
          "owns",
          "--confidence",
          "unverified",
        ],
        [
          "events",
          "create",
          "-c",
          CASE_ID,
          "--entity",
          "ada",
          "--when",
          "1815",
          "--what",
          "Born",
        ],
        [
          "questions",
          "create",
          "-c",
          CASE_ID,
          "--entity",
          "ada",
          "--text",
          "Where?",
        ],
      ];
      for (const args of commands) {
        const { status, stdout } = runWd(args);
        expect(status).toBe(1);
        assertCustody(stdout);
      }
    }
  );

  it("refuses confirmed on identifier and edge creates even with override", () => {
    const { stdout: idOut, status: idStatus } = runWd([
      "identifiers",
      "create",
      "-c",
      CASE_ID,
      "--entity",
      "ada",
      "--type",
      "email",
      "--value",
      "ada@mailhost.test",
      "--confidence",
      "confirmed",
      "--user-override",
    ]);
    expect(idStatus).toBe(1);
    assertCustody(idOut);

    const { stdout: edgeOut, status: edgeStatus } = runWd([
      "edges",
      "create",
      "-c",
      CASE_ID,
      "--from",
      "ada",
      "--to",
      "host",
      "--predicate",
      "owns",
      "--confidence",
      "confirmed",
      "--user-override",
    ]);
    expect(edgeStatus).toBe(1);
    assertCustody(edgeOut);
  });
});
