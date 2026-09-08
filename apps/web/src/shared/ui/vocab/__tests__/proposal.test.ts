import { describe, expect, it } from "vitest";

import {
  proposalHeadlineLabel,
  proposalSourceLabel,
} from "@/shared/ui/vocab/proposal";

describe("proposalSourceLabel", () => {
  it("prefers playbook label", () => {
    expect(
      proposalSourceLabel({
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint",
      })
    ).toBe("Host Footprint");
  });

  it("falls back to capability label", () => {
    expect(
      proposalSourceLabel({
        capabilityId: "network.shodan.lookup",
      })
    ).toBe("Shodan Lookup");
  });
});

describe("proposalHeadlineLabel", () => {
  it("prefers summary", () => {
    expect(
      proposalHeadlineLabel({
        summary: "Link domains",
        capabilityId: "network.shodan.lookup",
      })
    ).toBe("Link domains");
  });

  it("falls back to capability label", () => {
    expect(
      proposalHeadlineLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
      })
    ).toBe("Shodan Lookup");
  });

  it("combines capability label with entity name", () => {
    expect(
      proposalHeadlineLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
        entityName: "Alpha Corp",
      })
    ).toBe("Shodan Lookup · Alpha Corp");
  });

  it("prefers playbook label over step capability", () => {
    expect(
      proposalHeadlineLabel({
        summary: null,
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint",
        entityName: "Alpha Corp",
      })
    ).toBe("Host Footprint · Alpha Corp");
  });
});
