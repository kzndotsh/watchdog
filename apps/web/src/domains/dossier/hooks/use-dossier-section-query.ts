import {
  useQuery,
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { dataOrEmpty } from "@/domains/dossier/hooks/dossier-shell-query-helpers";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { isQueryPlaceholderData } from "@/shared/lib/query-placeholder";

/** List fetch for dossier tabs with placeholder, pending, and error wiring. */
export function useDossierSectionQuery<
  TItem,
  TError = DefaultError,
  TQueryKey extends QueryKey = QueryKey,
>(options: UseQueryOptions<TItem[], TError, TItem[], TQueryKey>) {
  const query = useQuery(options);
  const enabled = options.enabled !== false;
  const data = dataOrEmpty(query.data);
  const pending = listPending(query, { enabled });

  return {
    data,
    placeholder: isQueryPlaceholderData(query),
    pending,
    loadError: queryLoadError(query, pending, "Failed to load section"),
    retry: () => {
      void query.refetch();
    },
  };
}
