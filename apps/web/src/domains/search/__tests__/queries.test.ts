import { describe, expect, it, vi } from "vitest";

import { SEARCH_MIN_QUERY_LENGTH } from "@/domains/search/types";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/search/search.functions", () => ({
  searchCaseFn: vi.fn(),
}));

import { searchCaseQuery, searchKeys } from "@/domains/search/queries";
import type { SearchCaseResult } from "@/domains/search/types";

describe("search queries", () => {
  const caseId = testId(1);
  const caseId2 = testId(2);

  it("builds trimmed case search keys", () => {
    expect(searchKeys.all).toEqual(["search"]);
    expect(searchKeys.case(caseId, "alpha")).toEqual([
      "search",
      "case",
      caseId,
      "alpha",
    ]);
  });

  it("enables search only for valid case id and long enough query", () => {
    expect(searchCaseQuery(caseId, "  a  ")).toMatchObject({
      queryKey: searchKeys.case(caseId, "a"),
      enabled: false,
    });
    expect(searchCaseQuery(caseId, "  alpha  ")).toMatchObject({
      queryKey: searchKeys.case(caseId, "alpha"),
      enabled: "alpha".length >= SEARCH_MIN_QUERY_LENGTH,
      staleTime: 15_000,
    });
    expect(searchCaseQuery("", "alpha")).toMatchObject({ enabled: false });
    expect(searchCaseQuery("case-1", "alpha")).toMatchObject({
      enabled: false,
    });
  });

  it("keeps placeholder data only within the same case", () => {
    const options = searchCaseQuery(caseId, "alpha");
    const placeholder = options.placeholderData;
    expect(typeof placeholder).toBe("function");
    if (typeof placeholder !== "function") return;

    const previousData = {
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
    const sameCasePreviousQuery = {
      queryKey: searchKeys.case(caseId, "alph"),
    };
    const otherCasePreviousQuery = {
      queryKey: searchKeys.case(caseId2, "alpha"),
    };

    expect(placeholder(previousData, sameCasePreviousQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholder(previousData, otherCasePreviousQuery as never)
    ).toBeUndefined();
  });
});
