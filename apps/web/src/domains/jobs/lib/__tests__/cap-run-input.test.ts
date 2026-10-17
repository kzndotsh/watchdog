import { describe, expect, it } from "vitest";

import { capRunPrefillFromJob, formatCapIo } from "../cap-run-input";

describe("formatCapIo", () => {
  it("labels consume and produce kinds for cap hover cards", () => {
    expect(
      formatCapIo([
        { kind: "ip" },
        { kind: "identifier", type: "email" },
        { kind: "evidence", evidenceKind: "file" },
      ])
    ).toBe("IP, Email, File");
  });
});

describe("capRunPrefillFromJob", () => {
  const form = { properties: { url: { type: "string" } } };

  it("takes the Cap, the primary field value and the Entity from the Job", () => {
    expect(
      capRunPrefillFromJob(
        {
          capabilityId: "network.url.enrich",
          input: {
            url: "https://mailhost.test/",
            entityId: "00000000-0000-4000-8000-000000000020",
          },
        },
        form
      )
    ).toEqual({
      capabilityId: "network.url.enrich",
      runInput: "https://mailhost.test/",
      entityId: "00000000-0000-4000-8000-000000000020",
    });
  });

  it("leaves a field the Job does not have empty", () => {
    expect(
      capRunPrefillFromJob(
        { capabilityId: "network.dns.lookup", input: {} },
        undefined
      )
    ).toEqual({
      capabilityId: "network.dns.lookup",
      runInput: "",
      entityId: "",
    });
  });
});
