import { queryOptions } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc-client";
import { orpcKeyInputField } from "@/shared/lib/orpc-key-input";
import {
  parseSearchCaseInput,
  scopeSearchCaseInput,
} from "@/shared/lib/query-ingress";
import { placeholderDataForScope } from "@/shared/lib/query-placeholder";
import {
  SEARCH_MIN_QUERY_LENGTH,
  type SearchCaseResult,
} from "@watchdog/schemas/cases";

/** Search keys are the oRPC procedure keys: `all` is every `search.*` query. */
export const searchKeys = {
  all: orpc.search.key(),
  case: (caseId: string, q: string) =>
    orpc.search.case.queryKey({ input: { caseId, q } }),
};

export function searchCaseQuery(caseId: string, q: string) {
  const scoped = scopeSearchCaseInput(caseId, q);
  const enabled =
    scoped.caseId.length > 0 && scoped.q.length >= SEARCH_MIN_QUERY_LENGTH;
  return queryOptions({
    queryKey: searchKeys.case(scoped.caseId, scoped.q),
    queryFn: async (): Promise<SearchCaseResult> =>
      orpc.search.case.call(parseSearchCaseInput(scoped.caseId, scoped.q)),
    enabled,
    staleTime: 15_000,
    placeholderData: placeholderDataForScope(
      (previousQuery) =>
        orpcKeyInputField(previousQuery?.queryKey, "caseId") === scoped.caseId
    ),
  });
}
