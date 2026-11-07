import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

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
  graphSnapshotQuery,
} from "@/domains/entities/edges/queries";
import { placeholderFor } from "@/testing/query-placeholder";
import { edgeList } from "@watchdog/schemas/graph";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

describe("edges queries", () => {
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

  it("reads a Connection by id only with an id", async () => {
    const caseId = testCaseId(1);
    expect(edgeByIdQuery(caseId, null).enabled).toBe(false);
    getEdgesFn.mockResolvedValue([]);
    await expect(
      new QueryClient().query(edgeByIdQuery(caseId, testId(3)))
    ).resolves.toBeNull();
    expect(getEdgesFn).toHaveBeenCalledWith({
      data: { caseId, ids: [testId(3)] },
    });
  });

  it("keeps the snapshot's previous data only for the same Case", () => {
    const previous = { entities: [], edges: [], isTruncated: false };
    const query = graphSnapshotQuery("case-1");

    expect(
      placeholderFor(query, previous, edgesKeys.graphSnapshot("case-1"))
    ).toBe(previous);
    expect(
      placeholderFor(query, previous, edgesKeys.graphSnapshot("case-2"))
    ).toBeUndefined();
  });
});
