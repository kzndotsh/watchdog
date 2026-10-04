import { searchCaseEffect } from "@watchdog/core/search";
import {
  searchCaseInputSchema,
  searchCaseResultSchema,
} from "@watchdog/schemas/cases";

import { authed } from "../os";
import { runApp } from "../runtime";

export const searchCaseProc = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/search",
    summary: "Search Active Case material and Cases by name",
    tags: ["search"],
  })
  .input(searchCaseInputSchema)
  .output(searchCaseResultSchema)
  .handler(async ({ input, context }) =>
    runApp(
      searchCaseEffect({
        caseId: input.caseId,
        organizationId: context.actor.organizationId,
        q: input.q,
        ...(input.limit === undefined ? {} : { perGroup: input.limit }),
      })
    )
  );
