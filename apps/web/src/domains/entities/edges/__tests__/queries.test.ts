import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orpc-client", async () =>
  (await import("@/testing/orpc-client")).orpcClientModuleDouble()
);

import {
  edgeByIdQuery,
  edgeListView,
  graphEgoQuery,
  graphKeys,
  graphSnapshotQuery,
} from "@/domains/entities/edges/queries";
import { procedureDouble } from "@/testing/orpc-client";
import { placeholderFor } from "@/testing/query-placeholder";
import { edgeList } from "@watchdog/domain/schemas/graph";
import { testCaseId } from "@watchdog/domain/schemas/testing";
import { testId } from "@watchdog/domain/test-kit";

const listEdges = procedureDouble("edges.list");
const getEdges = procedureDouble("edges.getMany");
const graphEgo = procedureDouble("graph.ego");
const graphSnapshot = procedureDouble("graph.snapshot");

describe("edges queries", () => {
  it("sends one page of the Connection list with the fixed Entity to edges.list", async () => {
    const caseId = testCaseId(1);
    listEdges.mockResolvedValue({
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
    expect(listEdges).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId,
        entityId: testId(2),
        predicate: ["owns"],
        sort: "updated.desc",
      })
    );
  });

  it("reads a Connection by id only with an id", async () => {
    const caseId = testCaseId(1);
    expect(edgeByIdQuery(caseId, null).enabled).toBe(false);
    getEdges.mockResolvedValue([]);
    await expect(
      new QueryClient().query(edgeByIdQuery(caseId, testId(3)))
    ).resolves.toBeNull();
    expect(getEdges).toHaveBeenCalledWith({ caseId, ids: [testId(3)] });
  });

  it("reads the snapshot and an ego graph under the Case's graph key", async () => {
    const caseId = testCaseId(1);
    graphSnapshot.mockResolvedValue({
      entities: [],
      edges: [],
      isTruncated: false,
    });
    graphEgo.mockResolvedValue({ edges: [], isTruncated: false });
    const client = new QueryClient();
    await client.query(graphSnapshotQuery(caseId));
    await client.query(graphEgoQuery(caseId, testId(2)));
    await client.query(graphSnapshotQuery(testCaseId(2)));

    expect(graphSnapshot).toHaveBeenCalledWith({ caseId });
    expect(graphEgo).toHaveBeenCalledWith({ caseId, entityId: testId(2) });
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: graphKeys.all(caseId) })
        .map((query) => query.queryKey)
    ).toEqual([
      graphSnapshotQuery(caseId).queryKey,
      graphEgoQuery(caseId, testId(2)).queryKey,
    ]);
  });

  it("keeps the snapshot's previous data only for the same Case", () => {
    const previous = { entities: [], edges: [], isTruncated: false };
    const query = graphSnapshotQuery("case-1");

    expect(
      placeholderFor(query, previous, graphSnapshotQuery("case-1").queryKey)
    ).toBe(previous);
    expect(
      placeholderFor(query, previous, graphSnapshotQuery("case-2").queryKey)
    ).toBeUndefined();
  });
});
