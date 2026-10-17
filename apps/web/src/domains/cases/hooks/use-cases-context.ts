import { useQuery } from "@tanstack/react-query";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { useRouteCase } from "@/shared/hooks/use-route-case";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";

const EMPTY_CASES: CaseRecord[] = [];

type UseCasesContextOptions = {
  silentError?: boolean;
};

/**
 * Active Case + case list from the cases context query. Under a Case route the Active
 * Case is the URL's Case (so two tabs can hold two Cases); elsewhere it is the cookie's.
 */
export function useCasesContext(options?: UseCasesContextOptions) {
  const query = useQuery({
    ...casesContextQuery(),
    meta: options?.silentError ? { silentError: true } : undefined,
  });
  const casesCtx = query.data;
  const routeCase = useRouteCase();

  // The URL's Case, read live from the list (an edit refetches it) with the route's own
  // row as the fallback; else the cookie's.
  const active =
    routeCase === null
      ? (casesCtx?.active ?? null)
      : (casesCtx?.cases.find((row) => row.id === routeCase.id) ?? routeCase);

  const pending = listPending(query);
  return {
    casesCtx,
    cases: casesCtx?.cases ?? EMPTY_CASES,
    active,
    pending,
    loadError: queryLoadError(query, pending, "Failed to load cases"),
    retry: () => {
      void query.refetch();
    },
    placeholder: query.isPlaceholderData,
  };
}
