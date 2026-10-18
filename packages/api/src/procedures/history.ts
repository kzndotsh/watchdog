import { listGraphHistoryEffect } from "@watchdog/core/graph";
import {
  graphHistoryPageSchema,
  listGraphHistoryInputSchema,
} from "@watchdog/schemas/graph";

import { authed } from "../os";
import { runApp } from "../runtime";

export const list = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/history",
    summary: "List the history of one Graph row",
    description:
      "Every create, update, retract and delete of one Entity, Edge, Claim, Identifier, Event, Question or Task, newest first, with who changed it, through which channel, and the row before and after. Pass `nextCursor` as `cursor` for the next page.",
    tags: ["history"],
  })
  .input(listGraphHistoryInputSchema)
  .output(graphHistoryPageSchema)
  .handler(async ({ input, context }) =>
    runApp(listGraphHistoryEffect(context.actor.organizationId, input))
  );
