import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { CAPABILITIES } from "../../registry";
import { isBreachCap } from "../../sdk";
import { createCapRunHarness, runCap } from "../../testing";
import { dehashedLookup } from "../dehashed.lookup/cap";
import { dehashedLookupInput } from "../dehashed.lookup/input";
import { breachRedactorIds, redactBreachArtifact } from "../export-redaction";
import { snusbaseLookup } from "../snusbase.lookup/cap";
import { snusbaseLookupInput } from "../snusbase.lookup/input";

const PASSWORD = "hunter2";
const SHA1 = "5baa61e4c9b93f3f0682250b6cf8331b7ee68fd8";

function allArtifactText(
  artifacts: { name: string; bytes: Uint8Array }[]
): string[] {
  return artifacts.map((artifact) => new TextDecoder().decode(artifact.bytes));
}

describe("breach Cap credential modes", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  function serveDehashed() {
    mockServer.use(
      http.post("https://api.dehashed.com/v2/search", () =>
        HttpResponse.json({
          entries: [
            {
              database_name: "ExampleDump",
              email: "alice@example.com",
              password: PASSWORD,
              hashed_password: SHA1,
            },
            {
              database_name: "OtherDump",
              email: "alice@example.com",
              password: PASSWORD,
            },
          ],
          total: 2,
          balance: 5,
        })
      )
    );
  }

  function serveSnusbase() {
    mockServer.use(
      http.post("https://api.snusbase.com/data/search", () =>
        HttpResponse.json({
          size: 2,
          results: {
            ExampleTable: [
              { email: "alice@example.com", password: PASSWORD, hash: SHA1 },
              { email: "alice@example.com", password: PASSWORD },
            ],
          },
        })
      )
    );
  }

  const cases = [
    {
      name: "DeHashed",
      cap: dehashedLookup,
      input: dehashedLookupInput.parse({ query: "alice@example.com" }),
      secret: { DEHASHED_API_KEY: "test-key" },
      serve: serveDehashed,
    },
    {
      name: "Snusbase",
      cap: snusbaseLookup,
      input: snusbaseLookupInput.parse({ query: "alice@example.com" }),
      secret: { SNUSBASE_API_KEY: "test-key" },
      serve: serveSnusbase,
    },
  ] as const;

  it.each(cases)(
    "$name in safe mode uploads no password and no hash, in any artifact",
    async ({ cap, input, secret, serve }) => {
      serve();
      const harness = createCapRunHarness({
        secrets: secret,
        input,
        breachCredentialMode: "safe",
      });
      await runCap(cap.run(harness.ctx));
      expect(harness.artifacts.length).toBeGreaterThanOrEqual(2);
      for (const text of allArtifactText(harness.artifacts)) {
        expect(text).not.toContain(PASSWORD);
        expect(text).not.toContain(SHA1);
        expect(text).toContain("alice@example.com");
        expect(text).toContain('"kind": "plaintext"');
        expect(text).toContain('"kind": "sha1"');
        expect(text).toContain('"length": 40');
      }
    }
  );

  it.each(cases)(
    "$name in full mode stores the values as before",
    async ({ cap, input, secret, serve }) => {
      serve();
      const harness = createCapRunHarness({
        secrets: secret,
        input,
        breachCredentialMode: "full",
      });
      await runCap(cap.run(harness.ctx));
      for (const text of allArtifactText(harness.artifacts)) {
        expect(text).toContain(PASSWORD);
        expect(text).toContain(SHA1);
      }
    }
  );

  it.each(cases)(
    "$name derives its fingerprints from the context's function only",
    async ({ cap, input, secret, serve }) => {
      serve();
      const seen: string[] = [];
      const harness = createCapRunHarness({
        secrets: secret,
        input,
        breachCredentialMode: "safe",
        credentialFingerprint: (value, role) => {
          seen.push(`${role}:${value}`);
          return "c".repeat(64);
        },
      });
      await runCap(cap.run(harness.ctx));
      expect(seen).toContain(`plaintext:${PASSWORD}`);
      expect(seen).toContain(`hash:${SHA1}`);
      const report = harness.artifacts.find(
        (artifact) => artifact.name === REPORT_JSON_ARTIFACT
      );
      expect(new TextDecoder().decode(report?.bytes)).toContain("c".repeat(64));
    }
  );
});

describe("export redaction table", () => {
  it("has a redactor for every breach Cap and for nothing else", () => {
    const breach = CAPABILITIES.filter((cap) => isBreachCap(cap)).map(
      (cap) => cap.id
    );
    expect([...breachRedactorIds()].sort()).toEqual([...breach].sort());
  });

  it("refuses an unknown Cap id and an artifact that does not match its schema", () => {
    const fp = () => "d".repeat(64);
    expect(redactBreachArtifact("breach.unknown.lookup", {}, fp)).toBeNull();
    expect(redactBreachArtifact("dns.lookup", {}, fp)).toBeNull();
    expect(
      redactBreachArtifact("breach.dehashed.lookup", { entries: "nope" }, fp)
    ).toBeNull();
  });
});
