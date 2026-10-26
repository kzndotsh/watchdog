import { getCollectItemEffect, listCollectEffect } from "@watchdog/core/jobs";
import { collectList, locateCollectInputSchema } from "@watchdog/schemas/jobs";

import { authed } from "../os";
import { runApp } from "../runtime";
import { collectListPageSchema, collectLocatedSchema } from "../schemas";

/**
 * Collect's queue (`collectList`, ADR-0007): Evidence rows, playbook runs and lone Jobs, each
 * with its member Jobs and Evidence, a page at a time with `total` on the first page. `hidden`
 * lists the Evidence the user hid.
 */
export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/collect",
    summary: "List Collect's queue",
    tags: ["jobs"],
  })
  .input(collectList.input)
  .output(collectListPageSchema)
  .handler(async ({ input, context }) =>
    runApp(listCollectEffect(input.caseId, context.actor.organizationId, input))
  );

/**
 * The queue row an id belongs to: a row id, a member Job's id, or a playbook run whose steps all
 * attached to Evidence. Answers the row and the Job to focus; `not_found` when nothing in the
 * Case matches in the list's mode (`hidden`).
 */
export const get = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/cases/{caseId}/collect/{id}",
    summary: "Get the Collect row an id belongs to",
    tags: ["jobs"],
  })
  .input(locateCollectInputSchema)
  .output(collectLocatedSchema)
  .handler(async ({ input, context }) =>
    runApp(
      getCollectItemEffect(input.caseId, context.actor.organizationId, input)
    )
  );
