import { z } from "zod";

import {
  createIdentifierEffect,
  deleteIdentifierEffect,
  getIdentifiersByIdsEffect,
  listIdentifiersEffect,
  updateIdentifierEffect,
} from "@watchdog/core/graph";
import {
  createIdentifierInputSchema,
  deleteIdentifierInputSchema,
  getIdentifiersInputSchema,
  identifierList,
  updateIdentifierInputSchema,
} from "@watchdog/schemas/graph";
import { ARRAY_MAX, boundedListSchema } from "@watchdog/schemas/shared";

import { graphActorFromContext } from "../actor-label";
import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import {
  identifierSchema,
  userOverrideSchema,
  caseIdentifierSchema,
  identifierListPageSchema,
} from "../schemas";

/**
 * The Case's Identifier list (`identifierList`, ADR-0007). One Entity's Identifiers are this list
 * with `entityId` set; there is no per-Entity route. The handler passes the parsed input through.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/identifiers",
    summary: "List identifiers in a case",
    tags: ["identifiers"],
  })
  .input(identifierList.input)
  .output(identifierListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listIdentifiersEffect(input.caseId, context.actor.organizationId, input)
    )
  );

/** Identifiers by id (rows not loaded), at most `ARRAY_MAX`; ids outside the Case are left out. */
export const getMany = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/identifiers/by-ids",
    summary: "Get identifiers by id",
    tags: ["identifiers"],
  })
  .input(getIdentifiersInputSchema)
  .output(boundedListSchema(caseIdentifierSchema, ARRAY_MAX))
  .handler(async ({ input, context }) =>
    runApp(
      getIdentifiersByIdsEffect(
        input.caseId,
        context.actor.organizationId,
        input.ids
      )
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
    createIdentifierInputSchema.extend({ userOverride: userOverrideSchema })
  )
  .output(identifierSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createIdentifierEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
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
    updateIdentifierInputSchema.extend({ userOverride: userOverrideSchema })
  )
  .output(identifierSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateIdentifierEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
        ...graphActorFromContext(context),
      })
    )
  );

export const remove = graphChildWrite
  .route({
    method: "DELETE",
    path: "/cases/{caseId}/identifiers/{identifierId}",
    summary: "Delete an identifier",
    tags: ["identifiers"],
  })
  .input(
    deleteIdentifierInputSchema.extend({ userOverride: userOverrideSchema })
  )
  .output(z.object({ ok: z.literal(true) }))
  .handler(async ({ input, context }) => {
    await runApp(
      deleteIdentifierEffect(
        input.caseId,
        context.actor.organizationId,
        input.identifierId,
        graphActorFromContext(context)
      )
    );
    return { ok: true as const };
  });
