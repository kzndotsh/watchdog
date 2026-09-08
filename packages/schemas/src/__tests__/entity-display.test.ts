import { describe, expect, it } from "vitest";

import {
  entitySearchHaystackFromRow,
  entitySearchHaystackMapFromRows,
  entityTitleMapFromRows,
} from "../entity-display";

describe("entityTitleMapFromRows", () => {
  it("maps entity ids to display labels and filters to needed ids", () => {
    const map = entityTitleMapFromRows(
      [
        { id: "ent-1", name: "Alpha Corp", slug: "alpha-corp" },
        { id: "ent-2", name: "Beta LLC", slug: "beta-llc" },
      ],
      new Set(["ent-1"])
    );
    expect(map.get("ent-1")).toBe("Alpha Corp");
    expect(map.has("ent-2")).toBe(false);
  });

  it("falls back to slug when name is blank", () => {
    const map = entityTitleMapFromRows([
      { id: "ent-1", name: "  ", slug: "gamma-llc" },
    ]);
    expect(map.get("ent-1")).toBe("gamma-llc");
  });
});

describe("entitySearchHaystackFromRow", () => {
  it("joins label, slug, summary, and notes for queue search", () => {
    expect(
      entitySearchHaystackFromRow({
        id: "ent-1",
        name: "Alpha Corp",
        slug: "alpha-corp",
        summary: "  Holding company  ",
        notes: "  Key subject  ",
      })
    ).toBe("Alpha Corp alpha-corp Holding company Key subject");
  });

  it("maps entity ids to search haystacks", () => {
    const map = entitySearchHaystackMapFromRows([
      { id: "ent-1", name: "Alpha Corp", slug: "alpha-corp" },
    ]);
    expect(map.get("ent-1")).toBe("Alpha Corp alpha-corp");
  });
});
