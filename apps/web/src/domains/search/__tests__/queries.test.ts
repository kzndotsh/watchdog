import { describe, expect, it, vi } from "vitest";

import { placeholderFor } from "@/testing/query-placeholder";
import type { SearchCaseResult } from "@watchdog/schemas/cases";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/search/search.functions", () => ({
  searchCaseFn: vi.fn(),
}));

import { searchCaseQuery, searchKeys } from "@/domains/search/queries";

describe("search queries", () => {
  const caseId = testId(1);
  const caseId2 = testId(2);

  it("enables search only for valid case id and long enough query", () => {
    expect(searchCaseQuery(caseId, "  a  ")).toMatchObject({
      queryKey: searchKeys.case(caseId, "a"),
      enabled: false,
    });
    expect(searchCaseQuery(caseId, "  alpha  ")).toMatchObject({
      queryKey: searchKeys.case(caseId, "alpha"),
      enabled: true,
    });
    expect(searchCaseQuery("", "alpha")).toMatchObject({ enabled: false });
    expect(searchCaseQuery("case-1", "alpha")).toMatchObject({
      enabled: false,
    });
  });

  it("keeps previous results only within the same case", () => {
    const options = searchCaseQuery(caseId, "alpha");
    const previous = {
      q: "alpha",
      entities: [],
      identifiers: [],
      evidence: [],
      tasks: [],
      jobs: [],
      proposals: [],
      cases: [],
      evidenceLabels: {},
      entityLabels: {},
    } satisfies SearchCaseResult;

    expect(
      placeholderFor(options, previous, searchKeys.case(caseId, "alph"))
    ).toBe(previous);
    expect(
      placeholderFor(options, previous, searchKeys.case(caseId2, "alpha"))
    ).toBeUndefined();
  });
});
