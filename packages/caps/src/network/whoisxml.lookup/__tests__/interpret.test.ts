import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  expectNoConfidenceOnPatch,
  itRejectsIncompleteReport,
} from "../../../testing";
import { whoisXmlLookup } from "../cap.ts";
import { interpretWhoisXmlReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    source: "whoisxml" as const,
    registrar: "Example Registrar",
    registrantOrg: null,
    nameservers: ["a.iana-servers.net"],
    status: ["active"],
    registeredAt: "2017-08-14T00:00:00.000Z",
    expiresAt: "2030-08-14T00:00:00.000Z",
    raw: {},
  };

  it("interpretWhoisXmlReport proposes Claim when entityId set", () => {
    const result = interpretWhoisXmlReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(result.patch.filter((p) => p.resource === "identifier").length).toBe(
      0
    );
    expect(result.patch.filter((p) => p.resource === "claim").length).toBe(1);
    expectNoConfidenceOnPatch(result);
    expect(String(result.summary)).toMatch(/WhoisXML for example\.com/);
  });

  it("interpretWhoisXmlReport empty patch without entityId", () => {
    const result = interpretWhoisXmlReport(fixture, {
      input: { host: "example.com" },
    });
    expect(result.patch).toEqual([]);
    expect(String(result.summary)).toMatch(/no Entity/i);
  });

  itRejectsIncompleteReport(
    whoisXmlLookup,
    { host: "example.com", source: "whoisxml" },
    { host: "example.com" }
  );
});
