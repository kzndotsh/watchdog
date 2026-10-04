import { createServerFn } from "@tanstack/react-start";

import { orpcFromContext } from "@/lib/orpc.server";
import {
  searchCaseInputSchema,
  type SearchCaseResult,
} from "@watchdog/schemas";

export const searchCaseFn = createServerFn({ method: "GET" })
  .validator(searchCaseInputSchema)
  .handler(async ({ data, context }): Promise<SearchCaseResult> =>
    orpcFromContext(context).search.case(data)
  );
