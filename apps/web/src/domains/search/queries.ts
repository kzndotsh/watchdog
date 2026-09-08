import { queryOptions } from "@tanstack/react-query";

import { searchCaseFn } from "@/domains/search/search.functions";
import {
  SEARCH_MIN_QUERY_LENGTH,
  type SearchCaseResult,
} from "@/domains/search/types";
import {
  parseSearchCaseInput,
  scopeSearchCaseInput,
} from "@/shared/lib/query-ingress";
import { placeholderDataForScope } from "@/shared/lib/query-placeholder";

export const searchKeys = {
  all: ["search"] as const,
  case: (caseId: string, q: string) =>
    [...searchKeys.all, "case", caseId, q] as const,
};

export function searchCaseQuery(caseId: string, q: string) {
  const scoped = scopeSearchCaseInput(caseId, q);
  const enabled =
    scoped.caseId.length > 0 && scoped.q.length >= SEARCH_MIN_QUERY_LENGTH;
  return queryOptions({
    queryKey: searchKeys.case(scoped.caseId, scoped.q),
    queryFn: async (): Promise<SearchCaseResult> =>
      searchCaseFn({
        data: parseSearchCaseInput(scoped.caseId, scoped.q),
      }),
    enabled,
    staleTime: 15_000,
    placeholderData: placeholderDataForScope(
      (previousQuery) => previousQuery?.queryKey[2] === scoped.caseId
    ),
  });
}
