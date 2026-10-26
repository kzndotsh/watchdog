import { describe, expect, it } from "vitest";

import { graphTruncationNotice } from "@/domains/cases/lib/graph-notice";

const HINT = "Open an Entity's Connections to see the rest.";

function snapshot(entities: number, edges: number, isTruncated: boolean) {
  const entity = { id: "e", name: "E", slug: "e", kind: "person" as const };
  const edge = {
    id: "c",
    fromId: "e",
    toId: "e",
    predicate: "associate_of" as const,
    confidence: "unverified" as const,
  };
  return {
    entities: Array.from({ length: entities }, () => entity),
    edges: Array.from({ length: edges }, () => edge),
    isTruncated,
  };
}

const exact = (count: number) => ({ count, isCapped: false });

describe("graphTruncationNotice", () => {
  it("says nothing when the server cut nothing", () => {
    expect(graphTruncationNotice(snapshot(3, 2, false), undefined)).toBeNull();
  });

  it("names N of M Entities from the Case's counts", () => {
    expect(
      graphTruncationNotice(snapshot(150, 10, true), {
        entities: exact(2500),
        connections: exact(10),
      })
    ).toBe(`Showing 150 of 2,500 entities, the most connected. ${HINT}`);
  });

  it("names the Connections when every Entity is drawn", () => {
    expect(
      graphTruncationNotice(snapshot(40, 600, true), {
        entities: exact(40),
        connections: { count: 1000, isCapped: true },
      })
    ).toBe(`Showing 600 of 1,000+ connections. ${HINT}`);
  });

  it("names the drawn Entities while the counts are unknown", () => {
    expect(graphTruncationNotice(snapshot(150, 10, true), undefined)).toBe(
      `Showing the 150 most connected entities. ${HINT}`
    );
  });
});
