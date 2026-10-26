import { createServerFn } from "@tanstack/react-start";

import type {
  CaseEdgeRecord,
  EdgeRecord,
  GraphEgo,
  GraphSnapshot,
} from "@/domains/entities/edges/types";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  caseScopeInputSchema,
  createEdgeInputSchema,
  edgeList,
  edgeScopeInputSchema,
  entityScopeInputSchema,
  getEdgesInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

export type { EdgeRecord } from "@/domains/entities/edges/types";

/**
 * One page of the Case's Connection list (`edgeList`, ADR-0007): the declared filters, `q`, sort
 * and cursor pass through whole. One Entity's Connections are this list with `entityId` set.
 */
export const listEdgesPageFn = createServerFn({ method: "GET" })
  .validator(edgeList.input)
  .handler(async ({ data, context }): Promise<ListPage<CaseEdgeRecord>> =>
    orpcFromContext(context).edges.list(data)
  );

/** Connections by id (one the ego graph draws but the list has not loaded). */
export const getEdgesFn = createServerFn({ method: "GET" })
  .validator(getEdgesInputSchema)
  .handler(async ({ data, context }): Promise<CaseEdgeRecord[]> =>
    orpcFromContext(context).edges.getMany(data)
  );

/** The Dossier ego graph's capped read (#585): at most `GRAPH_EGO_EDGE_MAX` Connections. */
export const getGraphEgoFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<GraphEgo> =>
    orpcFromContext(context).graph.ego(data)
  );

/** The Graph page's capped snapshot (#570): one request, never the Case's whole lists. */
export const getGraphSnapshotFn = createServerFn({ method: "GET" })
  .validator(caseScopeInputSchema)
  .handler(async ({ data, context }): Promise<GraphSnapshot> =>
    orpcFromContext(context).graph.snapshot(data)
  );

export const createEdgeFn = createServerFn({ method: "POST" })
  .validator(createEdgeInputSchema)
  .handler(async ({ data, context }): Promise<EdgeRecord> =>
    orpcFromContext(context).edges.create(data)
  );

export const updateEdgeFn = createServerFn({ method: "POST" })
  .validator(updateEdgeInputSchema)
  .handler(async ({ data, context }): Promise<EdgeRecord> =>
    orpcFromContext(context).edges.update(data)
  );

export const deleteEdgeFn = createServerFn({ method: "POST" })
  .validator(edgeScopeInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).edges.delete(data);
  });
