import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/entities/identifiers/identifiers.functions", () => ({
  listIdentifiersFn: vi.fn(),
  listIdentifiersForCaseFn: vi.fn(),
}));

import {
  identifiersForCaseQuery,
  identifiersKeys,
  identifiersListQuery,
} from "@/domains/entities/identifiers/queries";

describe("identifiers queries", () => {
  it("builds entity and case-wide keys", () => {
    expect(identifiersKeys.prefix("case-1")).toEqual(["identifiers", "case-1"]);
    expect(identifiersKeys.all("case-1", "ent-1")).toEqual([
      "identifiers",
      "case-1",
      "ent-1",
    ]);
    expect(identifiersKeys.forCase("case-1")).toEqual([
      "identifiers",
      "case-1",
      "case",
    ]);
  });

  it("uses default stale and gc tiers for list queries", () => {
    expect(identifiersListQuery("case-1", "ent-1")).toMatchObject({
      queryKey: identifiersKeys.all("case-1", "ent-1"),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(identifiersForCaseQuery("case-1")).toMatchObject({
      queryKey: identifiersKeys.forCase("case-1"),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("keeps placeholder data only for the same entity list key", () => {
    const entityOne = identifiersListQuery("case-1", "ent-1");
    const entityTwo = identifiersListQuery("case-1", "ent-2");
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

    const previousData = [{ id: "id-1" }] as never;
    const entityOneQuery = { queryKey: identifiersKeys.all("case-1", "ent-1") };
    const entityTwoQuery = { queryKey: identifiersKeys.all("case-1", "ent-2") };

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
    const caseOne = identifiersForCaseQuery("case-1");
    const caseTwo = identifiersForCaseQuery("case-2");
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

    const previousData = [{ id: "id-1" }] as never;
    const caseOneQuery = { queryKey: identifiersKeys.forCase("case-1") };
    const caseTwoQuery = { queryKey: identifiersKeys.forCase("case-2") };

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
