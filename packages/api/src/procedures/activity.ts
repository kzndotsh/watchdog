import { z } from "zod";

import { listRecentActivityEffect } from "@watchdog/core";
import { listRecentActivityInputSchema } from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import { activityItemSchema } from "../schemas";

export const listRecent = authed
  .route({
    method: "GET",
    path: "/activity/recent",
    summary: "List recent activity across cases",
    tags: ["activity"],
  })
  .input(listRecentActivityInputSchema)
  .output(z.array(activityItemSchema))
  .handler(async ({ input, context }) =>
    runApp(
      listRecentActivityEffect({
        organizationId: context.actor.organizationId,
        caseId: input.caseId,
        limit: input.limit,
      })
    )
  );
