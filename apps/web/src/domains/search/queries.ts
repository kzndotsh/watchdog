import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { searchCaseFn } from "@/domains/search/search.functions";
import {
  SEARCH_MIN_QUERY_LENGTH,
  type SearchCaseResult,
} from "@/domains/search/types";

export const searchKeys = {
  all: ["search"] as const,
  case: (caseId: string, q: string) =>
    [...searchKeys.all, "case", caseId, q] as const,
};

export function searchCaseQuery(caseId: string, q: string) {
  const trimmed = q.trim();
  return queryOptions({
    queryKey: searchKeys.case(caseId, trimmed),
    queryFn: async (): Promise<SearchCaseResult> =>
      searchCaseFn({ data: { caseId, q: trimmed } }),
    enabled: caseId.length > 0 && trimmed.length >= SEARCH_MIN_QUERY_LENGTH,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
