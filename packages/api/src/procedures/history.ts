import {
  graphRowAttributionEffect,
  listGraphHistoryEffect,
} from "@watchdog/core/graph";
import {
  graphHistoryAttributionSchema,
  graphHistoryList,
  graphHistoryRowInputSchema,
} from "@watchdog/schemas/graph";

import { authed } from "../os";
import { runApp } from "../runtime";
import { graphHistoryPageSchema } from "../schemas";

export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/history",
    summary: "List the history of one Graph row",
    description:
      "Every create, update, retract and delete of one Entity, Edge, Claim, Identifier, Event, Question or Task, newest first, with who changed it, through which channel, and the row before and after. Pass `nextCursor` as `cursor` for the next page.",
    tags: ["history"],
  })
  .input(graphHistoryList.input)
  .output(graphHistoryPageSchema)
  .handler(async ({ input, context }) =>
    runApp(listGraphHistoryEffect(context.actor.organizationId, input))
  );

export const attribution = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/history/attribution",
    summary: "Who created and last changed one Graph row",
    description:
      "The live row's authorship as display names; null once the row is deleted (its history stays).",
    tags: ["history"],
  })
  .input(graphHistoryRowInputSchema)
  .output(graphHistoryAttributionSchema.nullable())
  .handler(async ({ input, context }) =>
    runApp(graphRowAttributionEffect(context.actor.organizationId, input))
  );
