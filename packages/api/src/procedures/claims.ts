import { z } from "zod";

import {
  createClaimEffect,
  listClaimsForEntityEffect,
  retractClaimEffect,
  updateClaimEffect,
} from "@watchdog/core";
import {
  createClaimInputSchema,
  listClaimsInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas";

import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import { claimSchema, userOverrideSchema } from "../schemas";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/entities/{entityId}/claims",
    summary: "List claims for an entity",
    tags: ["claims"],
  })
  .input(listClaimsInputSchema)
  .output(z.array(claimSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listClaimsForEntityEffect(
        input.caseId,
        context.actor.organizationId,
        input.entityId,
        {
          includeRetracted: input.includeRetracted,
        }
      )
    )
  );

export const create = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/entities/{entityId}/claims",
    summary: "Create a claim",
    tags: ["claims"],
    successStatus: 201,
  })
  .input(createClaimInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(claimSchema)
  .handler(async ({ input, context }) =>
    runApp(
      createClaimEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
      })
    )
  );

export const update = graphChildWrite
  .route({
    method: "PATCH",
    path: "/cases/{caseId}/claims/{claimId}",
    summary: "Update a claim",
    tags: ["claims"],
  })
  .input(updateClaimInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(claimSchema)
  .handler(async ({ input, context }) =>
    runApp(
      updateClaimEffect({
        ...withoutUserOverride(input),
        organizationId: context.actor.organizationId,
      })
    )
  );

export const retract = graphChildWrite
  .route({
    method: "POST",
    path: "/cases/{caseId}/claims/{claimId}/retract",
    summary: "Retract a claim",
    tags: ["claims"],
  })
  .input(retractClaimInputSchema.extend({ userOverride: userOverrideSchema }))
  .output(claimSchema)
  .handler(async ({ input, context }) =>
    runApp(
      retractClaimEffect(
        {
          ...withoutUserOverride(input),
          organizationId: context.actor.organizationId,
        },
        context.actor.userId
      )
    )
  );
