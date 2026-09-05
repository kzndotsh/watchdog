import { z } from "zod";

import {
  createIdentifierEffect,
  listIdentifiersForCaseEffect,
  listIdentifiersForEntityEffect,
  updateIdentifierEffect,
} from "@watchdog/core";
import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
} from "@watchdog/schemas";

import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import {
  caseIdentifierSchema,
  identifierSchema,
  userOverrideSchema,
} from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/identifiers",
    summary: "List identifiers for an entity",
    tags: ["identifiers"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
    })
  )
  .output(z.array(identifierSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listIdentifiersForEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId
      )
    )
  );

export const listForCase = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/identifiers",
    summary: "List all identifiers in a case",
    tags: ["identifiers"],
  })
  .input(z.object({ caseId: z.uuid() }))
  .output(z.array(caseIdentifierSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listIdentifiersForCaseEffect(input.caseId, context.actor.organizationId)
    )
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{entityId}/identifiers",
    summary: "Create an identifier",
    tags: ["identifiers"],
    successStatus: 201,
  })
  .input(
    z.object({
      caseId: z.uuid(),
      entityId: z.uuid(),
      type: identifierTypeSchema,
      value: z.string().min(1),
      confidence: confidenceTierSchema,
      platform: z.string().optional(),
      status: identifierStatusSchema.default("unknown"),
      notes: z.string().optional(),
      evidenceIds: z.array(z.uuid()).optional(),
      userOverride: userOverrideSchema,
    })
  )
  .output(identifierSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createIdentifierEffect({
        ...input,
        organizationId: context.actor.organizationId,
      })
    )
  );

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/identifiers/{identifierId}",
    summary: "Update an identifier",
    tags: ["identifiers"],
  })
  .input(
    z.object({
      caseId: z.uuid(),
      identifierId: z.uuid(),
      value: z.string().optional(),
      platform: z.string().optional(),
      type: identifierTypeSchema.optional(),
      status: identifierStatusSchema.optional(),
      confidence: confidenceTierSchema.optional(),
      notes: z.string().optional(),
      evidenceIds: z.array(z.uuid()).optional(),
      userOverride: userOverrideSchema,
    })
  )
  .output(identifierSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateIdentifierEffect({
        ...input,
        organizationId: context.actor.organizationId,
      })
    )
  );
