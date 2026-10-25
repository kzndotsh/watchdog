import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { createCapRunHarness, runCap } from "../../../testing";
import { leakradarLookup } from "../cap.ts";
import { leakradarLookupInput } from "../input";

const DUMMY_PASSWORD = "hunter2-not-real";
const VAULT_KEY = "lr-vault-key-not-real";

describe("breach.leakradar.lookup run", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("reads the key from the vault, sends it as Bearer, and stores no credential", async () => {
    const seen: { path: string; auth: string | null; ua: string | null }[] = [];
    mockServer.use(
      http.post(
        /^https:\/\/api\.leakradar\.io\/search\/email/,
        ({ request }) => {
          seen.push({
            path: new URL(request.url).pathname,
            auth: request.headers.get("authorization"),
            ua: request.headers.get("user-agent"),
          });
          return HttpResponse.json({
            items: [
              {
                url: "https://login.example.com/path?token=abc",
                username: "alice@example.com",
                username_masked: "a***@example.com",
                password: DUMMY_PASSWORD,
                unlocked: false,
                is_email: true,
                added_at: "2026-03-04T10:00:00Z",
              },
            ],
            total: 1,
            total_unlocked: 0,
            page: 1,
            page_size: 25,
          });
        }
      )
    );
    const input = leakradarLookupInput.parse({ query: "alice@example.com" });
    const harness = createCapRunHarness({
      secrets: { LEAKRADAR_API_KEY: VAULT_KEY },
      input,
    });
    const result = await runCap(leakradarLookup.run(harness.ctx));

    expect(harness.credentialCalls).toEqual(["LEAKRADAR_API_KEY"]);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.path).toBe("/search/email");
    expect(seen[0]?.auth).toBe(`Bearer ${VAULT_KEY}`);
    expect(seen[0]?.ua).toContain("breach.leakradar.lookup");
    expect(result.artifacts.some((a) => a.name === REPORT_JSON_ARTIFACT)).toBe(
      true
    );
    expect(harness.artifacts.length).toBeGreaterThan(0);
    for (const artifact of harness.artifacts) {
      const text = new TextDecoder().decode(artifact.bytes);
      expect(text).not.toContain(DUMMY_PASSWORD);
      expect(text).not.toContain(VAULT_KEY);
      expect(text).not.toContain("token=abc");
    }
    const report = harness.artifacts.find(
      (a) => a.name === REPORT_JSON_ARTIFACT
    );
    expect(new TextDecoder().decode(report?.bytes)).toContain(
      "login.example.com"
    );
  });

  it("fails without a stored key", async () => {
    const harness = createCapRunHarness({
      secrets: {},
      input: leakradarLookupInput.parse({ query: "example.com" }),
    });
    await expect(runCap(leakradarLookup.run(harness.ctx))).rejects.toThrow();
    expect(harness.credentialCalls).toEqual(["LEAKRADAR_API_KEY"]);
  });
});
