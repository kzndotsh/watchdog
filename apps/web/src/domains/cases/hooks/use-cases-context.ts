import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
  pickDefaultCase,
  readLastCaseId,
  readServerLastCaseId,
  subscribeToLastCase,
} from "@/domains/cases/lib/active-case";
import { visibleCasesQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { useRouteCase } from "@/shared/hooks/use-route-case";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";

const EMPTY_CASES: CaseRecord[] = [];

type UseCasesContextOptions = {
  silentError?: boolean;
};

/** The last Case this browser entered; `null` while hydrating a server render. */
export function useLastCaseId(): string | null {
  return useSyncExternalStore(
    subscribeToLastCase,
    readLastCaseId,
    readServerLastCaseId
  );
}

/**
 * The visible Cases and the Active Case. Under a Case route the Active Case is the URL's Case
 * (so two tabs can hold two Cases); elsewhere it is the last Case this browser entered while it
 * is still visible, else the first visible Case.
 */
export function useCasesContext(options?: UseCasesContextOptions) {
  const query = useQuery({
    ...visibleCasesQuery(),
    meta: options?.silentError ? { silentError: true } : undefined,
  });
  const cases = query.data ?? EMPTY_CASES;
  const routeCase = useRouteCase();
  const lastCaseId = useLastCaseId();

  // The URL's Case, read live from the list (an edit refetches it) with the route's own
  // row as the fallback.
  const active =
    routeCase === null
      ? pickDefaultCase(cases, lastCaseId)
      : (cases.find((row) => row.id === routeCase.id) ?? routeCase);

  const pending = listPending(query);
  return {
    cases,
    active,
    pending,
    loadError: queryLoadError(query, pending, "Failed to load cases"),
    retry: () => {
      void query.refetch();
    },
    placeholder: query.isPlaceholderData,
  };
}
