import { createServerFn } from "@tanstack/react-start";

import type { EdgeRecord, GraphSnapshot } from "@/domains/entities/edges/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  caseScopeInputSchema,
  createEdgeInputSchema,
  edgeScopeInputSchema,
  entityScopeInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas/graph";

export type { EdgeRecord } from "@/domains/entities/edges/types";

export const listEdgesFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<EdgeRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).edges.list({
        caseId: data.caseId,
        entityId: data.entityId,
        ...page,
      })
    )
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
