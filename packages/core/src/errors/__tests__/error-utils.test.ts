import { describe, expect, it } from "vitest";

import { isUniqueViolation } from "../error-utils.ts";

describe("isUniqueViolation", () => {
  it("matches a nested postgres unique violation by index name", () => {
    const inner = {
      code: "23505",
      constraint: "changesets_case_actor_idem_uidx",
    };
    const wrapped = new Error("Failed query: insert");
    Object.assign(wrapped, { cause: inner });
    expect(isUniqueViolation(wrapped, "changesets_case_actor_idem_uidx")).toBe(
      true
    );
  });

  it("walks a three-level cause chain", () => {
    const inner = {
      code: "23505",
      constraint_name: "changesets_case_actor_idem_uidx",
    };
    const mid = Object.assign(new Error("drizzle"), { cause: inner });
    const outer = Object.assign(new Error("query"), { cause: mid });
    expect(isUniqueViolation(outer, "changesets_case_actor_idem_uidx")).toBe(
      true
    );
  });

  it("ignores a unique violation on a different index", () => {
    expect(
      isUniqueViolation(
        { code: "23505", constraint: "cases_slug_unique" },
        "changesets_case_actor_idem_uidx"
      )
    ).toBe(false);
  });
});
