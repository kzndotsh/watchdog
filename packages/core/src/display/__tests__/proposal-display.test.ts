import { describe, expect, it } from "vitest";

import { proposalEntityId, proposalEntityName } from "@watchdog/schemas/jobs";

import {
  proposalActivityLabel,
  proposalSourceLabel,
} from "../proposal-display";

describe("proposalActivityLabel", () => {
  it("prefers summary", () => {
    expect(
      proposalActivityLabel({
        summary: "Link A to B",
        capabilityId: "network.shodan.lookup",
        patch: [],
      })
    ).toBe("Link A to B");
  });

  it("falls back to capability label", () => {
    expect(
      proposalActivityLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
        patch: [],
      })
    ).toBe("Shodan Lookup");
  });

  it("proposalSourceLabel prefers playbook over capability", () => {
    expect(
      proposalSourceLabel({
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint-lite",
      })
    ).toBe("Host Footprint Lite");
  });

  it("prefers playbook label over linked job capability", () => {
    expect(
      proposalActivityLabel({
        summary: null,
        capabilityId: "network.dns.lookup",
        playbookId: "host-footprint-lite",
        patch: [],
      })
    ).toBe("Host Footprint Lite");
  });

  it("combines capability label with entity name", () => {
    expect(
      proposalActivityLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
        patch: [
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000001",
            data: {
              entityId: "00000000-0000-4000-8000-000000000002",
              text: "observed",
            },
          },
        ],
        entityNames: {
          "00000000-0000-4000-8000-000000000002": "Alpha Corp",
        },
      })
    ).toBe("Shodan Lookup · Alpha Corp");
  });

  it("combines capability label with edge endpoint entity name", () => {
    expect(
      proposalActivityLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
        patch: [
          {
            kind: "edge.create",
            id: "00000000-0000-4000-8000-000000000003",
            data: {
              fromId: "00000000-0000-4000-8000-000000000004",
              toId: "00000000-0000-4000-8000-000000000005",
              predicate: "associate_of",
            },
          },
        ],
        entityNames: {
          "00000000-0000-4000-8000-000000000004": "Alpha Corp",
        },
      })
    ).toBe("Shodan Lookup · Alpha Corp");
  });

  it("falls back to entity slug when name is blank", () => {
    expect(
      proposalActivityLabel({
        summary: null,
        capabilityId: "network.shodan.lookup",
        patch: [
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000001",
            data: {
              entityId: "00000000-0000-4000-8000-000000000002",
              text: "observed",
            },
          },
        ],
        entitySlugs: {
          "00000000-0000-4000-8000-000000000002": "alpha-corp",
        },
      })
    ).toBe("Shodan Lookup · alpha-corp");
  });

  it("proposalEntityName skips first cited entity without display maps", () => {
    expect(
      proposalEntityName({
        patch: [
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000001",
            data: {
              entityId: "00000000-0000-4000-8000-000000000099",
              text: "orphan",
            },
          },
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000002",
            data: {
              entityId: "00000000-0000-4000-8000-000000000003",
              text: "known",
            },
          },
        ],
        entityNames: {
          "00000000-0000-4000-8000-000000000003": "Beta LLC",
        },
        entitySlugs: {
          "00000000-0000-4000-8000-000000000003": "beta-llc",
        },
      })
    ).toBe("Beta LLC");
  });

  it("proposalEntityId prefers a later cited entity with display maps", () => {
    const orphanId = "00000000-0000-4000-8000-000000000099";
    const knownId = "00000000-0000-4000-8000-000000000003";
    expect(
      proposalEntityId({
        patch: [
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000001",
            data: { entityId: orphanId, text: "orphan" },
          },
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000002",
            data: { entityId: knownId, text: "known" },
          },
        ],
        entityNames: { [knownId]: "Beta LLC" },
        entitySlugs: { [knownId]: "beta-llc" },
      })
    ).toBe(knownId);
  });

  it("proposalEntityName resolves entity create op body without display maps", () => {
    expect(
      proposalEntityName({
        patch: [
          {
            kind: "entity.create",
            id: "00000000-0000-4000-8000-000000000010",
            data: { kind: "org", name: "Acme Corp", slug: "acme-corp" },
          },
        ],
      })
    ).toBe("Acme Corp");
  });

  it("proposalEntityId returns entity op id for entity create proposals", () => {
    const entityId = "00000000-0000-4000-8000-000000000010";
    expect(
      proposalEntityId({
        patch: [
          {
            kind: "entity.create",
            id: entityId,
            data: { kind: "org", name: "Acme Corp", slug: "acme-corp" },
          },
        ],
      })
    ).toBe(entityId);
  });

  it("describes patch ops when no summary or cap", () => {
    expect(
      proposalActivityLabel({
        summary: "",
        capabilityId: null,
        patch: [
          {
            kind: "claim.create",
            id: "x",
            data: {
              entityId: "00000000-0000-4000-8000-000000000001",
              text: "x",
            },
          },
        ],
      })
    ).toBe("Create Claim");
  });
});
