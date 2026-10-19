import { listRecentActivityEffect } from "@watchdog/core/activity";
import {
  listRecentActivityInputSchema,
  activityItemSchema,
} from "@watchdog/schemas/feed";
import { pageSchema } from "@watchdog/schemas/shared";

import { authed } from "../os";
import { runApp } from "../runtime";

export const listRecent = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/activity/recent",
    summary: "List recent activity across cases",
    tags: ["activity"],
  })
  .input(listRecentActivityInputSchema)
  .output(pageSchema(activityItemSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listRecentActivityEffect({
        organizationId: context.actor.organizationId,
        caseId: input.caseId,
        cursor: input.cursor,
        limit: input.limit,
      })
    )
  );
