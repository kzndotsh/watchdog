import { describe, expect, it } from "vitest";
import { z } from "zod";

import { tabSearchParam } from "@/shared/lib/tab-search";

const TABS = ["one", "two", "three"] as const;
const schema = z.object({
  tab: tabSearchParam(TABS),
});

describe("tabSearchParam", () => {
  it("keeps a valid tab", () => {
    expect(schema.parse({ tab: "three" })).toEqual({ tab: "three" });
  });

  it("trims a padded tab", () => {
    expect(schema.parse({ tab: "  one  " })).toEqual({ tab: "one" });
  });

  it.each([
    ["an unknown tab", "nope"],
    ["a blank tab", "   "],
    ["a non-string tab", 3],
    ["an inherited object key", "constructor"],
    ["a missing tab", undefined],
  ])("resolves %s to no tab, never throwing", (_label, value) => {
    expect(schema.parse({ tab: value }).tab).toBeUndefined();
  });
});
