import { createServerFn } from "@tanstack/react-start";

import {
  caseScopeInputSchema,
  createEdgeInputSchema,
  edgeScopeInputSchema,
  entityScopeInputSchema,
  updateEdgeInputSchema,
  type CaseEdgeRecord,
  type EdgeRecord,
} from "@/domains/entities/edges/types";
import { orpcFromContext } from "@/lib/orpc.server";

export type {
  CaseEdgeRecord,
  EdgeRecord,
} from "@/domains/entities/edges/types";

export const listEdgesFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<EdgeRecord[]> =>
    orpcFromContext(context).edges.list({
      caseId: data.caseId,
      entityId: data.entityId,
    })
  );

export const listEdgesForCaseFn = createServerFn({ method: "GET" })
  .validator(caseScopeInputSchema)
  .handler(async ({ data, context }): Promise<CaseEdgeRecord[]> =>
    orpcFromContext(context).edges.listForCase({
      caseId: data.caseId,
    })
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
