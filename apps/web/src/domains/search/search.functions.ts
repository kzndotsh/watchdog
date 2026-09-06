import { createServerFn } from "@tanstack/react-start";

import {
  searchCaseInputSchema,
  type SearchCaseResult,
} from "@/domains/search/types";
import { orpcFromContext } from "@/lib/orpc.server";

export const searchCaseFn = createServerFn({ method: "GET" })
  .validator(searchCaseInputSchema)
  .handler(async ({ data, context }): Promise<SearchCaseResult> =>
    orpcFromContext(context).search.case(data)
  );
