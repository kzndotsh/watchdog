import { z } from "zod";

import {
  createEdgeEffect,
  deleteEdgeEffect,
  getEdgesByIdsEffect,
  listEdgesEffect,
  updateEdgeEffect,
} from "@watchdog/core/graph";
import {
  createEdgeInputSchema,
  deleteEdgeInputSchema,
  edgeList,
  getEdgesInputSchema,
  updateEdgeInputSchema,
} from "@watchdog/schemas/graph";

import { graphActorFromContext } from "../actor-label";
import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import {
  caseEdgeSchema,
  edgeListPageSchema,
  edgeSchema,
  userOverrideSchema,
} from "../schemas";

/**
 * The Case's Connection list (`edgeList`, ADR-0007). One Entity's Connections (either end) are this list with
 * `entityId` set; there is no per-Entity route. The handler passes the parsed input through.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/edges",
    summary: "List connections (edges) in a case",
    tags: ["edges"],
  })
  .input(edgeList.input)
  .output(edgeListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(listEdgesEffect(input.caseId, context.actor.organizationId, input))
  );

/** Connections by id (rows not loaded), at most `ARRAY_MAX`; ids outside the Case are left out. */
export const getMany = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/edges/by-ids",
    summary: "Get connections (edges) by id",
    tags: ["edges"],
  })
  .input(getEdgesInputSchema)
  .output(caseEdgeSchema.array())
  .handler(async ({ input, context }) =>
    runApp(
      getEdgesByIdsEffect(input.caseId, context.actor.organizationId, input.ids)
    )
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
        ...graphActorFromContext(context),
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
        ...graphActorFromContext(context),
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
      deleteEdgeEffect(
        input.caseId,
        context.actor.organizationId,
        input.edgeId,
        graphActorFromContext(context)
      )
    );
    return { ok: true as const };
  });
