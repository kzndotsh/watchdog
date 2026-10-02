import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { CAPABILITIES, listCapabilities } from "../registry.ts";
import { toCapDescriptor } from "../sdk";

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
  it("matches live CapDescriptors (run pnpm generate:caps if this fails)", () => {
    const live = listCapabilities();
    const committed = JSON.parse(readFileSync(genPath, "utf-8")) as unknown;
    expect(
      committed,
      "capabilities.gen.json is stale — run: pnpm generate:caps"
    ).toEqual(live);
  });

  it("DNS inputForm has host; AI Process inputForm has evidenceId (no model)", () => {
    const dnsCapability = CAPABILITIES.find(
      (c) => c.id === "network.dns.lookup"
    );
    expect(dnsCapability).toBeDefined();
    if (dnsCapability === undefined) {
      throw new Error("missing network.dns.lookup");
    }
    const dns = toCapDescriptor(dnsCapability);
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
    const ai = toCapDescriptor(aiCapability);
    const aiProps = ai.inputForm.properties;
    assertJsonObject(aiProps);
    expect(Boolean(aiProps.evidenceId)).toBeTruthy();
    expect(aiProps.model).toBe(undefined);
    expect(aiProps.entityId).toBe(undefined);
  });
});
