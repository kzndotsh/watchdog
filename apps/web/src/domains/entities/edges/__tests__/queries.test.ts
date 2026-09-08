import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesFn: vi.fn(),
  listEdgesForCaseFn: vi.fn(),
}));

import {
  edgesForCaseQuery,
  edgesKeys,
  edgesListQuery,
} from "@/domains/entities/edges/queries";

describe("edges queries", () => {
  it("builds entity and case-wide keys", () => {
    expect(edgesKeys.prefix("case-1")).toEqual(["edges", "case-1"]);
    expect(edgesKeys.all("case-1", "ent-1")).toEqual([
      "edges",
      "case-1",
      "ent-1",
    ]);
    expect(edgesKeys.forCase("case-1")).toEqual(["edges", "case-1", "case"]);
  });

  it("uses default stale and gc tiers for list queries", () => {
    expect(edgesListQuery("case-1", "ent-1")).toMatchObject({
      queryKey: edgesKeys.all("case-1", "ent-1"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(edgesForCaseQuery("case-1")).toMatchObject({
      queryKey: edgesKeys.forCase("case-1"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("keeps placeholder data only for the same entity list key", () => {
    const entityOne = edgesListQuery("case-1", "ent-1");
    const entityTwo = edgesListQuery("case-1", "ent-2");
    const placeholderOne = entityOne.placeholderData;
    const placeholderTwo = entityTwo.placeholderData;
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "edge-1" }] as never;
    const entityOneQuery = { queryKey: edgesKeys.all("case-1", "ent-1") };
    const entityTwoQuery = { queryKey: edgesKeys.all("case-1", "ent-2") };

    expect(placeholderOne(previousData, entityOneQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholderOne(previousData, entityTwoQuery as never)
    ).toBeUndefined();
    expect(placeholderTwo(previousData, entityTwoQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholderTwo(previousData, entityOneQuery as never)
    ).toBeUndefined();
  });

  it("keeps placeholder data only for the same case-wide key", () => {
    const caseOne = edgesForCaseQuery("case-1");
    const caseTwo = edgesForCaseQuery("case-2");
    const placeholderOne = caseOne.placeholderData;
    const placeholderTwo = caseTwo.placeholderData;
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "edge-1" }] as never;
    const caseOneQuery = { queryKey: edgesKeys.forCase("case-1") };
    const caseTwoQuery = { queryKey: edgesKeys.forCase("case-2") };

    expect(placeholderOne(previousData, caseOneQuery as never)).toEqual(
      previousData
    );
    expect(placeholderOne(previousData, caseTwoQuery as never)).toBeUndefined();
    expect(placeholderTwo(previousData, caseTwoQuery as never)).toEqual(
      previousData
    );
    expect(placeholderTwo(previousData, caseOneQuery as never)).toBeUndefined();
  });
});
