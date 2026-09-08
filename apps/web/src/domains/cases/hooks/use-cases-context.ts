import { useQuery } from "@tanstack/react-query";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";

const EMPTY_CASES: CaseRecord[] = [];

interface UseCasesContextOptions {
  silentError?: boolean;
}

/** Active case + case list from the cases context query. */
export function useCasesContext(options?: UseCasesContextOptions) {
  const query = useQuery({
    ...casesContextQuery(),
    meta: options?.silentError ? { silentError: true } : undefined,
  });
  const casesCtx = query.data;

  const pending = listPending(query);
  return {
    casesCtx,
    cases: casesCtx?.cases ?? EMPTY_CASES,
    active: casesCtx?.active ?? null,
    pending,
    loadError: queryLoadError(query, pending, "Failed to load cases"),
    retry: () => {
      void query.refetch();
    },
    placeholder: query.isPlaceholderData,
  };
}
