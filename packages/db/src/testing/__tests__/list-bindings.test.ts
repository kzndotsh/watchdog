import { describe, expect, it } from "vitest";

import { LIST_DEFS } from "@watchdog/schemas/testing";

import { LIST_REPOS } from "../list-repos";

describe("LIST_REPOS", () => {
  it("binds every declared list exactly once, to its own declaration", () => {
    expect(LIST_REPOS.map((repo) => repo.def.name).sort()).toEqual(
      LIST_DEFS.map((def) => def.name).sort()
    );
    for (const repo of LIST_REPOS) {
      expect(LIST_DEFS).toContain(repo.def);
    }
  });

  it("names a column for every declared sort and every selective filter it binds", () => {
    for (const { def, indexNeeds } of LIST_REPOS) {
      expect(Object.keys(indexNeeds.sortColumns).sort()).toEqual(
        Object.keys(def.sorts).sort()
      );
      for (const key of Object.keys(indexNeeds.selectiveColumns)) {
        expect(Object.keys(def.filters)).toContain(key);
      }
      expect(indexNeeds.searchColumns).toHaveLength(
        def.search?.fields.length ?? 0
      );
    }
  });
});
