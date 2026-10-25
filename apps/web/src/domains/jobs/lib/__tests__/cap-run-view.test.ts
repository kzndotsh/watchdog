import { describe, it, expect } from "vitest";

import { testCapProvider } from "@/testing/records";
import { EGRESS_CLASSES } from "@watchdog/schemas/shared";
import { testId } from "@watchdog/test-kit";

import type { CapListItem } from "../../types.ts";
import { buildCapRunView } from "../cap-run-view.ts";

describe("cap-run-view", () => {
  const shodan: CapListItem = {
    id: "network.shodan.lookup",
    version: "1",
    provider: testCapProvider,
    title: "Shodan lookup",
    egress: ["account_lookup"],
    contacts: [{ kind: "provider", host: "api.shodan.io", access: "keyed" }],
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
      allowedEgress: [
        "local",
        "target",
        "public_lookup",
        "account_lookup",
        "model",
      ],
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
      allowedEgress: [
        "local",
        "target",
        "public_lookup",
        "account_lookup",
        "model",
      ],
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
      allowedEgress: [
        "local",
        "target",
        "public_lookup",
        "account_lookup",
        "model",
      ],
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
      allowedEgress: EGRESS_CLASSES,
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    };
    expect(
      buildCapRunView({ ...base, entityId: "" }).shouldShowEvidenceOnlyHint
    ).toBe(true);
    expect(
      buildCapRunView({ ...base, entityId: "   " }).shouldShowEvidenceOnlyHint
    ).toBe(true);
    expect(
      buildCapRunView({ ...base, entityId: testId(20) })
        .shouldShowEvidenceOnlyHint
    ).toBe(false);
  });

  it("blocks Run on a Case that does not allow the Cap's egress, naming where it would go", () => {
    const view = buildCapRunView({
      caps: [shodan],
      capabilityId: shodan.id,
      runInput: "9.9.9.9",
      entityId: "",
      allowedEgress: ["local", "target"],
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.canRun).toBe(false);
    expect(view.egressBlock).toEqual({
      classes: ["account_lookup"],
      destinations: ["api.shodan.io"],
    });
    expect(view.blockedReason).toMatch(/does not allow Account lookups/);
  });

  it("lets the same Cap run once the Case allows its class, and always runs a local Cap", () => {
    const allowed = buildCapRunView({
      caps: [shodan],
      capabilityId: shodan.id,
      runInput: "9.9.9.9",
      entityId: "",
      allowedEgress: ["local", "account_lookup"],
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(allowed.egressBlock).toBeUndefined();
    expect(allowed.canRun).toBe(true);

    const local: CapListItem = {
      ...shodan,
      egress: ["local"],
      contacts: [],
      credentials: [],
    };
    const view = buildCapRunView({
      caps: [local],
      capabilityId: local.id,
      runInput: "x",
      entityId: "",
      allowedEgress: ["local"],
      configuredCredentials: new Set(),
    });
    expect(view.egressBlock).toBeUndefined();
    expect(view.canRun).toBe(true);
  });

  it("buildCapRunView blocks Run on a breach Cap while the setting is off, whatever the vault holds", () => {
    const breach: CapListItem = {
      ...shodan,
      id: "breach.hibp.lookup",
      credentials: [{ name: "HIBP_API_KEY" }],
      disabledReason: "breach_disabled",
    };
    const view = buildCapRunView({
      caps: [breach],
      capabilityId: breach.id,
      runInput: "a@example.com",
      entityId: "",
      allowedEgress: [
        "local",
        "target",
        "public_lookup",
        "account_lookup",
        "model",
      ],
      configuredCredentials: new Set(["HIBP_API_KEY"]),
    });
    expect(view.canRun).toBe(false);
    expect(view.blockedReason).toMatch(/breach Caps are off/);
    expect(view.blockedReason).toMatch(/WD_BREACH_CAPS/);
  });
});
