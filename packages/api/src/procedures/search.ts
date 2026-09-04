import { searchCaseEffect } from "@watchdog/core";
import { searchCaseInputSchema } from "@watchdog/schemas";

import { authed } from "../os";
import { runApp } from "../runtime";
import { searchCaseResultSchema } from "../schemas";

export const searchCaseProc = authed
  .route({
    method: "GET",
    path: "/cases/{caseId}/search",
    summary: "Search Active Case material and Cases by name",
    tags: ["search"],
  })
  .input(searchCaseInputSchema)
  .output(searchCaseResultSchema)
  .handler(async ({ input }) =>
    runApp(
      searchCaseEffect({
        caseId: input.caseId,
        q: input.q,
        limit: input.limit,
      })
    )
  );
