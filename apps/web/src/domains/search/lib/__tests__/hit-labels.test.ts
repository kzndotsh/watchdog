import { describe, expect, it } from "vitest";

import {
  searchEvidenceHitLabel,
  searchJobHitLabel,
  searchProposalHitLabel,
} from "@/domains/search/lib/hit-labels";

describe("searchJobHitLabel", () => {
  it("uses capability label when there is no summary", () => {
    expect(
      searchJobHitLabel({
        capabilityId: "network.shodan.lookup",
        resultSummary: null,
        input: {},
      })
    ).toBe("Shodan Lookup");
  });

  it("combines capability label with summary", () => {
    expect(
      searchJobHitLabel({
        capabilityId: "network.shodan.lookup",
        resultSummary: "3 open ports",
        input: {},
      })
    ).toBe("Shodan Lookup — 3 open ports");
  });

  it("uses input subject when there is no summary", () => {
    expect(
      searchJobHitLabel({
        capabilityId: "network.shodan.lookup",
        resultSummary: null,
        input: { ip: "198.51.100.1" },
      })
    ).toBe("Shodan Lookup — 198.51.100.1");
  });

  it("prefers playbook label for playbook jobs", () => {
    expect(
      searchJobHitLabel({
        capabilityId: "network.dns.lookup",
        resultSummary: null,
        input: { host: "example.com" },
        playbookId: "host-footprint",
      })
    ).toBe("Host Footprint — example.com");
  });

  it("prefers playbook label when a playbook job has a result summary", () => {
    expect(
      searchJobHitLabel({
        capabilityId: "network.dns.lookup",
        resultSummary: "2 records",
        input: { host: "example.com" },
        playbookId: "host-footprint",
      })
    ).toBe("Host Footprint — 2 records");
  });

  it("uses evidence title from evidenceLabels when input references evidenceId", () => {
    const evidenceId = "550e8400-e29b-41d4-a716-446655440000";
    expect(
      searchJobHitLabel(
        {
          capabilityId: "network.shodan.lookup",
          resultSummary: null,
          input: { evidenceId },
        },
        { [evidenceId]: "Vendor Report PDF" }
      )
    ).toBe("Shodan Lookup — Vendor Report PDF");
  });

  it("uses entity title from entityLabels when input references entityId", () => {
    const entityId = "550e8400-e29b-41d4-a716-446655440001";
    expect(
      searchJobHitLabel(
        {
          capabilityId: "network.dns.lookup",
          resultSummary: null,
          input: { entityId },
        },
        undefined,
        { [entityId]: "Alpha Corp" }
      )
    ).toBe("DNS Lookup — Alpha Corp");
  });
});

describe("searchEvidenceHitLabel", () => {
  it("uses URL host when label is missing", () => {
    expect(
      searchEvidenceHitLabel({
        label: null,
        kind: "url_archive",
        sourceUrl: "https://example.com/page",
      })
    ).toBe("example.com");
  });
});

describe("searchProposalHitLabel", () => {
  it("prefers summary", () => {
    expect(
      searchProposalHitLabel({
        summary: "Link A to B",
        capabilityId: "network.shodan.lookup",
      })
    ).toBe("Link A to B");
  });

  it("falls back to capability label", () => {
    expect(
      searchProposalHitLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
      })
    ).toBe("Shodan Lookup");
  });

  it("combines capability label with entity name", () => {
    expect(
      searchProposalHitLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
        entityName: "Alpha Corp",
      })
    ).toBe("Shodan Lookup · Alpha Corp");
  });

  it("prefers playbook label over step capability", () => {
    expect(
      searchProposalHitLabel({
        summary: null,
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint",
        entityName: "Alpha Corp",
      })
    ).toBe("Host Footprint · Alpha Corp");
  });
});
