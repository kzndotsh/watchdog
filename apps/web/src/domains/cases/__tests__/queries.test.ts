import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
}));

import {
  caseByIdQuery,
  caseBySlugQuery,
  casesContextQuery,
  casesKeys,
} from "@/domains/cases/queries";

describe("cases queries", () => {
  it("builds stable query keys", () => {
    expect(casesKeys.all).toEqual(["cases"]);
    expect(casesKeys.context()).toEqual(["cases", "context"]);
    expect(casesKeys.detail("case-1")).toEqual(["cases", "detail", "case-1"]);
    expect(casesKeys.bySlug("alpha")).toEqual(["cases", "bySlug", "alpha"]);
  });

  it("uses default stale and gc tiers for context and detail queries", () => {
    expect(casesContextQuery()).toMatchObject({
      queryKey: casesKeys.context(),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(caseByIdQuery("case-1")).toMatchObject({
      queryKey: casesKeys.detail("case-1"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(caseBySlugQuery("alpha")).toMatchObject({
      queryKey: casesKeys.bySlug("alpha"),
      enabled: true,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(caseBySlugQuery("!!!")).toMatchObject({
      queryKey: casesKeys.bySlug("!!!"),
      enabled: false,
    });
  });

  it("keeps placeholder data only for the same query key", () => {
    const context = casesContextQuery();
    const caseOne = caseByIdQuery("case-1");
    const caseTwo = caseByIdQuery("case-2");
    const contextPlaceholder = context.placeholderData;
    const placeholderOne = caseOne.placeholderData;
    const placeholderTwo = caseTwo.placeholderData;
    expect(typeof contextPlaceholder).toBe("function");
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof contextPlaceholder !== "function" ||
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const contextData = { cases: [], active: null } as never;
    const caseData = { id: "case-1" } as never;
    const contextQuery = { queryKey: casesKeys.context() };
    const caseOneQuery = { queryKey: casesKeys.detail("case-1") };
    const caseTwoQuery = { queryKey: casesKeys.detail("case-2") };

    expect(contextPlaceholder(contextData, contextQuery as never)).toEqual(
      contextData
    );
    expect(placeholderOne(caseData, caseOneQuery as never)).toEqual(caseData);
    expect(placeholderOne(caseData, caseTwoQuery as never)).toBeUndefined();
    expect(placeholderTwo(caseData, caseTwoQuery as never)).toEqual(caseData);
    expect(placeholderTwo(caseData, caseOneQuery as never)).toBeUndefined();
  });
});
