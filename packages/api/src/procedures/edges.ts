import { z } from "zod";

import {
  createEdgeEffect,
  deleteEdgeEffect,
  listEdgesForCaseEffect,
  listEdgesForEntityEffect,
  updateEdgeEffect,
} from "@watchdog/core";
import { confidenceTierSchema, edgePredicateSchema } from "@watchdog/schemas";

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
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
    })
  )
  .output(z.array(edgeSchema))
  .handler(async ({ input }) =>
    runApp(listEdgesForEntityEffect(input.caseId, input.entityId))
  );

export const listForCase = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/edges",
    summary: "List all edges in a case",
    tags: ["edges"],
  })
  .input(z.object({ caseId: z.uuid() }))
  .output(z.array(caseEdgeSchema))
  .handler(async ({ input }) => runApp(listEdgesForCaseEffect(input.caseId)));

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/edges",
    summary: "Create an edge",
    tags: ["edges"],
    successStatus: 201,
  })
  .input(
    z.object({
      caseId: z.uuid(),
      fromId: z.uuid(),
      toId: z.uuid(),
      predicate: edgePredicateSchema,
      confidence: confidenceTierSchema,
      notes: z.string().optional(),
      evidenceIds: z.array(z.uuid()).optional(),
      viewEntityId: z.uuid().optional(),
      userOverride: userOverrideSchema,
    })
  )
  .output(edgeSchema)
  .handler(async ({ input }) => runApp(createEdgeEffect(input)));

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/edges/{edgeId}",
    summary:
      "Update an edge (endpoints, predicate, notes, confidence, evidence)",
    tags: ["edges"],
  })
  .input(
    z
      .object({
        caseId: z.uuid(),
        edgeId: z.uuid(),
        viewEntityId: z.uuid().optional(),
        fromId: z.uuid().optional(),
        toId: z.uuid().optional(),
        predicate: edgePredicateSchema.optional(),
        confidence: confidenceTierSchema.optional(),
        notes: z.string().optional(),
        evidenceIds: z.array(z.uuid()).optional(),
        userOverride: userOverrideSchema,
      })
      .refine(
        (v) =>
          (v.fromId === undefined && v.toId === undefined) ||
          (v.fromId !== undefined && v.toId !== undefined),
        { message: "fromId and toId must be sent together" }
      )
  )
  .output(edgeSchema)
  .handler(async ({ input }) => runApp(updateEdgeEffect(input)));

export const remove = graphChildWrite
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/edges/{edgeId}",
    summary: "Delete an edge",
    tags: ["edges"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      edgeId: z.uuid(),
      userOverride: userOverrideSchema,
    })
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input }) => {
    await runApp(deleteEdgeEffect(input.caseId, input.edgeId));
    return { ok: true as const };
  });
