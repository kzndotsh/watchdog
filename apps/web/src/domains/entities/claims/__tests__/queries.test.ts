import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import { testId } from "@watchdog/test-kit";

vi.mock("@/domains/entities/claims/claims.functions", () => ({
  listClaimsFn: vi.fn(),
}));

import { claimsKeys, claimsListQuery } from "@/domains/entities/claims/queries";

describe("claims queries", () => {
  it("builds case- and entity-scoped keys", () => {
    expect(claimsKeys.prefix("case-1")).toEqual(["claims", "case-1"]);
    expect(claimsKeys.all("case-1", "ent-1")).toEqual([
      "claims",
      "case-1",
      "ent-1",
    ]);
  });

  it("uses default stale and gc tiers for entity claims", () => {
    expect(claimsListQuery("case-1", "ent-1")).toMatchObject({
      queryKey: claimsKeys.all("case-1", "ent-1"),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("normalizes padded entity scope for claim list keys", () => {
    const caseId = testId(10);
    const entityId = testId(20);
    expect(claimsListQuery(` ${caseId} `, ` ${entityId} `).queryKey).toEqual(
      claimsKeys.all(caseId, entityId)
    );
  });

  it("keeps placeholder data only for the same entity list key", () => {
    const entityOne = claimsListQuery("case-1", "ent-1");
    const entityTwo = claimsListQuery("case-1", "ent-2");
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

    const previousData = [{ id: "claim-1" }] as never;
    const entityOneQuery = { queryKey: claimsKeys.all("case-1", "ent-1") };
    const entityTwoQuery = { queryKey: claimsKeys.all("case-1", "ent-2") };

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
});
