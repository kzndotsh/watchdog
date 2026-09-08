import { queryOptions } from "@tanstack/react-query";

import { listTasksFn } from "@/domains/tasks/tasks.functions";
import type { TaskFiltersInput } from "@/domains/tasks/types";
import {
  parseTaskFiltersInput,
  scopeTaskListEnabled,
  scopeTaskListFilters,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export type TaskListFilters = Omit<TaskFiltersInput, "caseId">;

export const tasksKeys = {
  all: (caseId: string) => ["tasks", caseId] as const,
  list: (caseId: string, filters?: TaskListFilters) =>
    ["tasks", caseId, filters ?? {}] as const,
};

export const tasksListQuery = (caseId: string, filters?: TaskListFilters) => {
  const { scopedCaseId, filters: scopedFilters } = scopeTaskListFilters(
    caseId,
    filters
  );
  const queryKey = tasksKeys.list(scopedCaseId, scopedFilters);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listTasksFn({
        data: parseTaskFiltersInput(scopedCaseId, scopedFilters),
      }),
    enabled: scopeTaskListEnabled(caseId, filters),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
