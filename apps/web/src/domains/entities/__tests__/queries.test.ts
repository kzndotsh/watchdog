import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/entities/entities.functions", () => ({
  getEntityBySlugFn: vi.fn(),
  listEntitiesFn: vi.fn(),
}));

import { listEntitiesFn } from "@/domains/entities/entities.functions";
import {
  entitiesKeys,
  entitiesListQuery,
  entityBySlugQuery,
} from "@/domains/entities/queries";
import { testId } from "@watchdog/test-kit";

describe("entities queries", () => {
  it("builds case-scoped entity keys", () => {
    expect(entitiesKeys.all("case-1")).toEqual(["entities", "case-1"]);
    expect(entitiesKeys.detail("case-1", "alpha")).toEqual([
      "entities",
      "detail",
      "case-1",
      "alpha",
    ]);
  });

  it("uses default stale and gc tiers for list and detail queries", () => {
    expect(entitiesListQuery("case-1")).toMatchObject({
      queryKey: entitiesKeys.all("case-1"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(entityBySlugQuery("case-1", "alpha")).toMatchObject({
      queryKey: entitiesKeys.detail("case-1", "alpha"),
      enabled: false,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("keeps placeholder data only for the same case key", () => {
    const caseOne = entitiesListQuery("case-1");
    const caseTwo = entitiesListQuery("case-2");
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

    const previousData = [{ id: "ent-1" }] as never;
    const caseOneQuery = { queryKey: entitiesKeys.all("case-1") };
    const caseTwoQuery = { queryKey: entitiesKeys.all("case-2") };

    expect(placeholderOne(previousData, caseOneQuery as never)).toEqual(
      previousData
    );
    expect(placeholderOne(previousData, caseTwoQuery as never)).toBeUndefined();
    expect(placeholderTwo(previousData, caseTwoQuery as never)).toEqual(
      previousData
    );
    expect(placeholderTwo(previousData, caseOneQuery as never)).toBeUndefined();
  });

  it("keeps placeholder data only for the same entity detail key", () => {
    const alpha = entityBySlugQuery("case-1", "alpha");
    const beta = entityBySlugQuery("case-1", "beta");
    const placeholderAlpha = alpha.placeholderData;
    const placeholderBeta = beta.placeholderData;
    expect(typeof placeholderAlpha).toBe("function");
    expect(typeof placeholderBeta).toBe("function");
    if (
      typeof placeholderAlpha !== "function" ||
      typeof placeholderBeta !== "function"
    ) {
      return;
    }

    const previousData = { id: "ent-1", slug: "alpha" } as never;
    const alphaQuery = { queryKey: entitiesKeys.detail("case-1", "alpha") };
    const betaQuery = { queryKey: entitiesKeys.detail("case-1", "beta") };

    expect(placeholderAlpha(previousData, alphaQuery as never)).toEqual(
      previousData
    );
    expect(placeholderAlpha(previousData, betaQuery as never)).toBeUndefined();
    expect(placeholderBeta(previousData, betaQuery as never)).toEqual(
      previousData
    );
    expect(placeholderBeta(previousData, alphaQuery as never)).toBeUndefined();
  });

  it("normalizes padded case ids before list fetch", async () => {
    const caseId = testId(10);
    vi.mocked(listEntitiesFn).mockResolvedValue([]);
    const query = entitiesListQuery(`  ${caseId}  `);
    expect(query.queryKey).toEqual(entitiesKeys.all(caseId));
    expect(query.queryFn).toBeDefined();
    await query.queryFn!({
      client: {} as never,
      queryKey: query.queryKey,
      signal: new AbortController().signal,
      meta: undefined,
    });
    expect(listEntitiesFn).toHaveBeenCalledWith({
      data: { caseId },
    });
  });
});
