import { listRecentActivityEffect } from "@watchdog/core/feed";
import { activityList } from "@watchdog/schemas/feed";

import { authed } from "../os";
import { runApp } from "../runtime";
import { activityPageSchema } from "../schemas";

export const listRecent = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/activity/recent",
    summary:
      "List recent activity across cases, newest first, a page at a time; one entry per playbook run, optionally for one case",
    tags: ["activity"],
  })
  .input(activityList.input)
  .output(activityPageSchema)
  .handler(async ({ input, context }) =>
    runApp(
      listRecentActivityEffect({
        organizationId: context.actor.organizationId,
        input,
      })
    )
  );
