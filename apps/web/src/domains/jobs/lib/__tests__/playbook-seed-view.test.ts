import { describe, it, expect } from "vitest";

import type { PlaybookListItem } from "../../types.ts";
import { buildPlaybookSeedView } from "../playbook-seed-view.ts";

describe("playbook-seed-view", () => {
  const footprint: PlaybookListItem = {
    id: "host-footprint",
    title: "Host footprint",
    description: "DNS + Shodan",
    seedKinds: ["host"],
    steps: ["network.dns.lookup", "network.shodan.lookup"],
    stepDependencies: [[]],
    requires: {
      credentials: [{ name: "SHODAN_API_KEY" }],
      egress: ["target", "account_lookup"],
      contacts: [
        { kind: "target", via: "dns" },
        { kind: "provider", host: "api.shodan.io", access: "keyed" },
      ],
      flags: ["needs_key"],
    },
  };

  it("blocks Run on a Case that does not allow the Playbook's egress, naming where it would go", () => {
    const view = buildPlaybookSeedView({
      playbooks: [footprint],
      playbookId: footprint.id,
      host: "example.com",
      url: "",
      evidenceId: "",
      ip: "",
      email: "",
      hash: "",
      handle: "",
      urlDumpCount: 0,
      allowedEgress: ["local", "target"],
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.canRun).toBe(false);
    expect(view.egressBlock).toEqual({
      classes: ["account_lookup"],
      destinations: ["api.shodan.io"],
    });
    expect(view.egressLabel).toBe("Account lookups — enable on Case");
    expect(view.blockedReason).toMatch(/does not allow Account lookups/);
  });

  it("buildPlaybookSeedView blocks Run when required vault slot is empty", () => {
    const view = buildPlaybookSeedView({
      playbooks: [footprint],
      playbookId: footprint.id,
      host: "example.com",
      url: "",
      evidenceId: "",
      ip: "",
      email: "",
      hash: "",
      handle: "",
      urlDumpCount: 0,
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

  it("buildPlaybookSeedView allows Run when the slot is configured", () => {
    const view = buildPlaybookSeedView({
      playbooks: [footprint],
      playbookId: footprint.id,
      host: "example.com",
      url: "",
      evidenceId: "",
      ip: "",
      email: "",
      hash: "",
      handle: "",
      urlDumpCount: 0,
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

  it("does not treat an empty playbook id as the first playbook", () => {
    const view = buildPlaybookSeedView({
      playbooks: [footprint],
      playbookId: "",
      host: "example.com",
      url: "",
      evidenceId: "",
      ip: "",
      email: "",
      hash: "",
      handle: "",
      urlDumpCount: 0,
      allowedEgress: [
        "local",
        "target",
        "public_lookup",
        "account_lookup",
        "model",
      ],
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.selected).toBeUndefined();
    expect(view.canRun).toBe(false);
    expect(view.blockedReason).toBe("No playbooks available");
  });

  it("matches a padded playbook id", () => {
    const view = buildPlaybookSeedView({
      playbooks: [footprint],
      playbookId: `  ${footprint.id}  `,
      host: "example.com",
      url: "",
      evidenceId: "",
      ip: "",
      email: "",
      hash: "",
      handle: "",
      urlDumpCount: 0,
      allowedEgress: [
        "local",
        "target",
        "public_lookup",
        "account_lookup",
        "model",
      ],
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.selected?.id).toBe(footprint.id);
    expect(view.canRun).toBe(true);
  });

  it("buildPlaybookSeedView blocks Run on a Playbook with a breach step while the setting is off", () => {
    const breach: PlaybookListItem = {
      id: "email-breach",
      title: "Email breach metadata",
      description: "HIBP then Hudson Rock",
      seedKinds: ["email"],
      steps: ["breach.hibp.lookup", "breach.hudsonrock.lookup"],
      stepDependencies: [[]],
      requires: {
        credentials: [],
        egress: ["local"],
        contacts: [],
        flags: ["breach"],
      },
      disabledReason: "breach_disabled",
    };
    const view = buildPlaybookSeedView({
      playbooks: [breach],
      playbookId: breach.id,
      host: "",
      url: "",
      evidenceId: "",
      ip: "",
      email: "a@example.com",
      hash: "",
      handle: "",
      urlDumpCount: 0,
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
    expect(view.blockedReason).toMatch(/WD_BREACH_CAPS/);
  });
});
