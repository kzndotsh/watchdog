import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import type { CapListItem } from "../../types.ts";
import { buildCapRunView } from "../cap-run-view.ts";

describe("cap-run-view", () => {
  const shodan: CapListItem = {
    id: "network.shodan.lookup",
    version: "1",
    title: "Shodan lookup",
    egress: "none",
    credentials: [{ name: "SHODAN_API_KEY" }],
    input: {},
    inputForm: {
      type: "object",
      properties: { host: { type: "string" } },
    },
  };

  it("buildCapRunView blocks Run when required vault slot is empty", () => {
    const view = buildCapRunView({
      caps: [shodan],
      capabilityId: shodan.id,
      runInput: "example.com",
      entityId: "",
      allowThirdPartyEgress: true,
      configuredCredentials: new Set(),
    });
    expect(view.canRun).toBe(false);
    expect(view.missingCredentials).toEqual(["SHODAN_API_KEY"]);
    expect(view.blockedReason ?? "").toMatch(/SHODAN_API_KEY/);
  });

  it("buildCapRunView allows Run when the slot is configured", () => {
    const view = buildCapRunView({
      caps: [shodan],
      capabilityId: shodan.id,
      runInput: "example.com",
      entityId: "",
      allowThirdPartyEgress: true,
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.canRun).toBe(true);
    expect(view.missingCredentials).toBe(undefined);
  });

  it("matches a padded capability id", () => {
    const view = buildCapRunView({
      caps: [shodan],
      capabilityId: `  ${shodan.id}  `,
      runInput: "example.com",
      entityId: "",
      allowThirdPartyEgress: true,
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.selected?.id).toBe(shodan.id);
    expect(view.canRun).toBe(true);
  });

  it("shows evidence-only hint when entity id is blank or whitespace", () => {
    const base = {
      caps: [shodan],
      capabilityId: shodan.id,
      runInput: "example.com",
      allowThirdPartyEgress: true,
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    };
    expect(
      buildCapRunView({ ...base, entityId: "" }).showEvidenceOnlyHint
    ).toBe(true);
    expect(
      buildCapRunView({ ...base, entityId: "   " }).showEvidenceOnlyHint
    ).toBe(true);
    expect(
      buildCapRunView({ ...base, entityId: testId(20) }).showEvidenceOnlyHint
    ).toBe(false);
  });
});
