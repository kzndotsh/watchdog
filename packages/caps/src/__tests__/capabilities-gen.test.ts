import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { CAPABILITIES, listCapabilities } from "../registry.ts";
import { toCapMetadata } from "../sdk";
import { buildCapDescriptors } from "../write-capabilities-gen";

const root = path.join(import.meta.dirname, "../..");
const genPath = path.join(root, "capabilities.gen.json");

function assertJsonObject(
  value: unknown
): asserts value is Record<string, unknown> {
  expect(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "expected a JSON object"
  ).toBeTruthy();
}

describe("capabilities.gen.json", () => {
  it("matches live CapDescriptors and freshly crawled versions (run pnpm generate:caps if this fails)", () => {
    // `buildCapDescriptors` re-crawls every Cap's code, so a change to a module a Cap reaches
    // without a regenerated catalog fails here, locally, not only in CI.
    const fresh = buildCapDescriptors();
    const committed = JSON.parse(readFileSync(genPath, "utf-8")) as unknown;
    expect(
      committed,
      "capabilities.gen.json is stale — run: pnpm generate:caps"
    ).toEqual(fresh);
    expect(listCapabilities()).toEqual(fresh);
  });

  it("DNS inputForm has host; AI Process inputForm has evidenceId (no model)", () => {
    const dnsCapability = CAPABILITIES.find(
      (c) => c.id === "network.dns.lookup"
    );
    expect(dnsCapability).toBeDefined();
    if (dnsCapability === undefined) {
      throw new Error("missing network.dns.lookup");
    }
    const dns = toCapMetadata(dnsCapability);
    const dnsProps = dns.inputForm.properties;
    assertJsonObject(dnsProps);
    expect(Boolean(dnsProps.host)).toBeTruthy();
    expect(dnsProps.entityId).toBe(undefined);

    const aiCapability = CAPABILITIES.find(
      (c) => c.id === "evidence.extract.ai"
    );
    expect(aiCapability).toBeDefined();
    if (aiCapability === undefined) {
      throw new Error("missing evidence.extract.ai");
    }
    const ai = toCapMetadata(aiCapability);
    const aiProps = ai.inputForm.properties;
    assertJsonObject(aiProps);
    expect(Boolean(aiProps.evidenceId)).toBeTruthy();
    expect(aiProps.model).toBe(undefined);
    expect(aiProps.entityId).toBe(undefined);
  });
});
