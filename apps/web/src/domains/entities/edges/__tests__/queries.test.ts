import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

const { listEdgesPageFn, getGraphEgoFn, getEdgesFn } = vi.hoisted(() => ({
  listEdgesPageFn: vi.fn(),
  getGraphEgoFn: vi.fn(),
  getEdgesFn: vi.fn(),
}));

vi.mock("@/domains/entities/edges/edges.functions", () => ({
  listEdgesPageFn,
  getEdgesFn,
  getGraphEgoFn,
  getGraphSnapshotFn: vi.fn(),
}));

import {
  edgeByIdQuery,
  edgeListView,
  edgesKeys,
  graphEgoQuery,
  graphSnapshotQuery,
} from "@/domains/entities/edges/queries";
import { edgeList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("edges queries", () => {
  it("keys the list views, the ego graph and the snapshot under the Case prefix", () => {
    const caseId = testCaseId(1);
    const prefix = edgesKeys.prefix(caseId);
    expect(prefix).toEqual(["edges", caseId]);
    const listKey = edgeListView.key(
      { caseId },
      edgeList.queryOf({}, { entityId: testId(2) })
    );
    // Under the Case prefix, so every Entity and Connection change refreshes each of them.
    for (const key of [
      listKey,
      edgesKeys.graphEgo(caseId, testId(2)),
      edgesKeys.graphSnapshot(caseId),
    ]) {
      expect(key.slice(0, 2)).toEqual(prefix);
    }
  });

  it("sends one page of the Connection list with the fixed Entity", async () => {
    const caseId = testCaseId(1);
    listEdgesPageFn.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: { count: 0, isCapped: false },
    });
    await new QueryClient().infiniteQuery(
      edgeListView.infinite(
        { caseId },
        edgeList.queryOf(
          { predicate: ["owns"], sort: "updated.desc" },
          { entityId: testId(2) }
        )
      )
    );
    expect(listEdgesPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId,
        entityId: testId(2),
        predicate: ["owns"],
        sort: "updated.desc",
      }),
    });
  });

  it("reads the ego graph once, and a Connection by id only with an id", async () => {
    const caseId = testCaseId(1);
    expect(graphEgoQuery(caseId, testId(2))).toMatchObject({
      queryKey: edgesKeys.graphEgo(caseId, testId(2)),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
    expect(edgeByIdQuery(caseId, null).enabled).toBe(false);
    getEdgesFn.mockResolvedValue([]);
    await expect(
      new QueryClient().query(edgeByIdQuery(caseId, testId(3)))
    ).resolves.toBeNull();
    expect(getEdgesFn).toHaveBeenCalledWith({
      data: { caseId, ids: [testId(3)] },
    });
  });

  it("keeps placeholder data only for the same Case's snapshot", () => {
    const caseOne = graphSnapshotQuery("case-1");
    const caseTwo = graphSnapshotQuery("case-2");
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
    const caseOneQuery = { queryKey: edgesKeys.graphSnapshot("case-1") };
    const caseTwoQuery = { queryKey: edgesKeys.graphSnapshot("case-2") };

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
