import { describe, it, expect } from "vitest";

import { interpretIdentifierBatches } from "../interpret-identifier-batches.ts";
import { INVALID_COLLECT_ENTITY_SUMMARY } from "../resolve-collect-entity-id.ts";

describe("interpret-identifier-batches", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";

  it("interpretIdentifierBatches empty without entityId", () => {
    const result = interpretIdentifierBatches({
      entityId: undefined,
      batches: [{ type: "domain", values: ["a.example.com"] }],
      claimText: "x",
      noEntitySummary: "none",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("none");
  });

  it("interpretIdentifierBatches treats whitespace-only entityId as missing", () => {
    const result = interpretIdentifierBatches({
      entityId: "   ",
      batches: [{ type: "domain", values: ["a.example.com"] }],
      claimText: "x",
      noEntitySummary: "none",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("none");
  });

  it("interpretIdentifierBatches rejects invalid entityId", () => {
    const result = interpretIdentifierBatches({
      entityId: "entity-1",
      batches: [{ type: "domain", values: ["a.example.com"] }],
      claimText: "x",
      noEntitySummary: "none",
    });
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe(INVALID_COLLECT_ENTITY_SUMMARY);
  });

  it("interpretIdentifierBatches trims padded claim text", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [{ type: "email", values: ["a@b.com"] }],
      claimText: "  summary  ",
      noEntitySummary: "none",
    });
    expect(result.summary).toBe("summary");
    const claim = result.patch.find((op) => op.resource === "claim");
    expect(claim?.data.text).toBe("summary");
  });

  it("interpretIdentifierBatches trims padded entityId", () => {
    const result = interpretIdentifierBatches({
      entityId: `  ${entityId}  `,
      batches: [{ type: "email", values: ["a@b.com"] }],
      claimText: "summary",
      noEntitySummary: "none",
    });
    expect(result.patch[0]?.data.entityId).toBe(entityId);
  });

  it("interpretIdentifierBatches multiple types + claim", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [
        { type: "email", values: ["a@b.com"] },
        { type: "domain", values: ["b.com"] },
        { type: "handle", values: ["alice"], platform: "gravatar" },
      ],
      claimText: "summary",
      noEntitySummary: "none",
    });
    expect(result.patch.length).toBe(4);
    expect(result.patch[0]?.data.type).toBe("email");
    expect(result.patch[1]?.data.type).toBe("domain");
    expect(result.patch[2]?.data.type).toBe("handle");
    expect(result.patch[2]?.data.platform).toBe("gravatar");
    expect(result.patch[3]?.resource).toBe("claim");
  });

  it("skips values that fail identifier validation", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [
        { type: "url", values: ["not a url", "https://ok.example/"] },
        { type: "domain", values: [null, "nodot", "ok.example"] },
      ],
      claimText: "summary",
      noEntitySummary: "none",
    });
    const ids = result.patch.filter((op) => op.resource === "identifier");
    expect(ids.map((op) => op.data.value)).toEqual([
      "https://ok.example",
      "ok.example",
    ]);
    expect(result.patch.at(-1)?.resource).toBe("claim");
  });

  it("skips handles that fail the write gate", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [
        { type: "handle", values: ["alice"] },
        { type: "handle", values: ["bob"], platform: "github" },
      ],
      claimText: "summary",
      noEntitySummary: "none",
    });
    const ids = result.patch.filter((op) => op.resource === "identifier");
    expect(ids).toHaveLength(1);
    expect(ids[0]?.data.value).toBe("bob");
    expect(ids[0]?.data.platform).toBe("github");
  });

  it("keeps the same handle value on different platforms", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [
        { type: "handle", values: ["alice"], platform: "keybase" },
        { type: "handle", values: ["alice"], platform: "github" },
      ],
      claimText: "summary",
      noEntitySummary: "none",
    });
    const ids = result.patch.filter((op) => op.resource === "identifier");
    expect(ids).toHaveLength(2);
    expect(ids.map((op) => op.data.platform)).toEqual(["keybase", "github"]);
  });

  it("deduplicates identical values across batches", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [
        { type: "ip", values: ["1.2.3.4"] },
        { type: "ip", values: ["1.2.3.4"] },
      ],
      claimText: "summary",
      noEntitySummary: "none",
    });
    const ids = result.patch.filter((op) => op.resource === "identifier");
    expect(ids).toHaveLength(1);
    expect(ids[0]?.data.value).toBe("1.2.3.4");
  });

  it("drops wildcard domains before validation", () => {
    const result = interpretIdentifierBatches({
      entityId,
      batches: [
        {
          type: "domain",
          values: ["*.example.com", "www.example.com", "api.*.example.com"],
        },
      ],
      claimText: "summary",
      noEntitySummary: "none",
    });
    const ids = result.patch.filter((op) => op.resource === "identifier");
    expect(ids).toHaveLength(1);
    expect(ids[0]?.data.value).toBe("www.example.com");
  });
});
