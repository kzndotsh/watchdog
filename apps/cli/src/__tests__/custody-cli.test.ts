import { describe, expect, it, vi } from "vitest";

import { firstJson, runWd } from "./run-wd";

// A developer `.env` above the checkout would otherwise be loaded into process.env.
vi.mock("dotenv", () => ({ config: vi.fn() }));

const CASE_ID = "00000000-0000-4000-8000-000000000000";
// Custody refuses before any request, so nothing here reaches the network.
const API = { WD_API_KEY: "test-key", WD_API_URL: "http://127.0.0.1:9/api/v1" };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertCustody(stdout: string): void {
  const body = firstJson(stdout);
  expect(isObject(body)).toBe(true);
  if (!isObject(body)) return;
  expect(isObject(body.error)).toBe(true);
  if (!isObject(body.error)) return;
  expect(body.error.code).toBe("CUSTODY");
}

describe("cli custody", () => {
  it.each([
    [
      "identifiers",
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
    ],
    [
      "edges",
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
    ],
    [
      "events",
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
    ],
    [
      "questions",
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
    ],
  ])("requires --user-override on %s creates", async (_noun, args) => {
    const { status, stdout } = await runWd(args, API);
    expect(status).toBe(1);
    assertCustody(stdout);
  });

  it.each([
    [
      "identifier",
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
        "confirmed",
        "--user-override",
      ],
    ],
    [
      "edge",
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
        "confirmed",
        "--user-override",
      ],
    ],
  ])(
    "refuses confirmed on %s creates even with override",
    async (_noun, args) => {
      const { status, stdout } = await runWd(args, API);
      expect(status).toBe(1);
      assertCustody(stdout);
    }
  );
});
