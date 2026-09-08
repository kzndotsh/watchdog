import { describe, expect, it } from "vitest";

import { entitiesKeys } from "@/domains/entities/entities-keys";

describe("entitiesKeys", () => {
  it("builds case-scoped list and slug detail keys", () => {
    expect(entitiesKeys.all("case-1")).toEqual(["entities", "case-1"]);
    expect(entitiesKeys.detail("case-1", "alpha")).toEqual([
      "entities",
      "detail",
      "case-1",
      "alpha",
    ]);
  });
});
