import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/cases/cases.functions", () => ({
  getCasesContextFn: vi.fn(),
  getCaseByIdFn: vi.fn(),
  getCaseBySlugFn: vi.fn(),
  getDeletedCaseBySlugFn: vi.fn(),
  getDeletionPolicyFn: vi.fn(),
  listDeletedCasesFn: vi.fn(),
}));

import {
  caseByIdQuery,
  caseBySlugQuery,
  casesContextQuery,
  casesKeys,
  deletedCaseBySlugQuery,
  deletedCasesQuery,
  deletionPolicyQuery,
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

  it("keeps the deleted-Case queries under the cases prefix, so a Case change refreshes them", () => {
    expect(casesKeys.deleted()).toEqual(["cases", "deleted"]);
    expect(casesKeys.deletedBySlug("alpha")).toEqual([
      "cases",
      "deleted-by-slug",
      "alpha",
    ]);
    expect(casesKeys.deletionPolicy()).toEqual(["cases", "deletion-policy"]);
    expect(deletionPolicyQuery().queryKey).toEqual(casesKeys.deletionPolicy());
    // The per-Case policy sits under the same prefix, so one invalidation reaches both.
    expect(casesKeys.deletionPolicy("c1")).toEqual([
      "cases",
      "deletion-policy",
      "c1",
    ]);
    expect(deletedCasesQuery().queryKey).toEqual(casesKeys.deleted());
    expect(deletedCaseBySlugQuery("alpha")).toMatchObject({
      queryKey: casesKeys.deletedBySlug("alpha"),
      enabled: true,
    });
    expect(deletedCaseBySlugQuery("!!!").enabled).toBe(false);
  });

  it("pages deleted Cases by the server's cursor and stops on the last page", () => {
    const options = deletedCasesQuery();
    const page = (nextCursor: string | null) => ({ items: [], nextCursor });
    expect(options.getNextPageParam(page("17_abc"), [], undefined, [])).toBe(
      "17_abc"
    );
    expect(
      options.getNextPageParam(page(null), [], undefined, [])
    ).toBeUndefined();
  });
});
