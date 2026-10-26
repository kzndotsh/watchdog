import {
  createClaimEffect,
  listClaimsEffect,
  retractClaimEffect,
  updateClaimEffect,
} from "@watchdog/core/graph";
import {
  claimList,
  createClaimInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas/graph";

import { graphActorFromContext } from "../actor-label";
import { withoutUserOverride } from "../graph-input";
import { authed, graphChildWrite } from "../os";
import { runApp } from "../runtime";
import {
  claimListPageSchema,
  claimSchema,
  userOverrideSchema,
} from "../schemas";

/**
 * The Case's Claim list (`claimList`, ADR-0007). One Entity's Claims are this list with
 * `entityId` set; there is no per-Entity route. The handler passes the parsed input through.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/claims",
    summary: "List claims in a case",
    tags: ["claims"],
  })
  .input(claimList.input)
  .output(claimListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(listClaimsEffect(input.caseId, context.actor.organizationId, input))
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
        ...graphActorFromContext(context),
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
        ...graphActorFromContext(context),
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
          actorLabel: graphActorFromContext(context).actorLabel,
          actorKeyId: graphActorFromContext(context).actorKeyId,
        },
        context.actor.userId
      )
    )
  );
