import { describe, it, expect } from "vitest";

import { runDomain } from "../../infra/run-domain.ts";
import { searchCaseEffect } from "../search-case.ts";

describe("searchCase", () => {
  it("returns empty buckets when query is shorter than 2 chars (no DB)", async () => {
    const result = await runDomain(
      searchCaseEffect({
        caseId: "00000000-0000-4000-8000-000000000000",
        organizationId: "org-test",
        q: "a",
      })
    );
    expect(result.q).toBe("a");
    expect(result.entities).toEqual([]);
    expect(result.identifiers).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.jobs).toEqual([]);
    expect(result.proposals).toEqual([]);
    expect(result.cases).toEqual([]);
  });

  it("trims whitespace-only short queries", async () => {
    const result = await runDomain(
      searchCaseEffect({
        caseId: "00000000-0000-4000-8000-000000000000",
        organizationId: "org-test",
        q: "  ",
      })
    );
    expect(result.q).toBe("");
    expect(result.entities.length).toBe(0);
  });
});
