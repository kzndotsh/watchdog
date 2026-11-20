import { describe, expect, it } from "vitest";

import { proposalEntityId, proposalEntityName } from "../proposal-display";

describe("proposalEntityName", () => {
  it("skips first cited entity without display maps", () => {
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

  it("resolves entity create op body without display maps", () => {
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
  it("names the first cited entity", () => {
    expect(
      proposalEntityName({
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
          "00000000-0000-4000-8000-000000000002": "Beta Holdings",
        },
      })
    ).toBe("Beta Holdings");
  });

  it("names an edge by its from endpoint", () => {
    expect(
      proposalEntityName({
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
          "00000000-0000-4000-8000-000000000005": "Beta LLC",
        },
      })
    ).toBe("Alpha Corp");
  });

  it("falls back to the slug when no name is known", () => {
    const entityId = "00000000-0000-4000-8000-000000000001";
    expect(
      proposalEntityName({
        patch: [
          {
            kind: "claim.create",
            id: "00000000-0000-4000-8000-000000000002",
            data: { entityId, text: "observed" },
          },
        ],
        entityNames: {},
        entitySlugs: { [entityId]: "alpha-corp" },
      })
    ).toBe("alpha-corp");
  });
});

describe("proposalEntityId", () => {
  it("prefers a later cited entity with display maps", () => {
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
});
