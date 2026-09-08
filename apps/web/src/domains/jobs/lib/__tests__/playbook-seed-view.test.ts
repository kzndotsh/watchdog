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
    requires: {
      credentials: [{ name: "SHODAN_API_KEY" }],
      egress: "none",
      flags: ["needs_key"],
    },
  };

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
      allowThirdPartyEgress: true,
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
      allowThirdPartyEgress: true,
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
      allowThirdPartyEgress: true,
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
      allowThirdPartyEgress: true,
      configuredCredentials: new Set(["SHODAN_API_KEY"]),
    });
    expect(view.selected?.id).toBe(footprint.id);
    expect(view.canRun).toBe(true);
  });
});
