import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { listTasksFn } from "@/domains/tasks/tasks.functions";
import type { TaskFiltersInput } from "@/domains/tasks/types";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export type TaskListFilters = Omit<TaskFiltersInput, "caseId">;

export const tasksKeys = {
  all: (caseId: string) => ["tasks", caseId] as const,
  list: (caseId: string, filters?: TaskListFilters) =>
    ["tasks", caseId, filters ?? {}] as const,
};

export const tasksListQuery = (caseId: string, filters?: TaskListFilters) =>
  queryOptions({
    queryKey: tasksKeys.list(caseId, filters),
    queryFn: async () =>
      listTasksFn({
        data: {
          caseId,
          ...filters,
        },
      }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: keepPreviousData,
  });
