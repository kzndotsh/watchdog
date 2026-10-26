import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const edgesApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const graphApi = { snapshot: vi.fn() };

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ edges: edgesApi, graph: graphApi }),
}));

import {
  createEdgeFn,
  deleteEdgeFn,
  getGraphSnapshotFn,
  listEdgesFn,
  updateEdgeFn,
} from "@/domains/entities/edges/edges.functions";

type ServerDataContext<T> = {
  data: T;
  context: Record<string, never>;
};

describe("edges.functions", () => {
  it("lists edges for an entity scope", async () => {
    const edge = {
      id: testId(1),
      fromId: testId(2),
      toId: testId(3),
      predicate: "related_to",
      notes: null,
    };
    edgesApi.list.mockResolvedValue({ items: [edge], nextCursor: null });

    const rows = await (
      listEdgesFn as unknown as (
        input: ServerDataContext<{ caseId: string; entityId: string }>
      ) => Promise<(typeof edge)[]>
    )({
      data: { caseId: testId(10), entityId: testId(20) },
      context: {},
    });

    expect(rows).toEqual([edge]);
    expect(edgesApi.list).toHaveBeenCalledWith({
      caseId: testId(10),
      entityId: testId(20),
      limit: 200,
    });
  });

  it("routes create, update, delete and the graph snapshot through oRPC", async () => {
    const created = { id: testId(4) };
    edgesApi.create.mockResolvedValue(created);
    edgesApi.update.mockResolvedValue(created);
    edgesApi.delete.mockResolvedValue(undefined);
    graphApi.snapshot.mockResolvedValue({
      entities: [],
      edges: [],
      isTruncated: false,
    });

    await (
      createEdgeFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), fromId: testId(1), toId: testId(2) },
      context: {},
    });
    await (
      updateEdgeFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10), edgeId: testId(4) },
      context: {},
    });
    await (
      deleteEdgeFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<void>
    )({
      data: { caseId: testId(10), edgeId: testId(4) },
      context: {},
    });
    await (
      getGraphSnapshotFn as unknown as (
        input: ServerDataContext<{ caseId: string }>
      ) => Promise<unknown>
    )({
      data: { caseId: testId(10) },
      context: {},
    });

    expect(edgesApi.create).toHaveBeenCalled();
    expect(edgesApi.update).toHaveBeenCalled();
    expect(edgesApi.delete).toHaveBeenCalled();
    // The Graph page's one capped read, never the Case's whole Connection list.
    expect(graphApi.snapshot).toHaveBeenCalledWith({ caseId: testId(10) });
  });
});
