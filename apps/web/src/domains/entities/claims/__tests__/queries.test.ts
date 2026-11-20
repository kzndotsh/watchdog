import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import { claimListView, claimsKeys } from "@/domains/entities/claims/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { claimList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const listClaims = procedureDouble("claims.list");

describe("claims queries", () => {
  it("sends one page of the view with its fixed Entity and the Case to claims.list", async () => {
    const caseId = testCaseId(1);
    listClaims.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    const options = claimListView.infinite(
      { caseId },
      claimList.queryOf(
        { q: "domain", sort: "created.desc" },
        { entityId: testId(2) }
      )
    );
    await new QueryClient().infiniteQuery(options);
    expect(listClaims).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId,
        entityId: testId(2),
        q: "domain",
        sort: "created.desc",
      })
    );
    expect(listClaims.mock.lastCall?.[0]).not.toHaveProperty("cursor");
  });

  it("keys a view by the procedure path and its input, under the Case's claims key", () => {
    const caseId = testCaseId(1);
    const key = claimListView.key(
      { caseId },
      claimList.queryOf({}, { entityId: testId(2) })
    );
    expect(key).toEqual([
      ["claims", "list"],
      {
        type: "infinite",
        input: expect.objectContaining({ caseId, entityId: testId(2) }),
      },
    ]);

    const client = new QueryClient();
    client.setQueryData(key, { pages: [], pageParams: [] });
    client.setQueryData(
      claimListView.key(
        { caseId: testCaseId(2) },
        claimList.queryOf({}, { entityId: testId(2) })
      ),
      { pages: [], pageParams: [] }
    );
    const matched = client
      .getQueryCache()
      .findAll({ queryKey: claimsKeys.all(caseId) })
      .map((query) => query.queryKey);
    expect(matched).toEqual([key]);
  });
});
