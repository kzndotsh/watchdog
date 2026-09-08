import { z } from "zod";

import {
  createEdgeEffect,
  deleteEdgeEffect,
  listEdgesForCaseEffect,
  listEdgesForEntityEffect,
  updateEdgeEffect,
} from "@watchdog/core";
import {
  caseScopeInputSchema,
  createEdgeInputSchema,
  deleteEdgeInputSchema,
  entityScopeInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas";

import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import { caseEdgeSchema, edgeSchema, userOverrideSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/edges",
    summary: "List edges for an entity",
    tags: ["edges"],
  })
  .input(entityScopeInputSchema)
  .output(z.array(edgeSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listEdgesForEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId
      )
    )
  );

export const listForCase = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/edges",
    summary: "List all edges in a case",
    tags: ["edges"],
  })
  .input(caseScopeInputSchema)
  .output(z.array(caseEdgeSchema))
  .handler(async ({ input, context }) =>
    runApp(listEdgesForCaseEffect(input.caseId, context.actor.organizationId))
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/edges",
    summary: "Create an edge",
    tags: ["edges"],
    successStatus: 201,
  })
  .input(
    createEdgeInputSchema.extend({
      userOverride: userOverrideSchema,
    })
  )
  .output(edgeSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createEdgeEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
      })
    )
  );

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/edges/{edgeId}",
    summary:
      "Update an edge (endpoints, predicate, notes, confidence, evidence)",
    tags: ["edges"],
  })
  .input(updateEdgeInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(edgeSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateEdgeEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
      })
    )
  );

export const remove = graphChildWrite
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/edges/{edgeId}",
    summary: "Delete an edge",
    tags: ["edges"],
  })
  .input(deleteEdgeInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteEdgeEffect(input.caseId, context.actor.organizationId, input.edgeId)
    );
    return { ok: true as const };
  });
